/**
 * notify.js
 * ---------
 * Small shared helper for creating a Notification document.
 *
 * Centralizing this in one function (rather than calling
 * `Notification.create(...)` directly all over the codebase) means
 * that when Step 12 adds real delivery (SMS/push), we only have to
 * change the inside of this one function — every call site (like
 * adminController.js) stays exactly the same.
 */

const Notification = require('../models/notificationModel');

/**
 * @param {string} userId - the recipient's User _id
 * @param {string} type - one of the enum values in notificationModel.js
 * @param {string} message - human-readable notification text
 */
const notify = async (userId, type, message) => {
  await Notification.create({ user: userId, type, message });
  // TODO (Step 12): also trigger real delivery here, e.g.:
  //   await sendPushNotification(userId, message);
  //   await sendOtpSms(user.phone, message); // or a dedicated SMS template
};

module.exports = notify;
