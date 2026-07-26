/**
 * userModel.js
 * ------------
 * Mongoose schema for the User collection.
 *
 * A User can be a customer, a business owner, or a platform admin
 * (see the `role` field). This single collection covers all three,
 * distinguished by role and by the related Business document
 * (for business-role users, see businessModel.js in a later step).
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },

  // Iranian mobile number format, e.g. 09123456789 — used as the login identifier
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    trim: true,
    match: [/^09\d{9}$/, 'Please provide a valid Iranian mobile number'],
  },

  // Optional — only validated if provided
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    default: undefined,
  },

  // Never returned in queries by default (select: false) — must explicitly
  // request it with .select('+passwordHash'), e.g. during login
  passwordHash: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 8,
    select: false,
  },

  role: {
    type: String,
    enum: {
      values: ['customer', 'business', 'admin'],
      message: 'Role must be customer, business, or admin',
    },
    default: 'customer',
  },

  // GeoJSON Point — used later for "surprise bags near me" search.
  // Intentionally has NO default value: if a user signs up without
  // providing coordinates, this field should stay completely absent,
  // not a half-filled { type: 'Point' } with no coordinates — that
  // would break the 2dsphere index below (MongoDB can't index an
  // incomplete GeoJSON Point).
  location: {
    type: {
      type: String,
      enum: ['Point'],
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
    },
  },

  // Businesses the user has bookmarked (populated later via ref)
  favoriteBusinesses: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
    },
  ],

  // Running totals shown on the user's personal "impact dashboard"
  impactStats: {
    totalMealsSaved: { type: Number, default: 0 },
    totalMoneySaved: { type: Number, default: 0 },
    estimatedCO2Saved: { type: Number, default: 0 },
  },

  // Set to true after repeated no-show flags from businesses (see Step 11)
  isRestricted: {
    type: Boolean,
    default: false,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Geospatial index for "find nearby users/bags" queries.
// sparse: true means users without a `location` are simply excluded
// from this index instead of causing an indexing error.
userSchema.index({ location: '2dsphere' }, { sparse: true });

// ---------- Instance Methods ----------

/**
 * Compares a plain-text password (from a login request) against the
 * bcrypt hash stored in the database.
 *
 * @param {string} candidatePassword - Plain-text password submitted by the user
 * @param {string} userPasswordHash - The bcrypt hash stored on this user document
 * @returns {Promise<boolean>} true if they match
 */
userSchema.methods.comparePassword = async function (candidatePassword, userPasswordHash) {
  return bcrypt.compare(candidatePassword, userPasswordHash);
};

module.exports = mongoose.model('User', userSchema);
