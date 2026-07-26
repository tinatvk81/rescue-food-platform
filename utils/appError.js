/**
 * appError.js
 * -----------
 * A custom Error class used throughout the app for "operational" errors —
 * predictable, expected errors like "user not found" or "wrong password",
 * as opposed to unexpected programming bugs.
 *
 * Why we need this:
 * The global error handler in app.js checks `err.statusCode` and `err.status`
 * to decide what to send back to the client. By throwing an AppError instead
 * of a plain Error, every controller can produce clean, consistent API
 * error responses without repeating this logic everywhere.
 */
class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message sent to the client
   * @param {number} statusCode - HTTP status code (e.g. 400, 401, 404, 409)
   */
  constructor(message, statusCode) {
    super(message);

    this.statusCode = statusCode;
    // Any 4xx code is a "fail" (client's fault), anything else is a server "error"
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    // Keeps the stack trace clean, excluding this constructor call from it
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
