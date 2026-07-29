/**
 * businessModel.js
 * ----------------
 * Mongoose schema for businesses (restaurants, bakeries, cafés,
 * supermarkets, etc.) that list surprise bags on the platform.
 *
 * A Business is always owned by exactly one User with role='business'
 * (see ownerUser below). It starts in `pending` status and cannot
 * publish surprise bags (Step 5) until an admin sets it to `approved`
 * (Step 4).
 */

const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema({
  ownerUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'A business must belong to an owner user'],
  },

  name: {
    type: String,
    required: [true, 'Business name is required'],
    trim: true,
  },

  category: {
    type: String,
    enum: {
      values: ['bakery', 'restaurant', 'cafe', 'supermarket', 'other'],
      message: 'Category must be one of: bakery, restaurant, cafe, supermarket, other',
    },
    required: [true, 'Category is required'],
  },

  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true,
  },

  // GeoJSON Point — required, since "surprise bags near me" search
  // (Step 6) depends entirely on every business having a location.
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: [true, 'Location type is required'],
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: [true, 'Location coordinates are required'],
    },
  },

  // Lightweight identity verification for MVP — a full business license
  // (جواز کسب) is NOT required to keep onboarding fast; national ID of
  // the owner plus an economic code is enough for an admin to do a
  // basic manual check before approving.
  nationalId: {
    type: String,
    required: [true, "Owner's national ID is required"],
    trim: true,
  },
  economicCode: {
    type: String,
    trim: true,
    // Optional: some very small/new businesses may not have one yet.
    // Admins can still request it manually before approving if needed.
  },

  // URLs of uploaded verification documents (see uploadMiddleware.js).
  // Populated via POST /api/v1/businesses/:id/documents
  documents: {
    type: [String],
    default: [],
  },

  status: {
    type: String,
    enum: {
      values: ['pending', 'approved', 'rejected', 'suspended'],
      message: 'Status must be one of: pending, approved, rejected, suspended',
    },
    default: 'pending',
  },

  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },
  reviewsCount: {
    type: Number,
    default: 0,
  },

  // Simple structured weekly schedule, e.g.:
  // [{ day: 'saturday', open: '09:00', close: '22:00' }, ...]
  operatingHours: [
    {
      day: {
        type: String,
        enum: [
          'saturday',
          'sunday',
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
        ],
      },
      open: String, // e.g. "09:00"
      close: String, // e.g. "22:00"
    },
  ],

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Geospatial index powering the "nearby surprise bags" search in Step 6
businessSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Business', businessSchema);
