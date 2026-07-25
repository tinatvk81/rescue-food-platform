const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

// ---------- توابع کمکی ----------

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// یک تابع مشترک برای ساخت توکن، ست کردن کوکی امن، و ارسال پاسخ
// (در مراحل بعدی برای OTP و سایر مسیرهای ورود هم از همین استفاده می‌کنیم)
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  // تبدیل "7d" به میلی‌ثانیه برای cookie expiry
  const expiresInDays = parseInt(process.env.JWT_EXPIRES_IN, 10) || 7;

  res.cookie('jwt', token, {
    expires: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    httpOnly: true, // جاوااسکریپت سمت کلاینت نمی‌تواند این کوکی را بخواند (محافظت در برابر XSS)
    secure: process.env.NODE_ENV === 'production', // فقط روی HTTPS در production
    sameSite: 'strict',
  });

  // هرگز passwordHash را در پاسخ برنگردان
  user.passwordHash = undefined;

  res.status(statusCode).json({
    status: 'success',
    token, // برای کلاینت‌هایی که ترجیح می‌دهند توکن را جدا هم داشته باشند (مثلاً موبایل اپ آینده)
    data: {
      user,
    },
  });
};

// ---------- Controllers ----------

exports.signup = catchAsync(async (req, res, next) => {
  const { name, phone, password, email } = req.body;

  if (!name || !phone || !password) {
    return next(new AppError('نام، شماره موبایل و رمز عبور الزامی است', 400));
  }

  if (password.length < 8) {
    return next(new AppError('رمز عبور باید حداقل ۸ کاراکتر باشد', 400));
  }

  // بررسی تکراری نبودن شماره موبایل (پیام خطای واضح‌تر از خطای duplicate-key خام Mongo)
  const existingUser = await User.findOne({ phone });
  if (existingUser) {
    return next(new AppError('کاربری با این شماره موبایل قبلاً ثبت‌نام کرده است', 409));
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const newUser = await User.create({
    name,
    phone,
    email,
    passwordHash,
  });

  createSendToken(newUser, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return next(new AppError('شماره موبایل و رمز عبور را وارد کنید', 400));
  }

  // passwordHash به‌طور پیش‌فرض select:false است، پس باید صراحتاً درخواستش کنیم
  const user = await User.findOne({ phone }).select('+passwordHash');

  if (!user || !(await user.comparePassword(password, user.passwordHash))) {
    return next(new AppError('شماره موبایل یا رمز عبور اشتباه است', 401));
  }

  if (user.isRestricted) {
    return next(new AppError('حساب کاربری شما محدود شده است', 403));
  }

  createSendToken(user, 200, res);
});

exports.logout = (req, res) => {
  // کوکی را با یک مقدار بی‌معنی و انقضای فوری جایگزین می‌کنیم
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 1000), // ۱ ثانیه دیگر منقضی شود
    httpOnly: true,
  });

  res.status(200).json({ status: 'success', message: 'با موفقیت خارج شدید' });
};
