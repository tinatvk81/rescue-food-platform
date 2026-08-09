/**
 * notificationModel.js
 * --------------------
 * Stores in-app notifications for users.
 *
 * UPDATED in Step 12: the `type` enum now includes the customer-facing
 * types this step wires up (newBagNearby, orderConfirmed,
 * pickupReminder), in addition to the business-approval types already
 * used since Step 4.
 *
 * Still ONLY stored in the database — no real SMS/push delivery yet.
 * See utils/smsService.js (Step 2) for the same "mock now, swap later"
 * pattern this will eventually follow for real delivery.
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
      'newBagNearby',
      'orderConfirmed',
      'pickupReminder',
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
