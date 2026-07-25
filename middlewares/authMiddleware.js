const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

// میدل‌ور protect: بررسی می‌کند کاربر لاگین کرده و JWT معتبر دارد
exports.protect = catchAsync(async (req, res, next) => {
  // ۱) خواندن توکن از کوکی httpOnly (چیزی که در login ست کردیم)
  let token;
  if (req.cookies && req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(
      new AppError('برای دسترسی به این بخش باید وارد حساب کاربری خود شوید', 401)
    );
  }

  // ۲) اعتبارسنجی توکن (امضا و تاریخ انقضا)
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // ۳) بررسی اینکه کاربر مرتبط با این توکن هنوز وجود دارد
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError('کاربری که به این توکن تعلق دارد دیگر وجود ندارد', 401)
    );
  }

  // ۴) بررسی محدودیت حساب (برای مرحله ۱۱ - گزارش دوطرفه no-show)
  if (currentUser.isRestricted) {
    return next(
      new AppError('حساب کاربری شما به‌دلیل تخلفات مکرر محدود شده است', 403)
    );
  }

  // همه چیز اوکی است — کاربر را روی req قرار بده تا در controllerهای بعدی قابل استفاده باشد
  req.user = currentUser;
  next();
});

// میدل‌ور restrictTo: محدود کردن دسترسی بر اساس نقش کاربر
// استفاده: router.post('/', protect, restrictTo('admin'), someController)
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('شما مجوز انجام این عملیات را ندارید', 403)
      );
    }
    next();
  };
};
