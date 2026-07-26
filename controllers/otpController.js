/**
 * otpController.js
 * ----------------
 * Implements passwordless login via a one-time code sent by SMS:
 *
 *   POST /api/v1/auth/request-otp  -> generate + "send" a 5-digit code
 *   POST /api/v1/auth/verify-otp   -> verify the code, issue a JWT
 *
 * Flow:
 *   1. User submits their phone number to /request-otp.
 *   2. We generate a random 5-digit code, hash it, store the hash
 *      (never the plain code) with a 2-minute expiry, and "send" it
 *      via smsService (currently mocked — see utils/smsService.js).
 *   3. User submits the code they received to /verify-otp.
 *   4. If it matches and hasn't expired, we log them in — creating a
 *      new account automatically if this phone number has never signed
 *      up before (passwordless accounts get a random, unusable password
 *      hash just to satisfy the User schema's required field).
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/userModel');
const Otp = require('../models/otpModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const { createSendToken } = require('../utils/token');
const generateOtpCode = require('../utils/generateOtpCode');
const { sendOtpSms } = require('../utils/smsService');

const OTP_EXPIRY_MINUTES = 2;
const MAX_VERIFY_ATTEMPTS = 5; // blocks brute-forcing a 5-digit code

const PHONE_REGEX = /^09\d{9}$/;

/**
 * POST /api/v1/auth/request-otp
 * Body: { phone }
 *
 * Generates a new OTP, stores its hash, and sends it via SMS (mocked).
 * Rate-limited separately at the route level (see routes/authRoutes.js)
 * to a maximum of 3 requests per phone number per 10 minutes.
 */
exports.requestOtp = catchAsync(async (req, res, next) => {
  const { phone } = req.body;

  if (!phone) {
    return next(new AppError('Phone number is required', 400));
  }
  if (!PHONE_REGEX.test(phone)) {
    return next(new AppError('Please provide a valid Iranian mobile number', 400));
  }

  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Remove any previous, still-active OTPs for this phone first.
  // This guarantees there is only ever ONE valid code per phone at a
  // time — requesting a new code immediately invalidates an older one,
  // which is both simpler to reason about and more secure.
  await Otp.deleteMany({ phone });

  await Otp.create({ phone, codeHash, expiresAt });

  await sendOtpSms(phone, code);

  res.status(200).json({
    status: 'success',
    message: `A verification code has been sent to ${phone}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
    // DEV-ONLY CONVENIENCE: expose the raw code in the API response so you
    // can test the flow locally without hooking up a real SMS provider.
    // This must NEVER ship to production — remove or guard it before deploying.
    ...(process.env.NODE_ENV !== 'production' && { devOnlyCode: code }),
  });
});

/**
 * POST /api/v1/auth/verify-otp
 * Body: { phone, code, name? }
 *
 * `name` is only used if this phone number has never signed up before
 * (i.e. we're creating a brand-new account through the OTP flow).
 */
exports.verifyOtp = catchAsync(async (req, res, next) => {
  const { phone, code, name } = req.body;

  if (!phone || !code) {
    return next(new AppError('Phone number and code are required', 400));
  }

  // There should only ever be one active OTP per phone (request-otp
  // deletes older ones), but we sort by newest just to be safe.
  const otpRecord = await Otp.findOne({ phone }).sort({ createdAt: -1 });

  if (!otpRecord) {
    return next(
      new AppError('No active code found for this number. Please request a new one', 400)
    );
  }

  if (otpRecord.attempts >= MAX_VERIFY_ATTEMPTS) {
    return next(
      new AppError('Too many failed attempts. Please request a new code', 429)
    );
  }

  // Note: expired documents are usually removed automatically by MongoDB's
  // TTL index (see otpModel.js), but the TTL monitor only sweeps roughly
  // once per minute — so we still double-check expiresAt here to avoid a
  // race condition where a code is technically expired but not yet purged.
  if (otpRecord.expiresAt.getTime() < Date.now()) {
    return next(new AppError('This code has expired. Please request a new one', 400));
  }

  const isMatch = await bcrypt.compare(code, otpRecord.codeHash);

  if (!isMatch) {
    otpRecord.attempts += 1;
    await otpRecord.save();
    return next(new AppError('Invalid code', 401));
  }

  // Code is correct and unexpired — it's now used up, delete it
  // immediately so it can never be replayed.
  await otpRecord.deleteOne();

  // Find an existing account, or create a new one for first-time
  // OTP logins (passwordless signup).
  let user = await User.findOne({ phone });

  if (!user) {
    // The User schema requires a passwordHash, but this account has no
    // real password — it only ever logs in via OTP. We generate a long
    // random value the user could never guess or type, purely to satisfy
    // the schema. (A future feature could let them set a real password
    // afterwards from their profile settings.)
    const randomPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);

    user = await User.create({
      name: name || `User ${phone.slice(-4)}`,
      phone,
      passwordHash: randomPasswordHash,
    });
  }

  if (user.isRestricted) {
    return next(new AppError('Your account has been restricted', 403));
  }

  createSendToken(user, 200, res);
});
