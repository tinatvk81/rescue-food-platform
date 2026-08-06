/**
 * cronJobs.js
 * -----------
 * Scheduled background jobs, run every 5 minutes:
 *
 *   1. expireBags()  — flips any 'active' SurpriseBag whose
 *      pickupWindowEnd has passed to 'expired', so it stops appearing
 *      in nearby search (Step 6) and can no longer be reserved.
 *
 *   2. markNoShows() — flips any still-'reserved' Order whose bag's
 *      pickupWindowEnd has passed to 'noShow'. Per the cancellation
 *      policy (utils/refundPolicy.js, Step 8), no-shows are NEVER
 *      refunded — paymentStatus is deliberately left untouched here,
 *      even for orders that were already 'paid'.
 *
 * Each function is exported individually (not just wired into the
 * schedule) so they can also be triggered directly/tested without
 * waiting for the real 5-minute timer — see scripts/run-cron-now.js.
 */

const cron = require('node-cron');
const SurpriseBag = require('../models/surpriseBagModel');
const Order = require('../models/orderModel');

/**
 * Job 1: expire bags whose pickup window has ended.
 * @returns {Promise<number>} how many bags were updated
 */
const expireBags = async () => {
  const result = await SurpriseBag.updateMany(
    { status: 'active', pickupWindowEnd: { $lt: new Date() } },
    { $set: { status: 'expired' } }
  );
  if (result.modifiedCount > 0) {
    console.log(`🕐 [cron] Expired ${result.modifiedCount} surprise bag(s)`);
  }
  return result.modifiedCount;
};

/**
 * Job 2: mark still-reserved orders as no-show once their bag's pickup
 * window has ended. Deliberately checks bags in ANY status (not just
 * the ones expireBags() just flipped) — a bag could already be
 * 'soldOut', 'cancelled', or (from a previous run) 'expired' while
 * still having a lingering 'reserved' order that needs resolving.
 * @returns {Promise<number>} how many orders were updated
 */
const markNoShows = async () => {
  const now = new Date();

  const pastBags = await SurpriseBag.find({ pickupWindowEnd: { $lt: now } }).select('_id');
  const pastBagIds = pastBags.map((bag) => bag._id);

  if (pastBagIds.length === 0) return 0;

  const result = await Order.updateMany(
    { status: 'reserved', surpriseBag: { $in: pastBagIds } },
    // Deliberately NOT touching paymentStatus here — a 'paid' order
    // simply stays 'paid' even though the customer never showed up,
    // per the no-refund-for-no-show policy.
    { $set: { status: 'noShow' } }
  );
  if (result.modifiedCount > 0) {
    console.log(`🕐 [cron] Marked ${result.modifiedCount} order(s) as no-show`);
  }
  return result.modifiedCount;
};

/**
 * Runs both jobs once, in order (expire bags first, then resolve
 * orders against the now-current bag statuses). Errors are caught and
 * logged rather than thrown, since this runs on a timer with no one
 * around to catch a rejected promise.
 */
const runAllJobs = async () => {
  try {
    await expireBags();
    await markNoShows();
  } catch (err) {
    console.error('❌ [cron] Error running scheduled jobs:', err.message);
  }
};

/**
 * Starts the recurring schedule (every 5 minutes). Call this ONCE,
 * after the MongoDB connection is established (see server.js) — calling
 * it before that would make every run fail with a buffering timeout.
 */
const start = () => {
  cron.schedule('*/5 * * * *', runAllJobs);
  console.log('⏰ Cron jobs scheduled (every 5 minutes): expire bags, mark no-shows');
};

module.exports = { start, expireBags, markNoShows, runAllJobs };
