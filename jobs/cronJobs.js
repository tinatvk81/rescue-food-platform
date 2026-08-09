/**
 * cronJobs.js
 * -----------
 * Scheduled background jobs, run every 5 minutes:
 *
 *   1. expireBags()         — flips 'active' bags past pickupWindowEnd to 'expired'.
 *   2. markNoShows()        — flips 'reserved' orders past their bag's
 *      pickupWindowEnd to 'noShow' (never refunded).
 *   3. sendPickupReminders() — [NEW in Step 12] notifies customers whose
 *      pickup window ends within the next hour and haven't been
 *      reminded yet.
 *
 * Each function is exported individually so they can also be
 * triggered directly/tested without waiting for the real 5-minute
 * timer — see scripts/run-cron-now.js.
 */

const cron = require('node-cron');
const SurpriseBag = require('../models/surpriseBagModel');
const Order = require('../models/orderModel');
const notify = require('../utils/notify');

const REMINDER_WINDOW_MINUTES = 60;

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
 * window has ended.
 * @returns {Promise<number>} how many orders were updated
 */
const markNoShows = async () => {
  const now = new Date();

  const pastBags = await SurpriseBag.find({ pickupWindowEnd: { $lt: now } }).select('_id');
  const pastBagIds = pastBags.map((bag) => bag._id);

  if (pastBagIds.length === 0) return 0;

  const result = await Order.updateMany(
    { status: 'reserved', surpriseBag: { $in: pastBagIds } },
    { $set: { status: 'noShow' } }
  );
  if (result.modifiedCount > 0) {
    console.log(`🕐 [cron] Marked ${result.modifiedCount} order(s) as no-show`);
  }
  return result.modifiedCount;
};

/**
 * Job 3 [Step 12]: notify customers whose bag's pickup window ends
 * within the next hour, so they don't accidentally no-show.
 * Uses `Order.pickupReminderSent` to guarantee each order is only
 * reminded once, even though this job runs every 5 minutes.
 * @returns {Promise<number>} how many reminders were sent
 */
const sendPickupReminders = async () => {
  const now = new Date();
  const reminderThreshold = new Date(now.getTime() + REMINDER_WINDOW_MINUTES * 60 * 1000);

  const soonBags = await SurpriseBag.find({
    status: 'active',
    pickupWindowEnd: { $gt: now, $lte: reminderThreshold },
  }).select('_id title pickupWindowEnd');

  if (soonBags.length === 0) return 0;

  const soonBagIds = soonBags.map((bag) => bag._id);
  const bagById = new Map(soonBags.map((bag) => [bag._id.toString(), bag]));

  const ordersNeedingReminder = await Order.find({
    status: 'reserved',
    surpriseBag: { $in: soonBagIds },
    pickupReminderSent: { $ne: true },
  });

  for (const order of ordersNeedingReminder) {
    const bag = bagById.get(order.surpriseBag.toString());
    await notify(
      order.customer,
      'pickupReminder',
      `Reminder: your order "${bag.title}" must be picked up before ${bag.pickupWindowEnd.toLocaleString()}.`
    );
    order.pickupReminderSent = true;
    await order.save();
  }

  if (ordersNeedingReminder.length > 0) {
    console.log(`🕐 [cron] Sent ${ordersNeedingReminder.length} pickup reminder(s)`);
  }
  return ordersNeedingReminder.length;
};

/**
 * Runs all three jobs once, in order. Errors are caught and logged
 * rather than thrown, since this runs on a timer with no one around
 * to catch a rejected promise.
 */
const runAllJobs = async () => {
  try {
    await expireBags();
    await markNoShows();
    await sendPickupReminders();
  } catch (err) {
    console.error('❌ [cron] Error running scheduled jobs:', err.message);
  }
};

/**
 * Starts the recurring schedule (every 5 minutes). Call this ONCE,
 * after the MongoDB connection is established (see server.js).
 */
const start = () => {
  cron.schedule('*/5 * * * *', runAllJobs);
  console.log('⏰ Cron jobs scheduled (every 5 minutes): expire bags, mark no-shows, pickup reminders');
};

module.exports = { start, expireBags, markNoShows, sendPickupReminders, runAllJobs };
