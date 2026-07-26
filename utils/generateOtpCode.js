/**
 * generateOtpCode.js
 * ------------------
 * Generates a random 5-digit OTP code as a string, e.g. "04821".
 *
 * Kept in its own tiny file so it's easy to unit-test in isolation
 * later (Step 17), and so the randomness logic isn't buried inside
 * a bigger controller function.
 */

/**
 * @returns {string} a 5-digit numeric code, always exactly 5 characters
 *                   (zero-padded on the left if needed, e.g. "00042")
 */
const generateOtpCode = () => {
  const code = Math.floor(Math.random() * 100000); // 0 to 99999
  return code.toString().padStart(5, '0');
};

module.exports = generateOtpCode;
