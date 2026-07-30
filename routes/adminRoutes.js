/**
 * adminRoutes.js
 * --------------
 * All routes here require BOTH being logged in (protect) AND having
 * role === 'admin' (restrictTo('admin')). Applying both middlewares
 * once at the router level (router.use(...)) means every route
 * defined below automatically inherits this protection — no need to
 * repeat it on each individual route.
 *
 * Mounted in app.js via: app.use('/api/v1/admin', require('./routes/adminRoutes'))
 */

const express = require('express');
const adminController = require('../controllers/adminController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

const router = express.Router();

// Applied to EVERY route defined below this line
router.use(protect, restrictTo('admin'));

router.get('/businesses', adminController.listBusinesses);
router.patch('/businesses/:id/approve', adminController.approveBusiness);
router.patch('/businesses/:id/reject', adminController.rejectBusiness);
router.patch('/businesses/:id/suspend', adminController.suspendBusiness);

module.exports = router;
