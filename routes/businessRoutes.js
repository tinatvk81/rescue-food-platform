/**
 * businessRoutes.js
 * -----------------
 * Defines the /api/v1/businesses/* endpoints.
 * Mounted in app.js via: app.use('/api/v1/businesses', require('./routes/businessRoutes'))
 */

const express = require('express');
const businessController = require('../controllers/businessController');
const { protect } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

const router = express.Router();

// Publicly viewable — no `protect`, so anyone can look up a business by id.
// (req.user will simply be undefined here for anonymous requests; the
// controller already handles that.)
router.get('/:id', businessController.getBusiness);

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
