/**
 * scripts/run-cron-now.js
 * -----------------------
 * Runs all Step 10/12 cron jobs (expireBags + markNoShows +
 * sendPickupReminders) ONE TIME, immediately — so you can test them
 * without waiting for the real 5-minute schedule.
 *
 * Usage:
 *   node scripts/run-cron-now.js
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { expireBags, markNoShows, sendPickupReminders } = require('../jobs/cronJobs');

(async () => {
  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI is not defined in your .env file.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB — running jobs now...\n');

  const expiredCount = await expireBags();
  console.log(`Bags expired: ${expiredCount}`);

  const noShowCount = await markNoShows();
  console.log(`Orders marked no-show: ${noShowCount}`);

  const reminderCount = await sendPickupReminders();
  console.log(`Pickup reminders sent: ${reminderCount}`);

  await mongoose.disconnect();
  console.log('\nDone.');
})();
