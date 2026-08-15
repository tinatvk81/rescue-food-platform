/**
 * adminRoutes.js
 * --------------
 * Defines the /api/v1/admin/* endpoints — every route here requires
 * role === 'admin', enforced once for the whole router below.
 * Mounted in app.js via: app.use('/api/v1/admin', require('./routes/adminRoutes'))
 */

const express = require('express');
const adminController = require('../controllers/adminController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

const router = express.Router();

// Applies to every route defined below this line
router.use(protect, restrictTo('admin'));

router.get('/businesses', adminController.listBusinesses);
router.patch('/businesses/:id/approve', adminController.approveBusiness);
router.patch('/businesses/:id/reject', adminController.rejectBusiness);
router.patch('/businesses/:id/suspend', adminController.suspendBusiness);

// Step 14: platform-wide stats
router.get('/platform-stats', adminController.getPlatformStats);

module.exports = router;
