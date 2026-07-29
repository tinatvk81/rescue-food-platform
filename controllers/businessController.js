/**
 * businessController.js
 * ----------------------
 * Handles business registration, viewing, editing, and document uploads.
 *
 * Design decision (discussed with the user before implementing):
 * Rather than requiring a user to already have role='business' before
 * they can register a business (which would need a separate, awkward
 * "become a business" step), ANY logged-in user can create a business.
 * On successful creation, we automatically promote their User.role to
 * 'business'. Each user may own at most one business (checked here at
 * the application level, not via a DB unique index, so it's easy to
 * loosen this rule later if multi-branch businesses are ever supported).
 */

const User = require('../models/userModel');
const Business = require('../models/businessModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

// Fields a business owner is allowed to change via PATCH.
// Deliberately excludes: ownerUser, status, rating, reviewsCount —
// those must only ever change through dedicated flows (admin approval
// in Step 4, reviews in Step 11) and never by the owner directly.
const EDITABLE_FIELDS = ['name', 'category', 'address', 'location', 'operatingHours', 'economicCode'];

/**
 * Strips sensitive fields (nationalId, economicCode, documents) from a
 * business before sending it to anyone who isn't the owner or an admin.
 * Used by getBusiness so the public can browse businesses (Step 6 will
 * build on this) without seeing another person's private verification info.
 *
 * @param {import('mongoose').Document} business
 * @param {import('mongoose').Document|undefined} requestingUser - req.user, may be undefined for anonymous requests
 */
const sanitizeForPublicView = (business, requestingUser) => {
  const isOwner = requestingUser && business.ownerUser.toString() === requestingUser._id.toString();
  const isAdmin = requestingUser && requestingUser.role === 'admin';

  if (isOwner || isAdmin) {
    return business; // full detail for the owner or an admin
  }

  const publicBusiness = business.toObject();
  delete publicBusiness.nationalId;
  delete publicBusiness.economicCode;
  delete publicBusiness.documents;
  return publicBusiness;
};

/**
 * POST /api/v1/businesses
 * Registers a new business owned by the currently logged-in user.
 * Requires: protect (must be logged in). Any role may call this —
 * see the design note above.
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

  // Enforce "one business per user" at the application level
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

  // Promote the owner's account so future role-gated routes (e.g.
  // restrictTo('business')) recognize them correctly.
  req.user.role = 'business';
  await User.findByIdAndUpdate(req.user._id, { role: 'business' });

  res.status(201).json({
    status: 'success',
    data: { business },
  });
});

/**
 * GET /api/v1/businesses/:id
 * Publicly viewable — no login required. Sensitive fields are hidden
 * unless the requester is the owner or an admin (see sanitizeForPublicView).
 *
 * Note: this route is NOT behind `protect`, so req.user may be
 * undefined here — that's expected and handled below.
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
 * Only the business's own owner may edit it. Only a safe allow-list of
 * fields (EDITABLE_FIELDS) can be changed this way.
 */
exports.updateBusiness = catchAsync(async (req, res, next) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    return next(new AppError('No business found with that id', 404));
  }

  if (business.ownerUser.toString() !== req.user._id.toString()) {
    return next(new AppError('You do not have permission to edit this business', 403));
  }

  // Only copy over whitelisted fields — silently ignores anything else
  // in the body (e.g. someone trying to sneak in status: 'approved')
  EDITABLE_FIELDS.forEach((field) => {
    if (req.body[field] !== undefined) {
      business[field] = req.body[field];
    }
  });

  // Special case: longitude/latitude arrive as separate flat fields
  // (matching createBusiness's input shape), not as a nested GeoJSON object
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
 * Uploads one or more verification document images/PDFs (via multer,
 * see middlewares/uploadMiddleware.js) and appends their URLs to the
 * business's `documents` array. Owner-only.
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

  // req.files is populated by multer (see routes/businessRoutes.js,
  // which uses upload.array('documents', 5))
  const newDocumentUrls = req.files.map((file) => `/uploads/business-documents/${file.filename}`);

  business.documents.push(...newDocumentUrls);
  await business.save();

  res.status(200).json({
    status: 'success',
    data: { business },
  });
});
