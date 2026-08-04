/**
 * impactStats.js
 * --------------
 * Shared constant + calculation for a customer's "impact" numbers,
 * updated whenever an order is successfully picked up (see
 * orderController.confirmPickup). Kept in one place so the exact same
 * formula is used everywhere this might matter later (e.g. a future
 * business/admin dashboard showing platform-wide totals in Step 13/14).
 */

// A rough, commonly-cited estimate for the CO2 footprint avoided by
// rescuing one meal from going to landfill (production + methane from
// food waste decomposition). Not scientifically precise — good enough
// for an engaging, directionally-honest "impact" number on the platform.
const CO2_KG_SAVED_PER_MEAL = 2.5;

/**
 * @param {number} originalPrice
 * @param {number} discountedPrice
 * @param {number} quantity
 * @returns {{mealsSaved: number, moneySaved: number, co2Saved: number}}
 */
const calculateImpact = (originalPrice, discountedPrice, quantity) => ({
  mealsSaved: quantity,
  moneySaved: (originalPrice - discountedPrice) * quantity,
  co2Saved: quantity * CO2_KG_SAVED_PER_MEAL,
});

module.exports = { calculateImpact, CO2_KG_SAVED_PER_MEAL };
