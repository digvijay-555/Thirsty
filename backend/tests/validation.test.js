/**
 * Unit Tests: Input Validation Layer
 */

import {
  validateCoordinates,
  validateQuantityLitres,
  validateIsoTimestamp,
  validateWaterType,
  validateLocationSource,
  validateShortageReportStatus,
} from '../src/shared/validation.js';

export function runValidationTests(assert) {
  // 1. Coordinate Validation
  {
    const valid = validateCoordinates(19.8762, 75.3433);
    assert.strictEqual(valid.valid, true, 'Valid coordinates should pass');
    assert.strictEqual(valid.latitude, 19.8762, 'Latitude should be parsed as number');
    assert.strictEqual(valid.longitude, 75.3433, 'Longitude should be parsed as number');

    const outOfBoundsLat = validateCoordinates(95.0, 75.34);
    assert.strictEqual(outOfBoundsLat.valid, false, 'Latitude > 90 must fail');

    const outOfBoundsLng = validateCoordinates(19.0, 185.0);
    assert.strictEqual(outOfBoundsLng.valid, false, 'Longitude > 180 must fail');

    const nonNumeric = validateCoordinates('not_a_number', 75.0);
    assert.strictEqual(nonNumeric.valid, false, 'Non-numeric latitude must fail');
  }

  // 2. Quantity Validation
  {
    const validQty = validateQuantityLitres(2000);
    assert.strictEqual(validQty.valid, true, '2000L quantity should pass');
    assert.strictEqual(validQty.quantityLitres, 2000);

    const negativeQty = validateQuantityLitres(-500);
    assert.strictEqual(negativeQty.valid, false, 'Negative quantity must fail');

    const tooSmallQty = validateQuantityLitres(50);
    assert.strictEqual(tooSmallQty.valid, false, 'Quantity < 100L must fail');

    const tooLargeQty = validateQuantityLitres(50000);
    assert.strictEqual(tooLargeQty.valid, false, 'Quantity > 25000L must fail');

    const decimalQty = validateQuantityLitres(1500.5);
    assert.strictEqual(decimalQty.valid, false, 'Non-integer quantity must fail');
  }

  // 3. Timestamp Validation
  {
    const validTime = validateIsoTimestamp('2026-10-11T10:00:00.000Z');
    assert.strictEqual(validTime.valid, true, 'Valid ISO string must pass');

    const invalidTime = validateIsoTimestamp('invalid-date-string');
    assert.strictEqual(invalidTime.valid, false, 'Garbage date string must fail');

    const numericTime = validateIsoTimestamp(123456789);
    assert.strictEqual(numericTime.valid, false, 'Non-string timestamp must fail');
  }

  // 4. Enumeration Validation
  {
    const validWater = validateWaterType('NON_DRINKING');
    assert.strictEqual(validWater.valid, true, 'NON_DRINKING is valid');

    const invalidWater = validateWaterType('SEAWATER');
    assert.strictEqual(invalidWater.valid, false, 'Arbitrary water type must fail');

    const validLocSource = validateLocationSource('SIMULATED');
    assert.strictEqual(validLocSource.valid, true, 'SIMULATED source is valid');

    const invalidReportStatus = validateShortageReportStatus('UNKNOWN_STATUS');
    assert.strictEqual(invalidReportStatus.valid, false, 'Invalid shortage status must fail');
  }
}
