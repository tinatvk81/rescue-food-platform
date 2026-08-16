/**
 * authRoutes.js
 * -------------
 * Defines the /api/v1/auth/* endpoints.
 * Mounted in app.js via: app.use('/api/v1/auth', require('./routes/authRoutes'))
 *
 * Step 15: every route here now goes through authRateLimiter (10 req /
 * 15 min per IP) as a second layer on top of request-otp's own
 * phone-keyed limiter (Step 2). signup/login also run through
 * express-validator chains before ever reaching the controller.
 */

const express = require('express');
const authController = require('../controllers/authController');
const otpController = require('../controllers/otpController');
const requestOtpLimiter = require('../middlewares/otpRateLimiter');
const authRateLimiter = require('../middlewares/authRateLimiter');
const { validateSignup, validateLogin } = require('../middlewares/validators');

const router = express.Router();

// Applies to every route defined below
router.use(authRateLimiter);

router.post('/signup', validateSignup, authController.signup);
router.post('/login', validateLogin, authController.login);
router.post('/logout', authController.logout);

// requestOtpLimiter (phone-keyed) runs in addition to authRateLimiter
// (IP-keyed) above — two independent layers protecting the same route
router.post('/request-otp', requestOtpLimiter, otpController.requestOtp);
router.post('/verify-otp', otpController.verifyOtp);

module.exports = router;
