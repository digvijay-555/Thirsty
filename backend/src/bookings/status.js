/**
 * Lambda Handler: POST /bookings/{id}/status
 * Updates booking lifecycle status with strict transition validation.
 */

import { db } from '../shared/db.js';
import { buildSuccess, buildError, handleOptions } from '../shared/response.js';
import { validateBookingTransition } from '../shared/statusTransitions.js';
import { BookingStatus, RequestStatus, TankerStatus } from '../../../shared/types.js';

const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE || 'WaterSaathi-Bookings';
const REQUESTS_TABLE = process.env.REQUESTS_TABLE || 'WaterSaathi-Requests';
const TANKERS_TABLE = process.env.TANKERS_TABLE || 'WaterSaathi-Tankers';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return handleOptions();
  }

  try {
    const bookingId = event.pathParameters?.id;
    if (!bookingId) {
      return buildError(400, 'VALIDATION_ERROR', 'Missing bookingId in path.');
    }

    let payload;
    try {
      payload = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    } catch {
      return buildError(400, 'MALFORMED_JSON', 'Request body contains invalid JSON.');
    }

    const { status: targetStatus } = payload;
    if (!targetStatus) {
      return buildError(400, 'VALIDATION_ERROR', 'Missing "status" field in request body.');
    }

    // 1. Fetch current booking
    const booking = await db.get(BOOKINGS_TABLE, { bookingId });
    if (!booking) {
      return buildError(404, 'NOT_FOUND', `Booking '${bookingId}' was not found.`);
    }

    // 2. Validate transition
    const transitionCheck = validateBookingTransition(booking.status, targetStatus);
    if (!transitionCheck.valid) {
      return buildError(400, 'INVALID_STATUS_TRANSITION', transitionCheck.error);
    }

    const nowIso = new Date().toISOString();

    // 3. Update booking status
    const updatedBooking = await db.update(
      BOOKINGS_TABLE,
      { bookingId },
      'SET #status = :newStatus, #upd = :updatedAt',
      {
        '#status': 'status',
        '#upd': 'updatedAt',
      },
      {
        ':newStatus': targetStatus,
        ':updatedAt': nowIso,
      }
    );

    // 4. Cascade status to associated requests
    if (booking.requestIds && Array.isArray(booking.requestIds)) {
      const correspondingReqStatus =
        targetStatus === BookingStatus.EN_ROUTE
          ? RequestStatus.EN_ROUTE
          : targetStatus === BookingStatus.DELIVERED
          ? RequestStatus.DELIVERED
          : targetStatus === BookingStatus.CANCELLED
          ? RequestStatus.CANCELLED
          : RequestStatus.ACCEPTED;

      for (const reqId of booking.requestIds) {
        await db.update(
          REQUESTS_TABLE,
          { requestId: reqId },
          'SET #status = :status, #upd = :updatedAt',
          {
            '#status': 'status',
            '#upd': 'updatedAt',
          },
          {
            ':status': correspondingReqStatus,
            ':updatedAt': nowIso,
          }
        );
      }
    }

    // 5. Update tanker state based on booking progress
    if (booking.tankerId) {
      if (targetStatus === BookingStatus.EN_ROUTE) {
        await db.update(
          TANKERS_TABLE,
          { tankerId: booking.tankerId },
          'SET #status = :status, #upd = :updatedAt',
          {
            '#status': 'status',
            '#upd': 'lastLocationUpdate',
          },
          {
            ':status': TankerStatus.EN_ROUTE,
            ':updatedAt': nowIso,
          }
        );
      } else if (targetStatus === BookingStatus.DELIVERED) {
        // Trip completed: tanker transitions back to AVAILABLE
        await db.update(
          TANKERS_TABLE,
          { tankerId: booking.tankerId },
          'SET #status = :status, #upd = :updatedAt',
          {
            '#status': 'status',
            '#upd': 'lastLocationUpdate',
          },
          {
            ':status': TankerStatus.AVAILABLE,
            ':updatedAt': nowIso,
          }
        );
      }
    }

    return buildSuccess({
      success: true,
      booking: updatedBooking,
      message: `Booking ${bookingId} transitioned from ${booking.status} to ${targetStatus}.`,
    });
  } catch (err) {
    console.error('Error in BookingStatusFunction:', err);
    return buildError(500, 'INTERNAL_SERVER_ERROR', 'Failed to update booking status.');
  }
}
