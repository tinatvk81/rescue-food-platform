/**
 * scripts/run-cron-now.js
 * -----------------------
 * Runs the Step 10 cron jobs (expireBags + markNoShows) ONE TIME,
 * immediately — so you can test them without waiting for the real
 * 5-minute schedule.
 *
 * Usage:
 *   node scripts/run-cron-now.js
 *
 * Connects to the same MongoDB as the main app (reads MONGO_URI from
 * .env), runs the jobs once, prints how many documents each job
 * updated, then disconnects and exits.
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { expireBags, markNoShows } = require('../jobs/cronJobs');

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

  await mongoose.disconnect();
  console.log('\nDone.');
})();
