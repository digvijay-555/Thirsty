/**
 * Unit Tests: Transparent Pricing Engine & Currency Conversions
 */

import { calculateQuote, calculatePooledQuote, PRICE_BOUNDS } from '../src/shared/pricing.js';
import { inrToPaise, paiseToInr } from '../../shared/types.js';

export function runPricingTests(assert) {
  // 1. Deterministic Quote Calculation
  {
    // 2000 Litres at ₹500/1000L = ₹1000
    const quote = calculateQuote(2000, 500);
    assert.strictEqual(quote.quotedPriceInr, 1000, '2000L @ ₹500/1000L must equal ₹1000');
    assert.strictEqual(quote.quotedPricePaise, 100000, '₹1000 must equal 100000 paise');
    assert.strictEqual(quote.isSuspicious, false, '₹500/1000L is within normal price bounds');

    // Default rate check
    const defaultQuote = calculateQuote(1000);
    assert.strictEqual(defaultQuote.quotedPriceInr, PRICE_BOUNDS.DEFAULT_RATE_PER_1000L);
  }

  // 2. Paise / INR conversions
  {
    assert.strictEqual(inrToPaise(500), 50000, '₹500 is 50,000 paise');
    assert.strictEqual(inrToPaise(12.5), 1250, '₹12.50 is 1250 paise');
    assert.strictEqual(paiseToInr(50000), 500, '50,000 paise is ₹500');
    assert.strictEqual(paiseToInr(1250), 12.5, '1250 paise is ₹12.5');
  }

  // 3. Pooled Order Transparent Quote
  {
    // 1000 Litres order in a 3000 Litres pool
    const pooledQuote = calculatePooledQuote(1000, 3000, 500, 5); // 5% pool discount
    assert.strictEqual(pooledQuote.standardPriceInr, 500, 'Base single-trip quote is ₹500');
    assert.strictEqual(pooledQuote.quotedPriceInr, 475, 'Pooled quote with 5% discount is ₹475');
    assert.strictEqual(pooledQuote.savingsInr, 25, 'Savings is ₹25');
    assert.strictEqual(pooledQuote.individualLitres, 1000, 'Household retains individual quantity');
  }

  // 4. Suspicious Price Flagging
  {
    const lowRateQuote = calculateQuote(1000, 50); // ₹50/1000L suspiciously low
    assert.strictEqual(lowRateQuote.isSuspicious, true, 'Rate below minimum bound should be flagged');

    const highRateQuote = calculateQuote(1000, 3000); // ₹3000/1000L suspiciously high
    assert.strictEqual(highRateQuote.isSuspicious, true, 'Rate above maximum bound should be flagged');
  }
}
