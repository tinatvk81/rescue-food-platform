/**
 * orderRoutes.js
 * --------------
 * Defines the /api/v1/orders/* endpoints.
 * Mounted in app.js via: app.use('/api/v1/orders', require('./routes/orderRoutes'))
 */

const express = require('express');
const orderController = require('../controllers/orderController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

// Must be logged in to reserve a bag
router.post('/', protect, orderController.createOrder);

module.exports = router;
