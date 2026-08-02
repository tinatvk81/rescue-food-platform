/**
 * orderModel.js
 * -------------
 * Represents a customer's reservation of a quantity of a SurpriseBag.
 *
 * `business` is denormalized here (duplicated from the bag) purely so
 * that later steps (business dashboard in Step 13, admin platform stats
 * in Step 14) can query "all orders for business X" directly, without
 * an extra $lookup through surpriseBags every time.
 */

const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  surpriseBag: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SurpriseBag',
    required: true,
  },
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    index: true,
  },

  quantity: {
    type: Number,
    required: true,
    min: [1, 'quantity must be at least 1'],
  },

  // Snapshotted at reservation time (bag.discountedPrice * quantity),
  // not recalculated later — so even if something changed the bag's
  // price in the future, this order's price stays what the customer
  // actually agreed to pay.
  totalPrice: {
    type: Number,
    required: true,
    min: 0,
  },

  // Set by Step 8 (payment gateway integration). Starts 'pending'
  // because reserving inventory (this step) and confirming payment
  // (Step 8) are deliberately separate steps.
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded', 'failed'],
    default: 'pending',
  },
  paymentRef: {
    type: String,
  },

  // Shown to the customer, entered by the business at pickup time
  // (Step 9) to confirm the handoff. Unique so two orders never
  // accidentally share a code.
  pickupCode: {
    type: String,
    required: true,
    unique: true,
  },

  status: {
    type: String,
    enum: ['reserved', 'pickedUp', 'noShow', 'cancelled'],
    default: 'reserved',
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
  pickedUpAt: {
    type: Date,
  },
});

module.exports = mongoose.model('Order', orderSchema);
