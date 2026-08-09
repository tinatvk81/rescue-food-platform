/**
 * notificationRoutes.js
 * ----------------------
 * Mounted in app.js via:
 *   app.use('/api/v1/notifications', require('./routes/notificationRoutes'))
 */

const express = require('express');
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/my-notifications', protect, notificationController.getMyNotifications);
router.patch('/:id/read', protect, notificationController.markAsRead);

module.exports = router;
