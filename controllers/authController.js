/**
 * authController.js
 * ------------------
 * Handles user authentication: signup, login, logout.
 *
 * Auth strategy: JWT stored in an httpOnly cookie (not readable by
 * client-side JS, which protects against XSS token theft). The token
 * is also included in the JSON response body for future clients (e.g.
 * a mobile app) that may prefer to manage the token themselves.
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

// ---------- Helpers ----------

/**
 * Signs a new JWT containing the user's id.
 * @param {string} id - MongoDB ObjectId of the user
 */
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

/**
 * Shared helper used by every "successful login" flow (signup, login,
 * and later OTP login in Step 2) to:
 *   1. sign a JWT
 *   2. set it as a secure httpOnly cookie
 *   3. strip the password hash from the response
 *   4. send the final JSON response
 *
 * @param {import('mongoose').Document} user - The authenticated user document
 * @param {number} statusCode - HTTP status to respond with (200 or 201)
 * @param {import('express').Response} res
 */
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  // JWT_EXPIRES_IN is like "7d" — parse the leading number as days for the cookie
  const expiresInDays = parseInt(process.env.JWT_EXPIRES_IN, 10) || 7;

  res.cookie('jwt', token, {
    expires: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    httpOnly: true, // client-side JS cannot read this cookie (XSS protection)
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'strict',
  });

  // Never leak the password hash back to the client
  user.passwordHash = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

// ---------- Controllers ----------

/**
 * POST /api/v1/auth/signup
 * Creates a new customer account (name + phone + password).
 * Hashes the password with bcrypt before saving, then logs the user in.
 */
exports.signup = catchAsync(async (req, res, next) => {
  const { name, phone, password, email } = req.body;

  if (!name || !phone || !password) {
    return next(new AppError('Name, phone number, and password are required', 400));
  }

  if (password.length < 8) {
    return next(new AppError('Password must be at least 8 characters long', 400));
  }

  // Check for an existing account first, so we can return a clear 409
  // instead of a raw MongoDB duplicate-key error
  const existingUser = await User.findOne({ phone });
  if (existingUser) {
    return next(new AppError('An account with this phone number already exists', 409));
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const newUser = await User.create({
    name,
    phone,
    email,
    passwordHash,
  });

  createSendToken(newUser, 201, res);
});

/**
 * POST /api/v1/auth/login
 * Authenticates a user with phone + password and issues a JWT.
 */
exports.login = catchAsync(async (req, res, next) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return next(new AppError('Please provide phone number and password', 400));
  }

  // passwordHash is select:false by default, so we must explicitly request it
  const user = await User.findOne({ phone }).select('+passwordHash');

  if (!user || !(await user.comparePassword(password, user.passwordHash))) {
    return next(new AppError('Incorrect phone number or password', 401));
  }

  if (user.isRestricted) {
    return next(new AppError('Your account has been restricted', 403));
  }

  createSendToken(user, 200, res);
});

/**
 * POST /api/v1/auth/logout
 * Clears the JWT cookie by overwriting it with a dummy value that
 * expires almost immediately.
 */
exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 1000), // expires in 1 second
    httpOnly: true,
  });

  res.status(200).json({ status: 'success', message: 'Logged out successfully' });
};
