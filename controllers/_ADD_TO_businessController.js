/**
 * ADD THIS to controllers/businessController.js
 * -----------------------------------------------
 * Requires these additional imports at the top of the file (add
 * whichever aren't already there):
 *   const Order = require('../models/orderModel');
 */

/**
 * GET /api/v1/businesses/:id/dashboard-stats?period=week|month
 * Owner or admin only.
 *
 * Design note: `totalBagsSold` and `totalRevenue` are PERIOD-scoped
 * (only orders picked up within the selected window), while
 * `totalMealsSaved` is a LIFETIME total for the business (not reset by
 * the period filter) — a business likely wants to see recent sales
 * trends alongside their all-time impact badge, not have the impact
 * number reset every time they switch the period dropdown.
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

  // Period-scoped totals: only orders actually picked up within the window
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

  // Daily breakdown for a simple chart (Step 16 frontend, Chart.js or similar)
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

  // Lifetime meals-saved, NOT period-scoped (see note above)
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
