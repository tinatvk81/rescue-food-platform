/**
 * otpModel.js
 * -----------
 * Stores one-time passcodes (OTPs) used for passwordless phone login.
 *
 * Why a separate collection instead of a field on User?
 *   - OTPs are short-lived and only relevant during the login attempt,
 *     unlike permanent user data.
 *   - A user might request a new OTP before verifying an old one —
 *     modeling each OTP as its own document (rather than one field)
 *     makes it trivial to always look up "the current active code"
 *     and clean up old ones.
 *   - MongoDB's TTL (time-to-live) index below lets the database itself
 *     auto-delete expired codes, without needing an application-level
 *     cron job just for this cleanup.
 */

const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    // Not `unique`, since we allow multiple OTP documents to exist
    // over time for the same phone (old ones just expire via TTL).
    // We always query for the most recent one (see otpController.js).
    index: true,
  },

  // We NEVER store the OTP in plain text — only its bcrypt hash.
  // This matters because the Otp collection could otherwise be a
  // juicy target: if a DB dump/leak happened, someone could log in
  // as any user without ever touching their phone.
  codeHash: {
    type: String,
    required: true,
  },

  // Counts failed verification attempts for THIS specific OTP,
  // so we can block a code after a few wrong guesses even if it
  // technically hasn't expired yet (protects against brute-forcing
  // a 5-digit code within the 2-minute window).
  attempts: {
    type: Number,
    default: 0,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

  // The exact moment this OTP becomes invalid (createdAt + 2 minutes,
  // set in otpController.js). MongoDB's TTL monitor deletes documents
  // automatically once this timestamp is in the past — see the index
  // below (runs roughly once per minute internally).
  expiresAt: {
    type: Date,
    required: true,
  },
});

// TTL index: MongoDB will automatically delete a document once
// its `expiresAt` value is in the past. `expireAfterSeconds: 0`
// means "expire exactly at the time stored in this field" (not
// 0 seconds after creation).
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);
