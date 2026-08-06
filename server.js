/**
 * server.js
 * ---------
 * The actual entry point of the application (this is what `npm start`
 * and `npm run dev` execute).
 *
 * Responsibilities (kept separate from app.js on purpose):
 *   1. Load environment variables from .env
 *   2. Set up crash-safety handlers for uncaught errors
 *   3. Connect to MongoDB
 *   4. Start the Express server (imported from app.js) listening on a port
 */

const dotenv = require('dotenv');

// Load .env variables into process.env before anything else needs them
dotenv.config({ path: './.env' });

const mongoose = require('mongoose');
const app = require('./app');
const cronJobs = require('./jobs/cronJobs');

// Catches synchronous errors that weren't handled anywhere else
// (e.g. referencing an undefined variable). Best practice: handle this
// before anything else runs, and shut down cleanly rather than leaving
// the process in a broken state.
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI is not defined in your .env file.');
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('✅ Successfully connected to MongoDB');
    // Only start the recurring jobs once we KNOW the DB connection is
    // up — starting them earlier would make every scheduled run fail
    // with a Mongoose buffering timeout.
    cronJobs.start();
  })
  .catch((err) => {
    console.error('❌ Error connecting to MongoDB:', err.message);
    process.exit(1);
  });

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  console.log(`   Health check: http://localhost:${PORT}/api/v1/health`);
});

// Catches errors from rejected Promises that weren't caught anywhere
// (e.g. the database connection dropping unexpectedly after startup)
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});
