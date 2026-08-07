/**
 * customerFlagModel.js
 * --------------------
 * A record of a business flagging a customer for no-show or bad
 * behavior on a specific order. Used by orderController.flagCustomer
 * to eventually restrict repeat offenders (see User.isRestricted).
 *
 * DESIGN NOTE — deviates slightly from the original spec, which only
 * had { customer, business, reason, createdAt }: this adds an `order`
 * reference with a UNIQUE index, so a business cannot flag the same
 * order more than once (which would otherwise let one business
 * artificially inflate a single customer's flag count from one single
 * incident).
 */

const mongoose = require('mongoose');

const customerFlagSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    unique: true,
  },
  reason: {
    type: String,
    enum: {
      values: ['no-show', 'bad-behavior'],
      message: 'reason must be either no-show or bad-behavior',
    },
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('CustomerFlag', customerFlagSchema);
