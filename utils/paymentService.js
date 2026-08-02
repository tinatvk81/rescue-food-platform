/**
 * paymentService.js
 * -----------------
 * Integration with Zarinpal, a widely-used Iranian payment gateway.
 *
 * SANDBOX BY DEFAULT: unless ZARINPAL_SANDBOX=false is explicitly set,
 * this uses Zarinpal's public sandbox environment and merchant id
 * (00000000-0000-0000-0000-000000000000 — Zarinpal's own published
 * test merchant, not a secret), so you can test the entire payment
 * flow end-to-end before you have a real, approved merchant account.
 * Sandbox payments always "succeed" and never move real money.
 *
 * Uses Node's built-in `fetch` (Node 18+) — no extra HTTP library needed.
 */

const ZARINPAL_MERCHANT_ID =
  process.env.ZARINPAL_MERCHANT_ID || '00000000-0000-0000-0000-000000000000';

const IS_SANDBOX = process.env.ZARINPAL_SANDBOX !== 'false';

const BASE_URL = IS_SANDBOX ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com';

/**
 * Starts a new payment: asks Zarinpal for an "Authority" token, then
 * builds the URL the customer's browser should be redirected to in
 * order to actually pay.
 *
 * @param {object} params
 * @param {number} params.amount - amount in Rials (see the note in
 *   orderController.js about confirming this matches your real
 *   merchant account's expected currency unit before going live)
 * @param {string} params.description
 * @param {string} params.callbackUrl - where Zarinpal redirects the
 *   customer's browser back to after payment (our verify-payment route)
 * @param {object} [params.metadata]
 * @returns {Promise<{authority: string, paymentUrl: string}>}
 */
const requestPayment = async ({ amount, description, callbackUrl, metadata }) => {
  const response = await fetch(`${BASE_URL}/pg/v4/payment/request.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_id: ZARINPAL_MERCHANT_ID,
      amount,
      description,
      callback_url: callbackUrl,
      metadata,
    }),
  });

  const body = await response.json();

  if (!body.data || body.data.code !== 100) {
    const message = body.errors?.message || 'Zarinpal payment request failed';
    throw new Error(message);
  }

  const { authority } = body.data;
  return {
    authority,
    paymentUrl: `${BASE_URL}/pg/StartPay/${authority}`,
  };
};

/**
 * Confirms a payment after the customer returns from Zarinpal.
 *
 * @param {object} params
 * @param {number} params.amount - MUST match the amount originally
 *   requested, or Zarinpal will reject the verification
 * @param {string} params.authority
 * @returns {Promise<{verified: boolean, refId?: string, alreadyVerified?: boolean, error?: string}>}
 */
const verifyPayment = async ({ amount, authority }) => {
  const response = await fetch(`${BASE_URL}/pg/v4/payment/verify.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_id: ZARINPAL_MERCHANT_ID,
      amount,
      authority,
    }),
  });

  const body = await response.json();
  const code = body.data?.code;

  // 100 = verified just now. 101 = was already verified in a previous
  // call (e.g. the customer's browser hit this callback twice) — we
  // treat that as success too, not an error.
  if (code === 100 || code === 101) {
    return { verified: true, refId: body.data.ref_id, alreadyVerified: code === 101 };
  }

  return { verified: false, error: body.errors?.message || `Verification failed (code ${code})` };
};

module.exports = { requestPayment, verifyPayment, IS_SANDBOX };
