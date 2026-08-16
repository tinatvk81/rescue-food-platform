/**
 * validators.js
 * -------------
 * Systematic input validation using express-validator, layered on
 * TOP of the manual checks already inside each controller (this
 * doesn't replace those — it catches malformed/malicious input
 * earlier, with more precise, field-level error messages, before a
 * request even reaches the controller).
 *
 * Coverage note: this file currently validates the auth routes
 * (signup, login) — the most security-critical, most publicly-exposed
 * surface of the API. Extending the same pattern to every other
 * POST/PATCH endpoint (businesses, bags, orders, etc.) is a
 * straightforward follow-up using the exact same shape shown here,
 * tracked as a deferred item rather than done all at once.
 */

const { body, validationResult } = require('express-validator');
const AppError = require('../utils/appError');

/**
 * Runs after a validation chain; converts express-validator's error
 * format into our standard AppError so the response shape matches
 * every other error in the API.
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors
      .array()
      .map((e) => e.msg)
      .join(' | ');
    return next(new AppError(message, 400));
  }
  next();
};

exports.validateSignup = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('phone')
    .trim()
    .matches(/^09\d{9}$/)
    .withMessage('Please provide a valid Iranian mobile number'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),
  body('email').optional().isEmail().withMessage('Please provide a valid email address'),
  handleValidationErrors,
];

exports.validateLogin = [
  body('phone')
    .trim()
    .matches(/^09\d{9}$/)
    .withMessage('Please provide a valid Iranian mobile number'),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors,
];
