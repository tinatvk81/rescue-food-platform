/**
 * businessRoutes.js
 * -----------------
 * Defines the /api/v1/businesses/* endpoints.
 * Mounted in app.js via: app.use('/api/v1/businesses', require('./routes/businessRoutes'))
 */

const express = require('express');
const businessController = require('../controllers/businessController');
const { protect, optionalAuth } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

const router = express.Router();

// Publicly viewable by anyone, but uses optionalAuth (not protect) so that
// IF a valid login cookie is present, req.user gets set and the owner/admin
// sees extra detail (see businessController.sanitizeForPublicView) — an
// anonymous visitor is never blocked from viewing.
router.get('/:id', optionalAuth, businessController.getBusiness);

// Everything below requires being logged in
router.post('/', protect, businessController.createBusiness);
router.patch('/:id', protect, businessController.updateBusiness);

// upload.array('documents', 5) means the form field must be named
// "documents" and accepts up to 5 files in a single request
router.post(
  '/:id/documents',
  protect,
  upload.array('documents', 5),
  businessController.uploadDocuments
);

module.exports = router;
