/**
 * WaterSaathi - Lifecycle State Machine & Transition Validator
 */

import { BookingStatus, RequestStatus } from '../../../shared/types.js';

// Strict state transition map for Bookings
export const ALLOWED_BOOKING_TRANSITIONS = Object.freeze({
  [BookingStatus.OPEN]: [BookingStatus.MATCHED, BookingStatus.ACCEPTED, BookingStatus.CANCELLED],
  [BookingStatus.MATCHED]: [BookingStatus.ACCEPTED, BookingStatus.CANCELLED, BookingStatus.OPEN],
  [BookingStatus.ACCEPTED]: [BookingStatus.EN_ROUTE, BookingStatus.CANCELLED],
  [BookingStatus.EN_ROUTE]: [BookingStatus.DELIVERED, BookingStatus.CANCELLED],
  [BookingStatus.DELIVERED]: [], // Terminal state
  [BookingStatus.CANCELLED]: [], // Terminal state
});

// Strict state transition map for Requests
export const ALLOWED_REQUEST_TRANSITIONS = Object.freeze({
  [RequestStatus.OPEN]: [RequestStatus.MATCHED, RequestStatus.ACCEPTED, RequestStatus.CANCELLED],
  [RequestStatus.MATCHED]: [RequestStatus.ACCEPTED, RequestStatus.OPEN, RequestStatus.CANCELLED],
  [RequestStatus.ACCEPTED]: [RequestStatus.EN_ROUTE, RequestStatus.CANCELLED],
  [RequestStatus.EN_ROUTE]: [RequestStatus.DELIVERED, RequestStatus.CANCELLED],
  [RequestStatus.DELIVERED]: [], // Terminal state
  [RequestStatus.CANCELLED]: [], // Terminal state
});

/**
 * Validates a booking status transition.
 * @param {string} currentStatus 
 * @param {string} targetStatus 
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateBookingTransition(currentStatus, targetStatus) {
  if (!currentStatus || !targetStatus) {
    return { valid: false, error: 'Current and target statuses must be specified.' };
  }

  if (currentStatus === targetStatus) {
    return { valid: true };
  }

  const allowed = ALLOWED_BOOKING_TRANSITIONS[currentStatus];
  if (!allowed) {
    return { valid: false, error: `Unknown current booking status '${currentStatus}'.` };
  }

  if (!allowed.includes(targetStatus)) {
    return {
      valid: false,
      error: `Invalid booking transition: cannot transition from '${currentStatus}' to '${targetStatus}'. Allowed transitions: [${allowed.join(', ')}].`,
    };
  }

  return { valid: true };
}

/**
 * Validates a request status transition.
 * @param {string} currentStatus 
 * @param {string} targetStatus 
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateRequestTransition(currentStatus, targetStatus) {
  if (!currentStatus || !targetStatus) {
    return { valid: false, error: 'Current and target statuses must be specified.' };
  }

  if (currentStatus === targetStatus) {
    return { valid: true };
  }

  const allowed = ALLOWED_REQUEST_TRANSITIONS[currentStatus];
  if (!allowed) {
    return { valid: false, error: `Unknown current request status '${currentStatus}'.` };
  }

  if (!allowed.includes(targetStatus)) {
    return {
      valid: false,
      error: `Invalid request transition: cannot transition from '${currentStatus}' to '${targetStatus}'. Allowed transitions: [${allowed.join(', ')}].`,
    };
  }

  return { valid: true };
}
