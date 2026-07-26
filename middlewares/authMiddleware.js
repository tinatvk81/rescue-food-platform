/**
 * authMiddleware.js
 * -----------------
 * Two reusable Express middlewares for authentication and authorization:
 *
 *   - protect:    verifies the requester is logged in (valid JWT)
 *   - restrictTo: verifies the requester's role is allowed for this route
 *
 * Usage example (in a routes file):
 *   router.post('/', protect, restrictTo('admin'), someController);
 */

const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

/**
 * protect
 * -------
 * Reads the JWT from the httpOnly cookie set at login, verifies it,
 * loads the corresponding user from the database, and attaches it to
 * `req.user` so later middleware/controllers can use it.
 *
 * Responds with 401 if the token is missing/invalid, or if the user
 * account no longer exists. Responds with 403 if the account has been
 * restricted (see Step 11 — two-way trust/flagging system).
 */
exports.protect = catchAsync(async (req, res, next) => {
  // 1) Read the token from the cookie (set in authController.createSendToken)
  let token;
  if (req.cookies && req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(
      new AppError('You are not logged in. Please log in to access this resource', 401)
    );
  }

  // 2) Verify the token's signature and expiration
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3) Make sure the user this token belongs to still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError('The user belonging to this token no longer exists', 401)
    );
  }

  // 4) Block restricted accounts (repeated no-show flags, etc.)
  if (currentUser.isRestricted) {
    return next(
      new AppError('Your account has been restricted due to repeated violations', 403)
    );
  }

  // All good — make the user available to the next handler
  req.user = currentUser;
  next();
});

/**
 * restrictTo
 * ----------
 * Factory function that returns a middleware limiting access to the
 * given list of roles. Must be used AFTER `protect`, since it relies
 * on `req.user` being already set.
 *
 * @param  {...string} roles - Allowed roles, e.g. restrictTo('admin', 'business')
 */
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action', 403)
      );
    }
    next();
  };
};
