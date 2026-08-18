/**
 * logger.js
 * ---------
 * Structured logging with winston, for production error monitoring.
 * `morgan` (already in app.js) is fine for human-readable request logs
 * during local development, but production needs structured
 * (JSON) logs so a log-aggregation service (or just `grep`) can
 * reliably parse timestamps, levels, and error stacks.
 *
 * Most PaaS platforms (Render, Railway, etc.) automatically capture
 * anything written to stdout/stderr as your app's log stream — so a
 * console transport is enough; no file-writing or external log
 * service integration is needed to get basic production visibility.
 */

const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format:
    process.env.NODE_ENV === 'production'
      ? winston.format.combine(winston.format.timestamp(), winston.format.json())
      : winston.format.combine(winston.format.colorize(), winston.format.simple()),
  transports: [new winston.transports.Console()],
});

module.exports = logger;
