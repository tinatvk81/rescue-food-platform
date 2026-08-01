/**
 * surpriseBagModel.js
 * -------------------
 * Mongoose schema for a "surprise bag" — a discounted batch of a
 * business's surplus food, listed for a specific pickup window.
 *
 * Note: there's no `location` field here. A bag's location is always
 * its business's location — Step 6 (nearby search) will join through
 * `business` via an aggregation `$lookup`/`$geoNear` rather than
 * duplicating coordinates on every single bag.
 */

const mongoose = require('mongoose');

const surpriseBagSchema = new mongoose.Schema({
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    index: true,
  },

  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  sampleImageUrl: {
    type: String,
  },

  // Reuses the same categories as Business — a bag's category typically
  // matches its business's category, but kept as its own field in case
  // a business ever wants to categorize individual bags differently
  // (e.g. a supermarket listing both "bakery" and "produce" bags).
  category: {
    type: String,
    enum: {
      values: ['bakery', 'restaurant', 'cafe', 'supermarket', 'other'],
      message: 'Category must be one of: bakery, restaurant, cafe, supermarket, other',
    },
    required: [true, 'Category is required'],
  },

  originalPrice: {
    type: Number,
    required: [true, 'Original price is required'],
    min: [0, 'Original price cannot be negative'],
  },

  discountedPrice: {
    type: Number,
    required: [true, 'Discounted price is required'],
    min: [0, 'Discounted price cannot be negative'],
    validate: {
      // NOTE: custom validators using `this` only run correctly on
      // .save()/.create() (document-level validation), not on
      // findByIdAndUpdate(). That's exactly why bagController.js always
      // fetches the document, mutates its fields, then calls .save() —
      // never findByIdAndUpdate() — so this validator reliably fires.
      validator: function (value) {
        return value < this.originalPrice;
      },
      message: 'discountedPrice must be less than originalPrice',
    },
  },

  quantityAvailable: {
    type: Number,
    required: [true, 'quantityAvailable is required'],
    min: [1, 'quantityAvailable must be greater than 0'],
  },

  // How many units have been reserved so far (incremented in Step 7 —
  // reservation logic — via an atomic findOneAndUpdate to prevent
  // overselling). A bag can only be edited/cancelled while this is 0.
  quantityReserved: {
    type: Number,
    default: 0,
    min: 0,
  },

  pickupWindowStart: {
    type: Date,
    required: [true, 'pickupWindowStart is required'],
  },
  pickupWindowEnd: {
    type: Date,
    required: [true, 'pickupWindowEnd is required'],
    validate: {
      validator: function (value) {
        return value > this.pickupWindowStart;
      },
      message: 'pickupWindowEnd must be after pickupWindowStart',
    },
  },

  // 'expired' will be set automatically by a cron job in Step 10.
  // 'cancelled' is set by bagController.cancelBag (soft-delete — we
  // keep the document instead of removing it, for audit/history).
  status: {
    type: String,
    enum: {
      values: ['active', 'soldOut', 'expired', 'cancelled'],
      message: 'Status must be one of: active, soldOut, expired, cancelled',
    },
    default: 'active',
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('SurpriseBag', surpriseBagSchema);
