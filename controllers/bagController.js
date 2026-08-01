/**
 * bagController.js
 * ----------------
 * Handles creating, viewing, editing, and cancelling surprise bags.
 *
 * Key rule enforced throughout: a bag can only be edited or cancelled
 * BEFORE it has any reservations (quantityReserved === 0). Once someone
 * has reserved a unit, the listing is locked to protect that customer
 * from a bait-and-switch (e.g. the business quietly raising the price
 * or shortening the pickup window after payment).
 */

const SurpriseBag = require('../models/surpriseBagModel');
const Business = require('../models/businessModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

// Fields an owner may change via PATCH — deliberately excludes `business`,
// `quantityReserved`, and `status`, which must only ever change through
// dedicated flows (reservations in Step 7, cron expiry in Step 10, or
// the cancel endpoint below).
const EDITABLE_FIELDS = [
  'title',
  'description',
  'sampleImageUrl',
  'category',
  'originalPrice',
  'discountedPrice',
  'quantityAvailable',
  'pickupWindowStart',
  'pickupWindowEnd',
];

const SORTABLE_FIELDS = {
  distance: { distanceInMeters: 1 },
  price: { discountedPrice: 1 },
  'expiring-soon': { timeRemainingSeconds: 1 },
};

/**
 * GET /api/v1/bags/nearby?lat=..&lng=..&radius=..&category=..&maxPrice=..&sort=..
 *
 * Finds active, still-available, not-yet-expired surprise bags near a
 * given point, sorted by distance, price, or urgency.
 *
 * WHY THE PIPELINE STARTS FROM Business, NOT SurpriseBag:
 * `$geoNear` MUST be the very first stage of an aggregation, and it can
 * only run against a collection that actually has the geospatial index —
 * that's Business.location, not SurpriseBag (bags have no location of
 * their own; see the note in surpriseBagModel.js). So we run $geoNear on
 * Business first (which also gives us the exact distance for free), then
 * $lookup into the surprisebags collection to pull in each business's
 * matching bags, and finally flatten + reshape the result so each item
 * in the response IS a bag (with its business info nested inside) —
 * matching what the endpoint's name and URL (/bags/nearby) promise.
 */
exports.getNearbyBags = catchAsync(async (req, res, next) => {
  const { lat, lng, radius, category, maxPrice, sort } = req.query;

  if (lat === undefined || lng === undefined) {
    return next(new AppError('lat and lng query parameters are required', 400));
  }

  const latitude = Number(lat);
  const longitude = Number(lng);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return next(new AppError('lat and lng must be valid numbers', 400));
  }

  // Radius is in METERS (matching the unit we return distances in below),
  // defaulting to 5000m (5km) if not specified.
  const radiusInMeters = radius !== undefined ? Number(radius) : 5000;
  if (Number.isNaN(radiusInMeters) || radiusInMeters <= 0) {
    return next(new AppError('radius must be a positive number (in meters)', 400));
  }

  const sortKey = sort || 'distance';
  if (!SORTABLE_FIELDS[sortKey]) {
    return next(new AppError('sort must be one of: distance, price, expiring-soon', 400));
  }

  const now = new Date();

  // Extra $match stages applied INSIDE the $lookup pipeline (i.e. against
  // SurpriseBag documents), built conditionally based on which optional
  // filters were actually provided.
  const bagFilterStages = [
    // Only bags belonging to the business currently being processed by $geoNear
    { $match: { $expr: { $eq: ['$business', '$$businessId'] } } },
    // Core availability rules requested: active, not sold out, not expired
    {
      $match: {
        status: 'active',
        pickupWindowEnd: { $gt: now },
      },
    },
    // quantityAvailable > quantityReserved needs $expr since it compares two fields
    { $match: { $expr: { $gt: ['$quantityAvailable', '$quantityReserved'] } } },
  ];

  if (category) {
    bagFilterStages.push({ $match: { category } });
  }
  if (maxPrice !== undefined) {
    const maxPriceNum = Number(maxPrice);
    if (Number.isNaN(maxPriceNum)) {
      return next(new AppError('maxPrice must be a valid number', 400));
    }
    bagFilterStages.push({ $match: { discountedPrice: { $lte: maxPriceNum } } });
  }

  const results = await Business.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [longitude, latitude] },
        distanceField: 'distanceInMeters', // added to each output doc, in meters (spherical: true)
        maxDistance: radiusInMeters,
        spherical: true,
        // Only search businesses that are actually approved — a
        // pending/suspended business's bags should never surface here,
        // even if (due to a bug elsewhere) one somehow existed.
        query: { status: 'approved' },
      },
    },
    {
      $lookup: {
        from: 'surprisebags', // Mongoose's auto-generated collection name for the SurpriseBag model
        let: { businessId: '$_id' },
        pipeline: bagFilterStages,
        as: 'matchingBags',
      },
    },
    // Turn each business-with-an-array-of-bags into one output document
    // per bag (a business with 3 matching bags becomes 3 separate results)
    { $unwind: '$matchingBags' },
    {
      $addFields: {
        'matchingBags.timeRemainingSeconds': {
          $max: [0, { $divide: [{ $subtract: ['$matchingBags.pickupWindowEnd', now] }, 1000] }],
        },
        distanceInMeters: { $round: ['$distanceInMeters', 0] },
      },
    },
    {
      $project: {
        _id: '$matchingBags._id',
        title: '$matchingBags.title',
        description: '$matchingBags.description',
        sampleImageUrl: '$matchingBags.sampleImageUrl',
        category: '$matchingBags.category',
        originalPrice: '$matchingBags.originalPrice',
        discountedPrice: '$matchingBags.discountedPrice',
        quantityAvailable: '$matchingBags.quantityAvailable',
        quantityReserved: '$matchingBags.quantityReserved',
        pickupWindowStart: '$matchingBags.pickupWindowStart',
        pickupWindowEnd: '$matchingBags.pickupWindowEnd',
        status: '$matchingBags.status',
        createdAt: '$matchingBags.createdAt',
        distanceInMeters: 1,
        timeRemainingSeconds: '$matchingBags.timeRemainingSeconds',
        business: {
          _id: '$_id',
          name: '$name',
          category: '$category',
          address: '$address',
          rating: '$rating',
          location: '$location',
        },
      },
    },
    { $sort: SORTABLE_FIELDS[sortKey] },
  ]);

  res.status(200).json({
    status: 'success',
    results: results.length,
    data: { bags: results },
  });
});

/**
 * POST /api/v1/bags
 * Requires: protect + requireApprovedBusiness() (see routes/bagRoutes.js),
 * which already loaded the business into `req.business` and confirmed
 * its status is 'approved'. Here we only need to additionally confirm
 * that the CURRENT user actually owns that business.
 */
exports.createBag = catchAsync(async (req, res, next) => {
  const {
    title,
    description,
    sampleImageUrl,
    category,
    originalPrice,
    discountedPrice,
    quantityAvailable,
    pickupWindowStart,
    pickupWindowEnd,
  } = req.body;

  if (
    !title ||
    !category ||
    originalPrice === undefined ||
    discountedPrice === undefined ||
    quantityAvailable === undefined ||
    !pickupWindowStart ||
    !pickupWindowEnd
  ) {
    return next(
      new AppError(
        'title, category, originalPrice, discountedPrice, quantityAvailable, pickupWindowStart, and pickupWindowEnd are required',
        400
      )
    );
  }

  // req.business was already fetched and approval-checked by
  // requireApprovedBusiness() — we just need to confirm ownership
  if (req.business.ownerUser.toString() !== req.user._id.toString()) {
    return next(new AppError('You do not have permission to publish bags for this business', 403));
  }

  const bag = await SurpriseBag.create({
    business: req.business._id,
    title,
    description,
    sampleImageUrl,
    category,
    originalPrice,
    discountedPrice,
    quantityAvailable,
    pickupWindowStart,
    pickupWindowEnd,
  });

  res.status(201).json({
    status: 'success',
    data: { bag },
  });
});

/**
 * GET /api/v1/bags/:id
 * Publicly viewable — no login required. Populates a small slice of
 * the business's public info so the frontend can show "picked up from
 * <business name>" without a second request.
 */
exports.getBag = catchAsync(async (req, res, next) => {
  const bag = await SurpriseBag.findById(req.params.id).populate(
    'business',
    'name category address location rating'
  );

  if (!bag) {
    return next(new AppError('No surprise bag found with that id', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { bag },
  });
});

/**
 * PATCH /api/v1/bags/:id
 * Owner-only, and only allowed while quantityReserved === 0.
 */
exports.updateBag = catchAsync(async (req, res, next) => {
  const bag = await SurpriseBag.findById(req.params.id).populate('business', 'ownerUser');

  if (!bag) {
    return next(new AppError('No surprise bag found with that id', 404));
  }

  if (bag.business.ownerUser.toString() !== req.user._id.toString()) {
    return next(new AppError('You do not have permission to edit this bag', 403));
  }

  if (bag.quantityReserved > 0) {
    return next(
      new AppError('This bag already has reservations and can no longer be edited', 400)
    );
  }

  // Only copy over whitelisted fields — mutating the fetched document
  // (rather than using findByIdAndUpdate) is what lets our custom
  // Mongoose validators (discountedPrice < originalPrice, etc.) run
  // correctly on .save() below.
  EDITABLE_FIELDS.forEach((field) => {
    if (req.body[field] !== undefined) {
      bag[field] = req.body[field];
    }
  });

  await bag.save();

  res.status(200).json({
    status: 'success',
    data: { bag },
  });
});

/**
 * DELETE /api/v1/bags/:id
 * Owner-only, and only allowed while quantityReserved === 0. This is a
 * soft-delete: the document is kept with status='cancelled' rather than
 * actually removed, preserving history for the business's own dashboard
 * (Step 13) and platform-wide stats (Step 14).
 */
exports.cancelBag = catchAsync(async (req, res, next) => {
  const bag = await SurpriseBag.findById(req.params.id).populate('business', 'ownerUser');

  if (!bag) {
    return next(new AppError('No surprise bag found with that id', 404));
  }

  if (bag.business.ownerUser.toString() !== req.user._id.toString()) {
    return next(new AppError('You do not have permission to cancel this bag', 403));
  }

  if (bag.quantityReserved > 0) {
    return next(
      new AppError('This bag already has reservations and can no longer be cancelled', 400)
    );
  }

  bag.status = 'cancelled';
  await bag.save();

  res.status(200).json({
    status: 'success',
    data: { bag },
  });
});
