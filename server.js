const dotenv = require('dotenv');

// بارگذاری متغیرهای محیطی قبل از هر import دیگر
dotenv.config({ path: './.env' });

const mongoose = require('mongoose');
const app = require('./app');

// گرفتن جلوی کرش خاموش سرور به‌خاطر خطاهای همگام‌سازی‌نشده (بهترین روش قبل از هر چیز دیگر)
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 در حال خاموش شدن سرور...');
  console.error(err.name, err.message);
  process.exit(1);
});

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ متغیر MONGO_URI در فایل .env تعریف نشده است.');
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ اتصال به MongoDB با موفقیت برقرار شد'))
  .catch((err) => {
    console.error('❌ خطا در اتصال به MongoDB:', err.message);
    process.exit(1);
  });

const server = app.listen(PORT, () => {
  console.log(`🚀 سرور در حال اجرا روی پورت ${PORT} (${process.env.NODE_ENV || 'development'})`);
  console.log(`   Health check: http://localhost:${PORT}/api/v1/health`);
});

// مدیریت خطاهایی که در پرامیس‌ها catch نشده‌اند (مثلاً قطع شدن اتصال دیتابیس)
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 در حال خاموش شدن سرور...');
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});
