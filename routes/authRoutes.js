/**
 * authRoutes.js
 * -------------
 * Defines the /api/v1/auth/* endpoints and wires them to authController.
 * Mounted in app.js via: app.use('/api/v1/auth', require('./routes/authRoutes'))
 */

const express = require('express');
const authController = require('../controllers/authController');
const otpController = require('../controllers/otpController');
const requestOtpLimiter = require('../middlewares/otpRateLimiter');

const router = express.Router();

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/logout', authController.logout);

// requestOtpLimiter runs BEFORE the controller, so a request that's
// already over the limit never even reaches otpController.requestOtp
router.post('/request-otp', requestOtpLimiter, otpController.requestOtp);
router.post('/verify-otp', otpController.verifyOtp);

module.exports = router;
