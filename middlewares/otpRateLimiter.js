/**
 * otpRateLimiter.js
 * -----------------
 * Rate-limits OTP requests to a maximum of 3 per phone number per
 * 10 minutes.
 *
 * Why keyed by PHONE, not by IP address:
 * The default express-rate-limit behavior keys by IP address. That
 * protects against one IP spamming many phone numbers, but it does
 * NOT stop someone from targeting a single victim's phone number from
 * many different IPs (e.g. via a botnet or by simply switching networks),
 * which would rack up real SMS costs for us on that one number.
 * By keying on `req.body.phone` instead, we cap requests per phone
 * number regardless of where they come from.
 */

const rateLimit = require('express-rate-limit');

const requestOtpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'fail',
    message: 'Too many verification code requests for this number. Please try again later.',
  },
  // Fall back to the IP if, for some reason, no phone was sent — this
  // still lets the request through to the controller, which will then
  // return its own clear "phone number is required" validation error.
  keyGenerator: (req) => req.body?.phone || req.ip,
});

module.exports = requestOtpLimiter;
