/**
 * authRateLimiter.js
 * -------------------
 * A stricter rate limiter specifically for /api/v1/auth/* routes —
 * max 10 requests per 15 minutes per IP.
 *
 * Why separate from the general API limiter (app.js, 300 req/15min)?
 * Auth endpoints (signup, login, request-otp, verify-otp) are the
 * most attractive target for brute-force/credential-stuffing attacks
 * — someone trying to guess a password or OTP code needs many rapid
 * attempts. The general limiter is far too loose to stop that; this
 * one is deliberately tight. (request-otp already has its own,
 * separate, phone-keyed limiter from Step 2 — this one is IP-keyed
 * and applies to ALL auth routes, as a second layer.)
 */

const rateLimit = require('express-rate-limit');

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'fail',
    message: 'Too many authentication requests from this IP. Please try again later.',
  },
});

module.exports = authRateLimiter;
