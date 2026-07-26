/**
 * token.js
 * --------
 * Shared JWT helpers used by every "successful authentication" flow —
 * currently password login/signup (authController.js) and OTP login
 * (otpController.js), and potentially more methods in the future.
 *
 * Centralizing this avoids duplicating the "sign token + set secure
 * cookie + strip sensitive fields + send response" logic in every
 * controller that can log a user in.
 */

const jwt = require('jsonwebtoken');

/**
 * Signs a new JWT containing the user's id.
 * @param {string} id - MongoDB ObjectId of the user
 * @returns {string} signed JWT
 */
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

/**
 * Signs a JWT, sets it as a secure httpOnly cookie, strips the
 * password hash from the user document, and sends the final JSON
 * response.
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

module.exports = { signToken, createSendToken };
