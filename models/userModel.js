const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'نام کاربر الزامی است'],
    trim: true,
  },
  phone: {
    type: String,
    required: [true, 'شماره موبایل الزامی است'],
    unique: true,
    trim: true,
    // اعتبارسنجی ساده برای شماره موبایل ایران، مثال: 09123456789
    match: [/^09\d{9}$/, 'شماره موبایل معتبر نیست'],
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    // اختیاری است، اما اگر وارد شد باید فرمت درستی داشته باشد
    match: [/^\S+@\S+\.\S+$/, 'ایمیل معتبر نیست'],
    default: undefined,
  },
  passwordHash: {
    type: String,
    required: [true, 'رمز عبور الزامی است'],
    minlength: 8,
    // هرگز پسورد را در خروجی query ها برنگردان مگر صراحتاً select('+passwordHash') بزنیم
    select: false,
  },
  role: {
    type: String,
    enum: {
      values: ['customer', 'business', 'admin'],
      message: 'نقش کاربر باید customer، business یا admin باشد',
    },
    default: 'customer',
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [lng, lat]
      default: undefined,
    },
  },
  favoriteBusinesses: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
    },
  ],
  impactStats: {
    totalMealsSaved: { type: Number, default: 0 },
    totalMoneySaved: { type: Number, default: 0 },
    estimatedCO2Saved: { type: Number, default: 0 },
  },
  // برای مرحله ۱۱ (گزارش دوطرفه) از همین الان این فیلد را آماده می‌گذاریم
  isRestricted: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// ایندکس جغرافیایی برای جستجوی نزدیک‌ترین کاربران/اعلان‌ها در آینده
userSchema.index({ location: '2dsphere' });

// ---------- Instance Methods ----------

// مقایسه پسورد وارد شده توسط کاربر با هش ذخیره‌شده
userSchema.methods.comparePassword = async function (candidatePassword, userPasswordHash) {
  return bcrypt.compare(candidatePassword, userPasswordHash);
};

module.exports = mongoose.model('User', userSchema);
