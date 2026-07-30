/**
 * notificationModel.js
 * --------------------
 * Stores in-app notifications for users — e.g. "your business was
 * approved" or "your business was rejected: <reason>".
 *
 * For now, notifications are ONLY stored in the database and fetched
 * by the frontend (no endpoints to read them yet — that arrives in
 * Step 12 alongside SMS/push delivery). Creating them now, in Step 4,
 * lets the admin-approval flow start recording history immediately
 * instead of that data being lost until Step 12 is built.
 */

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  type: {
    type: String,
    enum: [
      'businessApproved',
      'businessRejected',
      'businessSuspended',
      // more types will be added in later steps (orderConfirmed, pickupReminder, etc.)
    ],
    required: true,
  },

  message: {
    type: String,
    required: true,
  },

  read: {
    type: Boolean,
    default: false,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Notification', notificationSchema);
