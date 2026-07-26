/**
 * authRoutes.js
 * -------------
 * Defines the /api/v1/auth/* endpoints and wires them to authController.
 * Mounted in app.js via: app.use('/api/v1/auth', require('./routes/authRoutes'))
 */

const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/logout', authController.logout);

module.exports = router;
