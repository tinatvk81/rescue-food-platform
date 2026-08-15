/**
 * ADD THIS to controllers/adminController.js
 * -----------------------------------------------
 * Requires these additional imports at the top of the file (add
 * whichever aren't already there):
 *   const User = require('../models/userModel');
 *   const Order = require('../models/orderModel');
 */

// Placeholder only — no real commission/fee system has been designed
// or built yet. See memory note: this MUST be replaced with a real
// configured rate (and ideally a per-business rate, not a single
// global constant) before this number is shown to anyone as real data.
const PLACEHOLDER_COMMISSION_RATE = 0.1; // 10%

/**
 * GET /api/v1/admin/platform-stats?period=week|month
 * Admin-only. Platform-wide numbers for an overview dashboard.
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
