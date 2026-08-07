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
const User = require('../models/userModel');
const Review = require('../models/reviewModel');
const CustomerFlag = require('../models/customerFlagModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const generatePickupCode = require('../utils/generatePickupCode');
const paymentService = require('../utils/paymentService');
const { evaluateCancellation } = require('../utils/refundPolicy');
const { calculateImpact } = require('../utils/impactStats');

// A customer is auto-restricted once flagged more than this many times
// across ALL businesses (not per-business) — see flagCustomer below.
const MAX_FLAGS_BEFORE_RESTRICTION = 3;

/**
 * Releases previously-reserved inventory back to a bag (used by both
 * cancellation flows below), and flips a soldOut bag back to active if
 * it still has time left on its pickup window — mirroring the rollback
 * logic already used in createOrder.
 */
const releaseReservedQuantity = async (bagId, quantity) => {
  const bag = await SurpriseBag.findById(bagId);
  if (!bag) return; // bag was somehow deleted — nothing to release

  bag.quantityReserved = Math.max(0, bag.quantityReserved - quantity);
  if (bag.status === 'soldOut' && bag.pickupWindowEnd > new Date()) {
    bag.status = 'active';
  }
  await bag.save();
};

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

/**
 * GET /api/v1/orders/:id
 * Only the customer who placed the order, or the business it belongs
 * to, may view it — an order contains another person's contact-adjacent
 * data (implicitly, via populate) and payment info, so it's not public.
 */
exports.getOrder = catchAsync(async (req, res, next) => {
  const order = await Order.findById(req.params.id).populate(
    'surpriseBag',
    'title pickupWindowStart pickupWindowEnd'
  );

  if (!order) {
    return next(new AppError('No order found with that id', 404));
  }

  const isCustomer = order.customer.toString() === req.user._id.toString();
  const business = await Business.findById(order.business);
  const isBusinessOwner = business && business.ownerUser.toString() === req.user._id.toString();

  if (!isCustomer && !isBusinessOwner) {
    return next(new AppError('You do not have permission to view this order', 403));
  }

  res.status(200).json({
    status: 'success',
    data: { order },
  });
});

/**
 * POST /api/v1/orders/:id/pay
 * Only the customer who made the order can start payment for it.
 *
 * NOTE ON CURRENCY: Zarinpal's API expects an integer amount. Historically
 * this meant Rials; confirm the unit your specific merchant account expects
 * before going live, and adjust the amount sent here accordingly (e.g.
 * dividing by 10 if your totalPrice is stored in Toman but Zarinpal expects
 * Rials, or vice versa) — this codebase sends `order.totalPrice` as-is.
 */
exports.payOrder = catchAsync(async (req, res, next) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new AppError('No order found with that id', 404));
  }
  if (order.customer.toString() !== req.user._id.toString()) {
    return next(new AppError('You do not have permission to pay for this order', 403));
  }
  if (order.status !== 'reserved') {
    return next(new AppError(`This order's status (${order.status}) can no longer be paid for`, 400));
  }
  if (order.paymentStatus === 'paid') {
    return next(new AppError('This order has already been paid', 400));
  }

  // process.env.APP_BASE_URL must be the publicly reachable base URL of
  // THIS API (e.g. https://api.yourapp.com) — Zarinpal redirects the
  // customer's browser here after they pay.
  const callbackUrl = `${process.env.APP_BASE_URL}/api/v1/orders/${order._id}/verify-payment`;

  const { authority, paymentUrl } = await paymentService.requestPayment({
    amount: order.totalPrice,
    description: `Rescue Food Platform order ${order._id}`,
    callbackUrl,
    metadata: { order_id: order._id.toString() },
  });

  order.paymentAuthority = authority;
  await order.save();

  res.status(200).json({
    status: 'success',
    data: { paymentUrl },
  });
});

/**
 * GET /api/v1/orders/:id/verify-payment
 * Zarinpal redirects the customer's browser here after payment — this
 * route is intentionally NOT behind `protect`: Zarinpal's redirect is a
 * plain browser navigation with no cookie of ours attached, and in
 * production this would typically be hit from the customer's own
 * browser/device, not a background server call. Instead, we authorize
 * the request by requiring the `Authority` query param to match the
 * one we generated and stored in payOrder — an attacker would have to
 * guess that (effectively random) token to forge a callback.
 */
exports.verifyPaymentCallback = catchAsync(async (req, res, next) => {
  const { Authority, Status } = req.query;

  const order = await Order.findById(req.params.id);
  if (!order) {
    return next(new AppError('No order found with that id', 404));
  }
  if (!Authority || order.paymentAuthority !== Authority) {
    return next(new AppError('Payment authority does not match this order', 400));
  }

  if (Status !== 'OK') {
    order.paymentStatus = 'failed';
    await order.save();
    return res.status(200).json({
      status: 'success',
      message: 'Payment was cancelled or failed',
      data: { order },
    });
  }

  const result = await paymentService.verifyPayment({
    amount: order.totalPrice,
    authority: Authority,
  });

  if (!result.verified) {
    order.paymentStatus = 'failed';
    await order.save();
    return next(new AppError(result.error || 'Payment verification failed', 400));
  }

  order.paymentStatus = 'paid';
  order.paymentRef = result.refId;
  await order.save();

  res.status(200).json({
    status: 'success',
    message: 'Payment verified successfully',
    data: { order },
  });
});

/**
 * PATCH /api/v1/orders/:id/cancel
 * Customer-initiated cancellation — only allowed at least 30 minutes
 * before the pickup window starts (see utils/refundPolicy.js).
 */
exports.cancelOrder = catchAsync(async (req, res, next) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new AppError('No order found with that id', 404));
  }
  if (order.customer.toString() !== req.user._id.toString()) {
    return next(new AppError('You do not have permission to cancel this order', 403));
  }
  if (order.status !== 'reserved') {
    return next(new AppError(`This order's status (${order.status}) can no longer be cancelled`, 400));
  }

  const bag = await SurpriseBag.findById(order.surpriseBag);
  if (!bag) {
    return next(new AppError('The surprise bag for this order could not be found', 404));
  }

  const decision = evaluateCancellation({
    initiator: 'customer',
    pickupWindowStart: bag.pickupWindowStart,
  });

  if (!decision.allowed) {
    return next(new AppError(decision.reason, 400));
  }

  // NOTE: Zarinpal does not expose a simple public refund API for
  // standard merchant accounts — actually reversing money to the
  // customer's card typically has to be done manually via the
  // Zarinpal merchant dashboard for now. We record the *intent* here
  // (paymentStatus: 'refunded') so the business/admin knows a refund
  // is owed, but this does NOT itself move any money.
  // TODO: automate this if/when a suitable Zarinpal refund product is available.
  if (order.paymentStatus === 'paid' && decision.shouldRefund) {
    order.paymentStatus = 'refunded';
  }

  order.status = 'cancelled';
  await order.save();
  await releaseReservedQuantity(bag._id, order.quantity);

  res.status(200).json({
    status: 'success',
    message: decision.reason,
    data: { order },
  });
});

/**
 * PATCH /api/v1/orders/:id/business-cancel
 * Business-initiated cancellation — always allowed, always refunded
 * (see utils/refundPolicy.js). Only the business that owns the order
 * may call this.
 */
exports.businessCancelOrder = catchAsync(async (req, res, next) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new AppError('No order found with that id', 404));
  }

  const business = await Business.findById(order.business);
  if (!business || business.ownerUser.toString() !== req.user._id.toString()) {
    return next(new AppError('You do not have permission to cancel this order', 403));
  }
  if (order.status !== 'reserved') {
    return next(new AppError(`This order's status (${order.status}) can no longer be cancelled`, 400));
  }

  const decision = evaluateCancellation({ initiator: 'business', pickupWindowStart: new Date() });

  // See the note in cancelOrder above — this marks the refund as owed,
  // it does not itself move money via a Zarinpal API call.
  if (order.paymentStatus === 'paid' && decision.shouldRefund) {
    order.paymentStatus = 'refunded';
  }

  order.status = 'cancelled';
  await order.save();
  await releaseReservedQuantity(order.surpriseBag, order.quantity);

  res.status(200).json({
    status: 'success',
    message: decision.reason,
    data: { order },
  });
});

/**
 * PATCH /api/v1/orders/:id/pickup
 * Body: { pickupCode }
 *
 * Called by the BUSINESS at the moment the customer physically shows up
 * to collect their bag. Only the business that owns the order may call
 * this. Confirms the code the customer shows on their phone matches, and
 * that the order was actually paid for, before marking it picked up and
 * crediting the customer's impact stats.
 */
exports.confirmPickup = catchAsync(async (req, res, next) => {
  const { pickupCode } = req.body;

  if (!pickupCode) {
    return next(new AppError('pickupCode is required', 400));
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    return next(new AppError('No order found with that id', 404));
  }

  const business = await Business.findById(order.business);
  if (!business || business.ownerUser.toString() !== req.user._id.toString()) {
    return next(new AppError('You do not have permission to confirm pickup for this order', 403));
  }

  if (order.status !== 'reserved') {
    return next(
      new AppError(`This order's status (${order.status}) cannot be picked up`, 400)
    );
  }

  if (order.paymentStatus !== 'paid') {
    return next(new AppError('This order has not been paid for yet', 400));
  }

  // Case-insensitive, trimmed comparison — forgiving of a customer
  // reading the code slightly wrong or the business typing extra spaces,
  // without weakening security (the code space is still large enough
  // that guessing is impractical).
  if (pickupCode.trim().toUpperCase() !== order.pickupCode) {
    return next(new AppError('Incorrect pickup code', 400));
  }

  order.status = 'pickedUp';
  order.pickedUpAt = new Date();
  await order.save();

  // Credit the customer's personal impact dashboard (Step 3 introduced
  // these fields on User; this is the first place that actually
  // increments them).
  const bag = await SurpriseBag.findById(order.surpriseBag);
  if (bag) {
    const impact = calculateImpact(bag.originalPrice, bag.discountedPrice, order.quantity);
    await User.findByIdAndUpdate(order.customer, {
      $inc: {
        'impactStats.totalMealsSaved': impact.mealsSaved,
        'impactStats.totalMoneySaved': impact.moneySaved,
        'impactStats.estimatedCO2Saved': impact.co2Saved,
      },
    });
  }
  // If the bag was somehow already deleted, we still confirm the pickup
  // (the transaction itself is what matters) — we just can't credit
  // impact stats without knowing the original/discounted prices.

  res.status(200).json({
    status: 'success',
    data: { order },
  });
});

/**
 * POST /api/v1/orders/:id/review
 * Body: { rating, comment? }
 *
 * Only the customer who placed the order may review it, and only
 * after it's actually been picked up (rating a bag you never received
 * would be meaningless/unfair to the business).
 */
exports.createReview = catchAsync(async (req, res, next) => {
  const { rating, comment } = req.body;

  if (rating === undefined) {
    return next(new AppError('rating is required', 400));
  }
  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return next(new AppError('rating must be a whole number between 1 and 5', 400));
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    return next(new AppError('No order found with that id', 404));
  }
  if (order.customer.toString() !== req.user._id.toString()) {
    return next(new AppError('You do not have permission to review this order', 403));
  }
  if (order.status !== 'pickedUp') {
    return next(new AppError('You can only review an order after picking it up', 400));
  }

  const existingReview = await Review.findOne({ order: order._id });
  if (existingReview) {
    return next(new AppError('You have already reviewed this order', 409));
  }

  const review = await Review.create({
    order: order._id,
    customer: req.user._id,
    business: order.business,
    rating: ratingNum,
    comment,
  });

  // Recompute the business's running average rating. Reading the
  // current rating/reviewsCount and writing the new average back is
  // not perfectly atomic under extreme concurrency (two reviews landing
  // at the exact same instant), but a business receiving simultaneous
  // reviews is vanishingly rare in practice, and being off by a
  // fraction of a star for a moment is a low-stakes, self-correcting
  // inconsistency — not worth the complexity of a transaction here.
  const business = await Business.findById(order.business);
  if (business) {
    const newReviewsCount = business.reviewsCount + 1;
    const newRating =
      (business.rating * business.reviewsCount + ratingNum) / newReviewsCount;

    business.rating = Math.round(newRating * 10) / 10; // round to 1 decimal place
    business.reviewsCount = newReviewsCount;
    await business.save();
  }

  res.status(201).json({
    status: 'success',
    data: { review },
  });
});

/**
 * POST /api/v1/orders/:id/flag-customer
 * Body: { reason } — 'no-show' or 'bad-behavior'
 *
 * Business-only. To prevent abuse (a business flagging a customer out
 * of spite with no real incident), each reason requires the order to
 * actually be in a matching state:
 *   - 'no-show'      requires order.status === 'noShow'
 *   - 'bad-behavior' requires order.status to be 'pickedUp' or 'noShow'
 *     (i.e. there was at least some real interaction/attempt)
 *
 * Once a customer accumulates more than MAX_FLAGS_BEFORE_RESTRICTION
 * flags (across ALL businesses, not just this one), their account is
 * automatically restricted (User.isRestricted = true), which the
 * `protect` middleware (Step 1) and login controllers already check.
 */
exports.flagCustomer = catchAsync(async (req, res, next) => {
  const { reason } = req.body;

  if (!reason || !['no-show', 'bad-behavior'].includes(reason)) {
    return next(new AppError('reason must be either no-show or bad-behavior', 400));
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    return next(new AppError('No order found with that id', 404));
  }

  const business = await Business.findById(order.business);
  if (!business || business.ownerUser.toString() !== req.user._id.toString()) {
    return next(new AppError('You do not have permission to flag this order', 403));
  }

  if (reason === 'no-show' && order.status !== 'noShow') {
    return next(new AppError('This order is not marked as a no-show', 400));
  }
  if (reason === 'bad-behavior' && !['pickedUp', 'noShow'].includes(order.status)) {
    return next(
      new AppError('bad-behavior can only be reported for a completed or no-show order', 400)
    );
  }

  const existingFlag = await CustomerFlag.findOne({ order: order._id });
  if (existingFlag) {
    return next(new AppError('This order has already been flagged', 409));
  }

  await CustomerFlag.create({
    customer: order.customer,
    business: business._id,
    order: order._id,
    reason,
  });

  const totalFlags = await CustomerFlag.countDocuments({ customer: order.customer });

  if (totalFlags > MAX_FLAGS_BEFORE_RESTRICTION) {
    await User.findByIdAndUpdate(order.customer, { isRestricted: true });
  }

  res.status(201).json({
    status: 'success',
    message: `Customer flagged (${totalFlags} total flag(s))${
      totalFlags > MAX_FLAGS_BEFORE_RESTRICTION ? ' — account has been restricted' : ''
    }`,
  });
});
