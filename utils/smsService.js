/**
 * smsService.js
 * -------------
 * Sends SMS messages. This is currently a MOCK implementation — it does
 * NOT send a real text message. Instead, it logs the code to the server
 * console so you can develop and test the OTP flow without paying for
 * or configuring a real SMS provider.
 *
 * WHY IT'S BUILT THIS WAY:
 * The function signature (`sendOtpSms(phone, code)`) and return shape
 * are designed to match what a real provider call would look like, so
 * that swapping in a real provider later (e.g. Kavenegar, a popular
 * Iranian SMS gateway) only requires editing the inside of this one
 * function — no other file in the project needs to change.
 *
 * TODO (replace this mock with a real Kavenegar integration):
 *   1. npm install kavenegar
 *   2. const Kavenegar = require('kavenegar').KavenegarApi({ apikey: process.env.KAVENEGAR_API_KEY });
 *   3. Replace the body of sendOtpSms with:
 *        return new Promise((resolve, reject) => {
 *          Kavenegar.VerifyLookup(
 *            { receptor: phone, token: code, template: 'otplogin' },
 *            (response, status) => {
 *              if (status === 200) resolve({ success: true, provider: 'kavenegar', response });
 *              else reject(new Error('Failed to send SMS via Kavenegar'));
 *            }
 *          );
 *        });
 *   4. Add KAVENEGAR_API_KEY to .env / .env.example
 */

/**
 * "Sends" an OTP code to a phone number (mocked — just logs to console).
 *
 * @param {string} phone - Recipient's phone number, e.g. "09123456789"
 * @param {string} code - The plain-text OTP code to deliver
 * @returns {Promise<{success: boolean, provider: string}>}
 */
const sendOtpSms = async (phone, code) => {
  // In a real integration, this console.log would be replaced by an
  // actual HTTP call to the SMS provider's API.
  console.log(`📱 [MOCK SMS] Sending OTP code "${code}" to ${phone}`);

  return { success: true, provider: 'mock' };
};

module.exports = { sendOtpSms };
