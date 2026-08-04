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

// View a single order (customer or the business it belongs to only)
router.get('/:id', protect, orderController.getOrder);

// Payment
router.post('/:id/pay', protect, orderController.payOrder);
// NOT behind `protect` — Zarinpal's redirect carries no cookie of ours;
// see the comment in orderController.verifyPaymentCallback for how this
// route authorizes itself instead (matching the stored Authority token).
router.get('/:id/verify-payment', orderController.verifyPaymentCallback);

// Cancellation
router.patch('/:id/cancel', protect, orderController.cancelOrder);
router.patch('/:id/business-cancel', protect, orderController.businessCancelOrder);

// In-person pickup confirmation (business-only)
router.patch('/:id/pickup', protect, orderController.confirmPickup);

module.exports = router;
