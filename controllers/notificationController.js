/**
 * notificationController.js
 * --------------------------
 * Lets a logged-in user read their own notifications and mark them
 * as read. Notifications themselves are created elsewhere (see
 * utils/notify.js, called from adminController.js, orderController.js,
 * and jobs/cronJobs.js) — this controller is purely for reading them.
 */

const Notification = require('../models/notificationModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

/**
 * GET /api/v1/notifications/my-notifications
 * Returns the current user's notifications, newest first.
 */
exports.getMyNotifications = catchAsync(async (req, res, next) => {
  const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    results: notifications.length,
    data: { notifications },
  });
});

/**
 * PATCH /api/v1/notifications/:id/read
 * Marks a single notification as read. Only the notification's own
 * owner may do this.
 */
exports.markAsRead = catchAsync(async (req, res, next) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    return next(new AppError('No notification found with that id', 404));
  }
  if (notification.user.toString() !== req.user._id.toString()) {
    return next(new AppError('You do not have permission to update this notification', 403));
  }

  notification.read = true;
  await notification.save();

  res.status(200).json({
    status: 'success',
    data: { notification },
  });
});
