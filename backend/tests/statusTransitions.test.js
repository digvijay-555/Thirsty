/**
 * Unit Tests: Lifecycle State Machine Transitions
 */

import {
  validateBookingTransition,
  validateRequestTransition,
} from '../src/shared/statusTransitions.js';
import { BookingStatus, RequestStatus } from '../../shared/types.js';

export function runStatusTransitionTests(assert) {
  // 1. Allowed Booking Transitions
  {
    assert.strictEqual(
      validateBookingTransition(BookingStatus.OPEN, BookingStatus.ACCEPTED).valid,
      true,
      'OPEN -> ACCEPTED is valid'
    );
    assert.strictEqual(
      validateBookingTransition(BookingStatus.OPEN, BookingStatus.MATCHED).valid,
      true,
      'OPEN -> MATCHED is valid'
    );
    assert.strictEqual(
      validateBookingTransition(BookingStatus.MATCHED, BookingStatus.ACCEPTED).valid,
      true,
      'MATCHED -> ACCEPTED is valid'
    );
    assert.strictEqual(
      validateBookingTransition(BookingStatus.ACCEPTED, BookingStatus.EN_ROUTE).valid,
      true,
      'ACCEPTED -> EN_ROUTE is valid'
    );
    assert.strictEqual(
      validateBookingTransition(BookingStatus.EN_ROUTE, BookingStatus.DELIVERED).valid,
      true,
      'EN_ROUTE -> DELIVERED is valid'
    );
  }

  // 2. Disallowed / Illegal Booking Transitions
  {
    // Cannot jump straight to DELIVERED from OPEN
    const invalidJump = validateBookingTransition(BookingStatus.OPEN, BookingStatus.DELIVERED);
    assert.strictEqual(invalidJump.valid, false, 'OPEN -> DELIVERED directly must fail');
    assert.ok(invalidJump.error.includes('Invalid booking transition'));

    // Terminal states cannot transition out
    const deliveredOut = validateBookingTransition(BookingStatus.DELIVERED, BookingStatus.ACCEPTED);
    assert.strictEqual(deliveredOut.valid, false, 'DELIVERED cannot transition out');

    const cancelledOut = validateBookingTransition(BookingStatus.CANCELLED, BookingStatus.ACCEPTED);
    assert.strictEqual(cancelledOut.valid, false, 'CANCELLED cannot transition out');

    // Unknown status
    const unknownStatus = validateBookingTransition('UNKNOWN_STATE', BookingStatus.ACCEPTED);
    assert.strictEqual(unknownStatus.valid, false, 'Unknown status must fail');
  }

  // 3. Request Transitions
  {
    assert.strictEqual(
      validateRequestTransition(RequestStatus.OPEN, RequestStatus.MATCHED).valid,
      true,
      'Request OPEN -> MATCHED is valid'
    );
    assert.strictEqual(
      validateRequestTransition(RequestStatus.ACCEPTED, RequestStatus.DELIVERED).valid,
      false,
      'Request ACCEPTED -> DELIVERED directly without EN_ROUTE must fail'
    );
  }
}
