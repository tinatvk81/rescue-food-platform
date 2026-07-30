/**
 * adminController.js
 * ------------------
 * Admin-only endpoints for reviewing and moderating businesses.
 * Every route using these controllers is protected by both `protect`
 * and `restrictTo('admin')` (see routes/adminRoutes.js) — a non-admin
 * can never reach any function in this file.
 */

const Business = require('../models/businessModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const notify = require('../utils/notify');

/**
 * GET /api/v1/admin/businesses?status=pending
 * Lists businesses, optionally filtered by status. If no `status`
 * query param is given, ALL businesses are returned (useful for a
 * general admin overview, not just the pending queue).
 *
 * Populates ownerUser with just name+phone so the admin can see who
 * they're dealing with without a separate lookup.
 */
exports.listBusinesses = catchAsync(async (req, res, next) => {
  const filter = {};

  if (req.query.status) {
    const validStatuses = ['pending', 'approved', 'rejected', 'suspended'];
    if (!validStatuses.includes(req.query.status)) {
      return next(
        new AppError(`status must be one of: ${validStatuses.join(', ')}`, 400)
      );
    }
    filter.status = req.query.status;
  }

  const businesses = await Business.find(filter)
    .populate('ownerUser', 'name phone')
    .sort({ createdAt: -1 }); // newest requests first

  res.status(200).json({
    status: 'success',
    results: businesses.length,
    data: { businesses },
  });
});

/**
 * PATCH /api/v1/admin/businesses/:id/approve
 * Marks a business as approved, allowing it to publish surprise bags
 * (enforced later by middlewares/businessMiddleware.js's
 * requireApprovedBusiness, used starting in Step 5).
 */
exports.approveBusiness = catchAsync(async (req, res, next) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    return next(new AppError('No business found with that id', 404));
  }

  business.status = 'approved';
  await business.save();

  await notify(
    business.ownerUser,
    'businessApproved',
    `Congratulations! Your business "${business.name}" has been approved and can now publish surprise bags.`
  );

  res.status(200).json({
    status: 'success',
    data: { business },
  });
});

/**
 * PATCH /api/v1/admin/businesses/:id/reject
 * Body: { reason }
 * Marks a business as rejected. A reason is required so the owner
 * understands what to fix (e.g. resubmit with clearer documents).
 */
exports.rejectBusiness = catchAsync(async (req, res, next) => {
  const { reason } = req.body;

  if (!reason) {
    return next(new AppError('A reason is required to reject a business', 400));
  }

  const business = await Business.findById(req.params.id);

  if (!business) {
    return next(new AppError('No business found with that id', 404));
  }

  business.status = 'rejected';
  await business.save();

  await notify(
    business.ownerUser,
    'businessRejected',
    `Your business "${business.name}" was rejected. Reason: ${reason}`
  );

  res.status(200).json({
    status: 'success',
    data: { business },
  });
});

/**
 * PATCH /api/v1/admin/businesses/:id/suspend
 * Body: { reason } (optional)
 * Suspends a PREVIOUSLY APPROVED business — used for later violations
 * (e.g. repeated bad reviews, food safety complaints), as opposed to
 * `reject`, which is for a business that was never approved in the
 * first place.
 */
exports.suspendBusiness = catchAsync(async (req, res, next) => {
  const { reason } = req.body;

  const business = await Business.findById(req.params.id);

  if (!business) {
    return next(new AppError('No business found with that id', 404));
  }

  business.status = 'suspended';
  await business.save();

  const reasonText = reason ? ` Reason: ${reason}` : '';
  await notify(
    business.ownerUser,
    'businessSuspended',
    `Your business "${business.name}" has been suspended.${reasonText}`
  );

  res.status(200).json({
    status: 'success',
    data: { business },
  });
});
