/**
 * businessController.js
 * ----------------------
 * Handles business registration, viewing, editing, document uploads,
 * and (Step 13) dashboard stats.
 *
 * Design decision (discussed with the user before implementing):
 * Rather than requiring a user to already have role='business' before
 * they can register a business, ANY logged-in user can create a
 * business. On successful creation, we automatically promote their
 * User.role to 'business'. Each user may own at most one business
 * (checked here at the application level, not via a DB unique index).
 */

const User = require('../models/userModel');
const Business = require('../models/businessModel');
const Order = require('../models/orderModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

// Fields a business owner is allowed to change via PATCH.
const EDITABLE_FIELDS = ['name', 'category', 'address', 'location', 'operatingHours', 'economicCode'];

/**
 * Strips sensitive fields (nationalId, economicCode, documents) from a
 * business before sending it to anyone who isn't the owner or an admin.
 */
const sanitizeForPublicView = (business, requestingUser) => {
  const isOwner = requestingUser && business.ownerUser.toString() === requestingUser._id.toString();
  const isAdmin = requestingUser && requestingUser.role === 'admin';

  if (isOwner || isAdmin) {
    return business;
  }

  const publicBusiness = business.toObject();
  delete publicBusiness.nationalId;
  delete publicBusiness.economicCode;
  delete publicBusiness.documents;
  return publicBusiness;
};

/**
 * POST /api/v1/businesses
 */
exports.createBusiness = catchAsync(async (req, res, next) => {
  const { name, category, address, longitude, latitude, nationalId, economicCode, operatingHours } =
    req.body;

  if (!name || !category || !address || !nationalId) {
    return next(
      new AppError('name, category, address, and nationalId are required', 400)
    );
  }
  if (longitude === undefined || latitude === undefined) {
    return next(new AppError('longitude and latitude are required', 400));
  }

  const existingBusiness = await Business.findOne({ ownerUser: req.user._id });
  if (existingBusiness) {
    return next(new AppError('You already have a registered business', 409));
  }

  const business = await Business.create({
    ownerUser: req.user._id,
    name,
    category,
    address,
    location: {
      type: 'Point',
      coordinates: [Number(longitude), Number(latitude)],
    },
    nationalId,
    economicCode,
    operatingHours,
  });

  req.user.role = 'business';
  await User.findByIdAndUpdate(req.user._id, { role: 'business' });

  res.status(201).json({
    status: 'success',
    data: { business },
  });
});

/**
 * GET /api/v1/businesses/:id
 */
exports.getBusiness = catchAsync(async (req, res, next) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    return next(new AppError('No business found with that id', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { business: sanitizeForPublicView(business, req.user) },
  });
});

/**
 * PATCH /api/v1/businesses/:id
 */
exports.updateBusiness = catchAsync(async (req, res, next) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    return next(new AppError('No business found with that id', 404));
  }

  if (business.ownerUser.toString() !== req.user._id.toString()) {
    return next(new AppError('You do not have permission to edit this business', 403));
  }

  EDITABLE_FIELDS.forEach((field) => {
    if (req.body[field] !== undefined) {
      business[field] = req.body[field];
    }
  });

  if (req.body.longitude !== undefined && req.body.latitude !== undefined) {
    business.location = {
      type: 'Point',
      coordinates: [Number(req.body.longitude), Number(req.body.latitude)],
    };
  }

  await business.save();

  res.status(200).json({
    status: 'success',
    data: { business },
  });
});

/**
 * POST /api/v1/businesses/:id/documents
 */
exports.uploadDocuments = catchAsync(async (req, res, next) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    return next(new AppError('No business found with that id', 404));
  }

  if (business.ownerUser.toString() !== req.user._id.toString()) {
    return next(new AppError('You do not have permission to upload documents for this business', 403));
  }

  if (!req.files || req.files.length === 0) {
    return next(new AppError('Please upload at least one document', 400));
  }

  const newDocumentUrls = req.files.map((file) => `/uploads/business-documents/${file.filename}`);

  business.documents.push(...newDocumentUrls);
  await business.save();

  res.status(200).json({
    status: 'success',
    data: { business },
  });
});

/**
 * GET /api/v1/businesses/:id/dashboard-stats?period=week|month
 * [Step 13] Owner or admin only.
 *
 * `totalBagsSold`/`totalRevenue` are PERIOD-scoped (only orders picked
 * up within the selected window). `totalMealsSaved` is a LIFETIME
 * total for the business, not reset by the period filter.
 */
exports.getDashboardStats = catchAsync(async (req, res, next) => {
  const business = await Business.findById(req.params.id);
  if (!business) {
    return next(new AppError('No business found with that id', 404));
  }

  const isOwner = business.ownerUser.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) {
    return next(new AppError('You do not have permission to view this dashboard', 403));
  }

  const period = req.query.period === 'month' ? 'month' : 'week';
  const days = period === 'month' ? 30 : 7;
  const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const periodTotals = await Order.aggregate([
    {
      $match: {
        business: business._id,
        status: 'pickedUp',
        pickedUpAt: { $gte: periodStart },
      },
    },
    {
      $group: {
        _id: null,
        totalBagsSold: { $sum: '$quantity' },
        totalRevenue: { $sum: '$totalPrice' },
      },
    },
  ]);

  const dailyChart = await Order.aggregate([
    {
      $match: {
        business: business._id,
        status: 'pickedUp',
        pickedUpAt: { $gte: periodStart },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$pickedUpAt' } },
        count: { $sum: '$quantity' },
        revenue: { $sum: '$totalPrice' },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: '$_id', count: 1, revenue: 1 } },
  ]);

  const lifetimeTotals = await Order.aggregate([
    { $match: { business: business._id, status: 'pickedUp' } },
    { $group: { _id: null, totalMealsSaved: { $sum: '$quantity' } } },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      period,
      totalBagsSold: periodTotals[0]?.totalBagsSold || 0,
      totalRevenue: periodTotals[0]?.totalRevenue || 0,
      totalMealsSaved: lifetimeTotals[0]?.totalMealsSaved || 0,
      averageRating: business.rating,
      dailyChart,
    },
  });
});
