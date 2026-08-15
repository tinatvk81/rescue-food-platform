/**
 * adminController.js
 * -------------------
 * Business moderation (Step 4) and platform-wide stats (Step 14).
 * Every route using this controller is already behind
 * protect + restrictTo('admin') at the router level.
 */

const Business = require('../models/businessModel');
const User = require('../models/userModel');
const Order = require('../models/orderModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const notify = require('../utils/notify');

/**
 * GET /api/v1/admin/businesses?status=pending
 * Lists businesses, optionally filtered by status.
 */
exports.listBusinesses = catchAsync(async (req, res, next) => {
  const filter = {};
  if (req.query.status) {
    filter.status = req.query.status;
  }

  const businesses = await Business.find(filter).populate('ownerUser', 'name phone');

  res.status(200).json({
    status: 'success',
    results: businesses.length,
    data: { businesses },
  });
});

/**
 * PATCH /api/v1/admin/businesses/:id/approve
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
 */
exports.suspendBusiness = catchAsync(async (req, res, next) => {
  const { reason } = req.body;

  const business = await Business.findById(req.params.id);
  if (!business) {
    return next(new AppError('No business found with that id', 404));
  }

  business.status = 'suspended';
  await business.save();

  await notify(
    business.ownerUser,
    'businessSuspended',
    `Your business "${business.name}" has been suspended.${reason ? ` Reason: ${reason}` : ''}`
  );

  res.status(200).json({
    status: 'success',
    data: { business },
  });
});

// Placeholder only — no real commission/fee system has been designed
// or built yet. MUST be replaced with a real configured rate before
// this number is shown to anyone as real data.
const PLACEHOLDER_COMMISSION_RATE = 0.1; // 10%

/**
 * GET /api/v1/admin/platform-stats?period=week|month
 * [Step 14] Platform-wide numbers for an overview dashboard.
 */
exports.getPlatformStats = catchAsync(async (req, res, next) => {
  const period = req.query.period === 'month' ? 'month' : 'week';
  const days = period === 'month' ? 30 : 7;
  const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [totalApprovedBusinesses, totalUsers, todaysOrdersCount, impactAgg, revenueAgg] =
    await Promise.all([
      Business.countDocuments({ status: 'approved' }),
      User.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: startOfToday } }),
      User.aggregate([
        {
          $group: {
            _id: null,
            totalMealsSaved: { $sum: '$impactStats.totalMealsSaved' },
            totalCO2Saved: { $sum: '$impactStats.estimatedCO2Saved' },
          },
        },
      ]),
      Order.aggregate([
        { $match: { status: 'pickedUp', pickedUpAt: { $gte: periodStart } } },
        { $group: { _id: null, totalRevenue: { $sum: '$totalPrice' } } },
      ]),
    ]);

  const periodRevenue = revenueAgg[0]?.totalRevenue || 0;

  res.status(200).json({
    status: 'success',
    data: {
      period,
      totalApprovedBusinesses,
      totalUsers,
      totalMealsSavedPlatform: impactAgg[0]?.totalMealsSaved || 0,
      totalCO2SavedPlatform: impactAgg[0]?.totalCO2Saved || 0,
      todaysOrdersCount,
      estimatedPlatformFeeRevenue: Math.round(periodRevenue * PLACEHOLDER_COMMISSION_RATE),
      _note:
        'estimatedPlatformFeeRevenue uses a placeholder 10% rate — no real commission system has been built yet.',
    },
  });
});
