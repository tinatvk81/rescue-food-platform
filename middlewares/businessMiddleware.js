/**
 * businessMiddleware.js
 * ---------------------
 * Reusable middleware that guards any route which should only be
 * accessible to businesses with status === 'approved'.
 *
 * Not wired into any route yet in Step 3 (there's no surprise-bag
 * endpoint to protect until Step 5), but it's built now exactly as
 * requested, ready to drop into e.g.:
 *
 *   router.post('/', protect, requireApprovedBusiness(), bagController.createBag);
 *
 * By default it looks for the business id in `req.params.businessId`
 * or `req.body.business` (whichever is present) — this covers both
 * "business acting on itself" routes and "creating a bag that
 * references a business" routes without needing two separate
 * middlewares.
 */

const Business = require('../models/businessModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

/**
 * @returns {Function} an Express middleware
 */
exports.requireApprovedBusiness = () => {
  return catchAsync(async (req, res, next) => {
    const businessId = req.params.businessId || req.body.business;

    if (!businessId) {
      return next(new AppError('A business id is required', 400));
    }

    const business = await Business.findById(businessId);

    if (!business) {
      return next(new AppError('No business found with that id', 404));
    }

    if (business.status !== 'approved') {
      return next(
        new AppError(
          'This business is not approved yet and cannot perform this action',
          403
        )
      );
    }

    // Attach the business document so the next handler doesn't need
    // to fetch it again from the database
    req.business = business;
    next();
  });
};
