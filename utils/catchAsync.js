/**
 * catchAsync.js
 * -------------
 * A higher-order function that wraps any async Express controller/middleware.
 *
 * Problem it solves:
 * Without this, every async controller would need its own try/catch block
 * to forward errors to Express's error-handling middleware, e.g.:
 *
 *   exports.someController = async (req, res, next) => {
 *     try {
 *       // ... logic
 *     } catch (err) {
 *       next(err);
 *     }
 *   };
 *
 * With catchAsync, we just wrap the function once and any rejected promise
 * (thrown error) is automatically forwarded to next(), reaching the global
 * error handler in app.js.
 *
 * Usage:
 *   exports.someController = catchAsync(async (req, res, next) => {
 *     // ... logic, no try/catch needed
 *   });
 *
 * @param {Function} fn - An async Express handler (req, res, next) => Promise
 * @returns {Function} A new handler that catches rejected promises automatically
 */
module.exports = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};
