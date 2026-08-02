/**
 * generatePickupCode.js
 * ---------------------
 * Generates a random 6-character pickup code, e.g. "K7H2XQ".
 *
 * Uses only unambiguous uppercase letters and digits — excludes
 * characters that are easy to misread out loud or on a small phone
 * screen at a busy pickup counter: 0/O, 1/I/L, and vowels aren't
 * excluded here since customers read (not spell) the code, but the
 * confusable-character exclusion still meaningfully reduces mistaken
 * entries by the business at pickup time (Step 9).
 */

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

const generatePickupCode = () => {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return code;
};

module.exports = generatePickupCode;
