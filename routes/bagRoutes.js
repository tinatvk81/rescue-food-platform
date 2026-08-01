/**
 * bagRoutes.js
 * ------------
 * Defines the /api/v1/bags/* endpoints.
 * Mounted in app.js via: app.use('/api/v1/bags', require('./routes/bagRoutes'))
 */

const express = require('express');
const bagController = require('../controllers/bagController');
const { protect } = require('../middlewares/authMiddleware');
const { requireApprovedBusiness } = require('../middlewares/businessMiddleware');

const router = express.Router();

// IMPORTANT: this must be declared BEFORE '/:id' below. Express matches
// routes in the order they're registered — if '/:id' came first, a
// request to '/nearby' would incorrectly match it (treating "nearby"
// as if it were an id) and fail with a CastError instead of ever
// reaching this handler.
router.get('/nearby', bagController.getNearbyBags);

// Publicly viewable — no login required
router.get('/:id', bagController.getBag);

// Creating a bag requires: logged in, AND the referenced business
// (req.body.business) must exist and have status='approved'.
// requireApprovedBusiness() reads req.body.business, attaches req.business,
// and blocks the request with 403 if the business isn't approved yet —
// this is the exact middleware built (but left unused) back in Step 3.
router.post('/', protect, requireApprovedBusiness(), bagController.createBag);

// Editing/cancelling a specific bag: ownership is checked inside the
// controller itself (it needs to load the bag first to find out which
// business — and therefore which owner — it belongs to).
router.patch('/:id', protect, bagController.updateBag);
router.delete('/:id', protect, bagController.cancelBag);

module.exports = router;
