// کلاس خطای سفارشی برای خطاهای قابل‌پیش‌بینی (operational errors)
// مثل "این کاربر پیدا نشد" یا "رمز عبور اشتباه است" — نه باگ‌های برنامه‌نویسی
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
