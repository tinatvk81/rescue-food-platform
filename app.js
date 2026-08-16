/**
 * app.js
 * ------
 * Express application configuration: global middlewares, route mounting,
 * and the centralized error handler.
 *
 * IMPORTANT: this file ONLY configures Express — it does NOT connect to
 * the database or start listening on a port. That separation (done in
 * server.js) means this file can be imported directly by test tools
 * (e.g. Jest + Supertest) without needing a real running server or DB
 * connection, which is exactly what we'll rely on in Step 17 (Testing).
 */

const path = require('path');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

const app = express();

// ---------- 1) GLOBAL MIDDLEWARES ----------

// Sets secure HTTP headers (protects against several common web vulnerabilities)
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

// Allows cross-origin requests from the frontend.
// TODO: restrict `origin` to the real frontend domain before going to production.
app.use(cors({
  origin: process.env.APP_BASE_URL || 'http://localhost:3000',
  credentials: true,
}));

// Logs every incoming request to the console — only in development,
// so production logs stay clean (e.g. "GET /api/v1/health 200 8ms")
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Rate limiting across the whole API — basic protection against abuse/brute force
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api', generalLimiter);

// Parses incoming JSON/urlencoded bodies into req.body (size-limited for safety)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Strips any MongoDB operator characters (like `$`) from user input,
// preventing NoSQL injection attacks
app.use(mongoSanitize());

// Serves static frontend files (HTML/CSS/JS) placed in /public.
// e.g. public/index.html would become reachable at http://.../
app.use(express.static(path.join(__dirname, 'public')));

// ---------- 2) ROUTES ----------

// Health-check route — confirms the server process is alive and responding.
// NOTE: this does NOT check the database connection, only that Express itself
// is running.
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

// TODO: mount future route modules here

// Catch-all for any route that doesn't match one defined above
app.all('*', (req, res) => {
  res.status(404).json({
    status: 'fail',
    message: `Route ${req.originalUrl} does not exist on this server`,
  });
});

// ---------- 3) GLOBAL ERROR HANDLER ----------
// Express recognizes this as an error handler because it takes 4 arguments
// (err, req, res, next). Any error passed to next(err) anywhere in the app
// (including via catchAsync) ends up here.
app.use((err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  // MongoDB duplicate key error (e.g. a unique index was violated directly,
  // bypassing our manual pre-check)
  if (err.code === 11000) {
    statusCode = 409;
    message = 'This value already exists in the system (duplicate)';
  }

  // Mongoose validation error (e.g. a required field is missing or malformed)
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(' | ');
  }

  // Mongoose CastError (e.g. an invalid ObjectId was passed in a URL param)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for ${err.path}: ${err.value}`;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token, please log in again';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Your session has expired, please log in again';
  }

  res.status(statusCode).json({
    status: statusCode.toString().startsWith('4') ? 'fail' : 'error',
    message,
    // Stack traces are only exposed in development, never in production
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});



module.exports = app;
