/**
 * refundPolicy.js
 * ---------------
 * Pure decision logic for whether a cancellation is allowed and whether
 * it should be refunded. Kept as a standalone, side-effect-free function
 * (no database calls) so it's trivial to unit test with any combination
 * of dates — the actual database writes (releasing inventory, updating
 * paymentStatus) happen in orderController.js, which calls this first.
 *
 * Policy (as agreed earlier in this project):
 *   - Business-initiated cancellation: ALWAYS allowed, ALWAYS refunded.
 *     A business can cancel any of its own orders at any time (e.g. it
 *     turns out they don't actually have the food ready) — the customer
 *     should never be out of pocket for the business's own mistake.
 *   - Customer-initiated cancellation: only allowed if it's at least
 *     30 minutes before the pickup window starts, and if allowed, is
 *     fully refunded. Cancelling too close to pickup isn't allowed at
 *     all, since the business may have already set the food aside.
 *   - No-show (customer never picks up in time): NOT handled here —
 *     that's a separate, automatic outcome applied by the Step 10 cron
 *     job, and per policy is NEVER refunded (to make the reservation
 *     commitment meaningful).
 */

const CUSTOMER_CANCEL_MIN_MINUTES_BEFORE_PICKUP = 30;

/**
 * @param {object} params
 * @param {'customer'|'business'} params.initiator
 * @param {Date|string} params.pickupWindowStart
 * @param {Date} [params.now] - injectable for testing; defaults to the real current time
 * @returns {{allowed: boolean, shouldRefund: boolean, reason: string}}
 */
const evaluateCancellation = ({ initiator, pickupWindowStart, now = new Date() }) => {
  if (initiator === 'business') {
    return {
      allowed: true,
      shouldRefund: true,
      reason: 'Business-initiated cancellations are always allowed and fully refunded.',
    };
  }

  if (initiator === 'customer') {
    const minutesUntilPickup =
      (new Date(pickupWindowStart).getTime() - now.getTime()) / (60 * 1000);

    if (minutesUntilPickup >= CUSTOMER_CANCEL_MIN_MINUTES_BEFORE_PICKUP) {
      return {
        allowed: true,
        shouldRefund: true,
        reason: `Cancelled ${Math.round(minutesUntilPickup)} minute(s) before pickup (>= ${CUSTOMER_CANCEL_MIN_MINUTES_BEFORE_PICKUP} required).`,
      };
    }

    return {
      allowed: false,
      shouldRefund: false,
      reason: `Cancellations are only allowed at least ${CUSTOMER_CANCEL_MIN_MINUTES_BEFORE_PICKUP} minutes before the pickup window starts.`,
    };
  }

  throw new Error(`Unknown cancellation initiator: ${initiator}`);
};

module.exports = { evaluateCancellation, CUSTOMER_CANCEL_MIN_MINUTES_BEFORE_PICKUP };
