/**
 * app.js
 * ------
 * Express application configuration: global middlewares, route mounting,
 * and the centralized error handler.
 *
 * IMPORTANT: this file ONLY configures Express — it does NOT connect to
 * the database or start listening on a port (see server.js). That
 * separation lets test tools (Step 17) import this file directly
 * without a real running server or DB connection.
 */

const path = require('path');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const logger = require('./utils/logger');

const app = express();

// ---------- 1) GLOBAL MIDDLEWARES ----------

// Secure HTTP headers. CSP directives extended beyond Helmet's default
// to allow Google Fonts (Vazirmatn, used by the frontend) — everything
// else stays at Helmet's secure defaults (script-src 'self', etc.).
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'style-src': ["'self'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
      },
    },
  })
);

// Step 15: restricted to the app's own origin instead of allowing "*" —
// safe because the frontend is served by this same Express app.
// `credentials: true` is required for the httpOnly JWT cookie to be
// sent/received correctly.
app.use(
  cors({
    origin: process.env.APP_BASE_URL || 'http://localhost:3000',
    credentials: true,
  })
);

// Human-readable request logging — development only. Production uses
// the structured winston logger instead (see the error handler below).
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// General API rate limiting (a stricter, auth-specific limiter is
// applied separately inside routes/authRoutes.js, Step 15)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api', generalLimiter);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Prevents NoSQL injection via MongoDB operator characters (e.g. `$`)
app.use(mongoSanitize());

// Serves the static frontend (public/index.html, /css, /js, /uploads)
app.use(express.static(path.join(__dirname, 'public')));

// ---------- 2) ROUTES ----------

// Health-check — confirms the Express process itself is alive.
// Does NOT check the database connection (see server.js console logs
// for that instead).
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running successfully',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/v1/auth', require('./routes/authRoutes'));
app.use('/api/v1/businesses', require('./routes/businessRoutes'));
app.use('/api/v1/admin', require('./routes/adminRoutes'));
app.use('/api/v1/bags', require('./routes/bagRoutes'));
app.use('/api/v1/orders', require('./routes/orderRoutes'));
app.use('/api/v1/notifications', require('./routes/notificationRoutes'));

// Catch-all for any route that doesn't match one defined above
app.all('*', (req, res) => {
  res.status(404).json({
    status: 'fail',
    message: `Route ${req.originalUrl} does not exist on this server`,
  });
});

// ---------- 3) GLOBAL ERROR HANDLER ----------
app.use((err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  if (err.code === 11000) {
    statusCode = 409;
    message = 'This value already exists in the system (duplicate)';
  }
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(' | ');
  }
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for ${err.path}: ${err.value}`;
  }
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token, please log in again';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Your session has expired, please log in again';
  }

  // Log every 500-level (unexpected) error with its full stack via
  // winston — in production this becomes a structured JSON log line
  // that a real monitoring setup (or `grep '"level":"error"'`) can find.
  // 4xx (client-fault) errors are NOT logged as errors — they're
  // normal, expected traffic (bad input, wrong password, etc.).
  if (statusCode >= 500) {
    logger.error(message, { stack: err.stack, path: req.originalUrl, method: req.method });
  }

  res.status(statusCode).json({
    status: statusCode.toString().startsWith('4') ? 'fail' : 'error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

module.exports = app;
