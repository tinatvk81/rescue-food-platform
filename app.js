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

// Security HTTP headers
app.use(helmet());

// CORS — در آینده origin را به دامنه فرانت‌اند واقعی محدود کن
app.use(cors());

// Request logging (فقط در حالت development)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Rate limiting برای کل API (محافظت پایه در برابر سوءاستفاده)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقیقه
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'تعداد درخواست‌های شما بیش از حد مجاز است، لطفاً بعداً تلاش کنید.',
});
app.use('/api', generalLimiter);

// Body parser — خواندن داده از req.body (با محدودیت حجم برای امنیت)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// جلوگیری از NoSQL query injection
app.use(mongoSanitize());

// سرو کردن فایل‌های استاتیک فرانت‌اند (HTML/CSS/JS)
app.use(express.static(path.join(__dirname, 'public')));

// ---------- 2) ROUTES ----------

// Health-check route — برای اطمینان از بالا بودن سرویس
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'سرور با موفقیت در حال اجراست',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/v1/auth', require('./routes/authRoutes'));

// TODO: در مراحل بعدی روت‌های واقعی اینجا اضافه می‌شوند، مثال:
// app.use('/api/v1/businesses', require('./routes/businessRoutes'));
// app.use('/api/v1/bags', require('./routes/bagRoutes'));
// app.use('/api/v1/orders', require('./routes/orderRoutes'));

// مدیریت روت‌های تعریف‌نشده
app.all('*', (req, res) => {
  res.status(404).json({
    status: 'fail',
    message: `مسیر ${req.originalUrl} روی این سرور وجود ندارد`,
  });
});

// ---------- 3) GLOBAL ERROR HANDLER ----------
app.use((err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'خطای داخلی سرور';

  // خطای Mongoose duplicate key (مثلاً شماره موبایل تکراری که مستقیم از ایندکس یکتا رد شده)
  if (err.code === 11000) {
    statusCode = 409;
    message = 'این مقدار قبلاً در سیستم ثبت شده است (تکراری است)';
  }

  // خطای Mongoose validation (مثلاً فیلد الزامی خالی مانده یا فرمت اشتباه است)
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(' | ');
  }

  // خطای Mongoose CastError (مثلاً ObjectId نامعتبر در پارامتر آدرس)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `مقدار نامعتبر برای ${err.path}: ${err.value}`;
  }

  // خطاهای JWT
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'توکن نامعتبر است، لطفاً دوباره وارد شوید';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'نشست شما منقضی شده است، لطفاً دوباره وارد شوید';
  }

  res.status(statusCode).json({
    status: statusCode.toString().startsWith('4') ? 'fail' : 'error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

module.exports = app;
