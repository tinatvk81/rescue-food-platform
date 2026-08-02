/**
 * orderController.js
 * -------------------
 * Handles reserving a surprise bag.
 *
 * THE CORE PROBLEM THIS SOLVES (overselling):
 * If two customers hit "reserve" on the last bag at the exact same
 * moment, a naive "check quantity, then increment it" (two separate
 * steps) can let both requests pass the check before either one has
 * written its increment — both succeed, and the business now owes two
 * meals for stock they only have one of.
 *
 * THE FIX: a single atomic `findOneAndUpdate` where the "is there enough
 * left?" check and the "reserve it" increment happen as ONE indivisible
 * database operation. MongoDB guarantees only one concurrent request can
 * win that operation for a given document — the loser's condition simply
 * no longer matches (because the winner's update already applied), so it
 * cleanly gets nothing back instead of overselling.
 *
 * IMPROVEMENT OVER THE ORIGINAL SPEC: the originally suggested condition,
 * `quantityReserved < quantityAvailable`, only guarantees "at least 1 unit
 * is left" — it does NOT guarantee enough units are left for a multi-unit
 * request (quantity > 1). Reserving quantity=3 when only 1 remains would
 * still have passed that check. This file instead checks
 * `quantityReserved + quantity <= quantityAvailable`, which is the
 * condition that actually prevents overselling for any requested quantity.
 */

const mongoose = require('mongoose');
const SurpriseBag = require('../models/surpriseBagModel');
const Business = require('../models/businessModel');
const Order = require('../models/orderModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const generatePickupCode = require('../utils/generatePickupCode');

const MAX_PICKUP_CODE_RETRIES = 5;

/**
 * Creates the Order document, retrying with a freshly generated
 * pickupCode on the rare chance of a unique-index collision (statistically
 * very unlikely with a 6-character code, but cheap to guard against).
 */
const createOrderWithUniqueCode = async (orderData) => {
  for (let attempt = 0; attempt < MAX_PICKUP_CODE_RETRIES; attempt++) {
    try {
      return await Order.create({ ...orderData, pickupCode: generatePickupCode() });
    } catch (err) {
      const isDuplicatePickupCode = err.code === 11000 && err.keyPattern?.pickupCode;
      if (!isDuplicatePickupCode) throw err; // some other error — don't swallow it
      // otherwise loop again with a new code
    }
  }
  throw new Error('Failed to generate a unique pickup code after several attempts');
};

/**
 * POST /api/v1/orders
 * Body: { surpriseBag: <bagId>, quantity }
 */
exports.createOrder = catchAsync(async (req, res, next) => {
  const { surpriseBag: bagId, quantity } = req.body;

  if (!bagId || quantity === undefined) {
    return next(new AppError('surpriseBag and quantity are required', 400));
  }

  const quantityNum = Number(quantity);
  if (!Number.isInteger(quantityNum) || quantityNum < 1) {
    return next(new AppError('quantity must be a whole number of at least 1', 400));
  }

  // Read-only lookup first: confirms the bag exists and lets us check
  // business ownership BEFORE touching (and potentially having to roll
  // back) the atomic reservation below.
  const bag = await SurpriseBag.findById(bagId);
  if (!bag) {
    return next(new AppError('No surprise bag found with that id', 404));
  }

  const business = await Business.findById(bag.business);
  // A missing business here would mean corrupted data, not a normal
  // user-facing case — but we check defensively rather than crash.
  if (!business) {
    return next(new AppError('The business for this bag could not be found', 404));
  }

  // A business shouldn't be able to "rescue" its own surplus food at a
  // discount meant for the public — this is a business-logic safeguard,
  // not part of the concurrency-safety mechanism itself.
  if (business.ownerUser.toString() === req.user._id.toString()) {
    return next(new AppError('You cannot reserve a bag from your own business', 400));
  }

  // ---------- THE ATOMIC RESERVATION ----------
  // $expr lets us compare two fields of the SAME document (quantityReserved
  // vs. quantityAvailable) inside a query filter, which a plain query
  // object can't do. Because findOneAndUpdate's filter-check and the
  // $inc update are applied as a single atomic operation by MongoDB, no
  // other request can slip in between "check" and "increment".
  const updatedBag = await SurpriseBag.findOneAndUpdate(
    {
      _id: bagId,
      status: 'active',
      pickupWindowEnd: { $gt: new Date() },
      $expr: {
        $lte: [{ $add: ['$quantityReserved', quantityNum] }, '$quantityAvailable'],
      },
    },
    { $inc: { quantityReserved: quantityNum } },
    { new: true }
  );

  if (!updatedBag) {
    // Either the bag is no longer active/expired, or there isn't enough
    // quantity left for this request — we can't tell which from here
    // without an extra read, so a clear generic message covers both.
    return next(
      new AppError('This bag is no longer available in the requested quantity', 409)
    );
  }

  // If this reservation used up the last unit, mark the bag soldOut so
  // it stops appearing in nearby search (Step 6) immediately. This is
  // explicitly best-effort and wrapped in its own try/catch: even if it
  // somehow fails, the nearby-search query's own
  // `quantityAvailable > quantityReserved` filter (Step 6) would still
  // correctly exclude a fully-reserved bag — so we log and continue
  // rather than letting a failure here block the actual reservation.
  if (updatedBag.quantityReserved >= updatedBag.quantityAvailable) {
    try {
      updatedBag.status = 'soldOut';
      await updatedBag.save();
    } catch (err) {
      console.error('Non-critical: failed to flip bag status to soldOut:', err.message);
      updatedBag.status = 'active'; // keep in-memory state consistent with what's actually in the DB
    }
  }

  // ---------- CREATE THE ORDER, WITH ROLLBACK ON FAILURE ----------
  // If anything below fails (e.g. a transient DB error), the quantity
  // we already reserved above would otherwise be stranded forever —
  // silently blocking real inventory that no Order actually represents.
  // We explicitly release it back if order creation doesn't succeed.
  let order;
  try {
    order = await createOrderWithUniqueCode({
      customer: req.user._id,
      surpriseBag: bag._id,
      business: business._id,
      quantity: quantityNum,
      totalPrice: updatedBag.discountedPrice * quantityNum,
    });
  } catch (err) {
    await SurpriseBag.findByIdAndUpdate(bagId, {
      $inc: { quantityReserved: -quantityNum },
      // Also revert an incidental soldOut flip back to active, IF this
      // rollback is what makes the bag available again
      ...(updatedBag.status === 'soldOut' && { status: 'active' }),
    });
    return next(err);
  }

  res.status(201).json({
    status: 'success',
    data: { order },
  });
});
