/**
 * WaterSaathi - Transparent Pricing Utility
 * 
 * Quotes are calculated deterministically on the backend.
 * Amounts are represented in INR for display and integer paise for persistence.
 */

import { inrToPaise, paiseToInr } from '../../../shared/types.js';

// Sensible pricing bounds in INR per 1000 Litres for urban Maharashtra
export const PRICE_BOUNDS = {
  MIN_RATE_PER_1000L: 150,   // ₹150 / 1000L minimum reasonable rate
  MAX_RATE_PER_1000L: 2000,  // ₹2000 / 1000L maximum reasonable rate
  DEFAULT_RATE_PER_1000L: 500, // ₹500 / 1000L default benchmark
};

/**
 * Calculates standard water quote for a single household order.
 * @param {number} quantityLitres 
 * @param {number} pricePer1000Litres 
 * @returns {{ quotedPriceInr: number, quotedPricePaise: number, ratePer1000Litres: number, isSuspicious: boolean }}
 */
export function calculateQuote(quantityLitres, pricePer1000Litres = PRICE_BOUNDS.DEFAULT_RATE_PER_1000L) {
  const rate = Number(pricePer1000Litres) || PRICE_BOUNDS.DEFAULT_RATE_PER_1000L;
  const litres = Number(quantityLitres);

  // Transparent calculation: (litres / 1000) * rate
  const calculatedInr = Math.round((litres / 1000) * rate);
  const calculatedPaise = inrToPaise(calculatedInr);

  const isSuspicious = rate < PRICE_BOUNDS.MIN_RATE_PER_1000L || rate > PRICE_BOUNDS.MAX_RATE_PER_1000L;

  return {
    quotedPriceInr: calculatedInr,
    quotedPricePaise: calculatedPaise,
    ratePer1000Litres: rate,
    isSuspicious,
  };
}

/**
 * Calculates pooled water quote for a participant in a demand pool.
 * Does not make false promises of dramatic discounts; provides transparent proportional pricing.
 * @param {number} individualLitres 
 * @param {number} totalPooledLitres 
 * @param {number} pricePer1000Litres 
 * @param {number} poolingEfficiencyDiscountPercent (optional, e.g. 5% shared trip discount)
 */
export function calculatePooledQuote(
  individualLitres,
  totalPooledLitres,
  pricePer1000Litres = PRICE_BOUNDS.DEFAULT_RATE_PER_1000L,
  poolingEfficiencyDiscountPercent = 5
) {
  const baseQuote = calculateQuote(individualLitres, pricePer1000Litres);
  const discountMultiplier = Math.max(0.85, 1 - (poolingEfficiencyDiscountPercent / 100));
  
  const pooledInr = Math.round(baseQuote.quotedPriceInr * discountMultiplier);
  const pooledPaise = inrToPaise(pooledInr);

  return {
    individualLitres,
    totalPooledLitres,
    standardPriceInr: baseQuote.quotedPriceInr,
    quotedPriceInr: pooledInr,
    quotedPricePaise: pooledPaise,
    savingsInr: baseQuote.quotedPriceInr - pooledInr,
    ratePer1000Litres: baseQuote.ratePer1000Litres,
  };
}
