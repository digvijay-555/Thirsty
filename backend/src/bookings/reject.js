/**
 * Lambda Handler: POST /bookings/{id}/reject
 * Operator declines or cancels a pending booking. Associated requests return to OPEN.
 */

import { db } from '../shared/db.js';
import { buildSuccess, buildError, handleOptions } from '../shared/response.js';
import { BookingStatus, RequestStatus } from '../../../shared/types.js';

const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE || 'WaterSaathi-Bookings';
const REQUESTS_TABLE = process.env.REQUESTS_TABLE || 'WaterSaathi-Requests';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return handleOptions();
  }

  try {
    const bookingId = event.pathParameters?.id;
    if (!bookingId) {
      return buildError(400, 'VALIDATION_ERROR', 'Missing bookingId in path.');
    }

    const booking = await db.get(BOOKINGS_TABLE, { bookingId });
    if (!booking) {
      return buildError(404, 'NOT_FOUND', `Booking '${bookingId}' was not found.`);
    }

    if (booking.status === BookingStatus.DELIVERED) {
      return buildError(400, 'INVALID_STATE', 'Cannot reject an already fulfilled delivery.');
    }

    const nowIso = new Date().toISOString();

    // Mark booking as CANCELLED
    const updatedBooking = await db.update(
      BOOKINGS_TABLE,
      { bookingId },
      'SET #status = :newStatus, #upd = :updatedAt',
      {
        '#status': 'status',
        '#upd': 'updatedAt',
      },
      {
        ':newStatus': BookingStatus.CANCELLED,
        ':updatedAt': nowIso,
      }
    );

    // Release requests back to OPEN so residents can book again
    if (booking.requestIds && Array.isArray(booking.requestIds)) {
      for (const reqId of booking.requestIds) {
        await db.update(
          REQUESTS_TABLE,
          { requestId: reqId },
          'SET #status = :status, #bookingId = :nullVal, #upd = :updatedAt',
          {
            '#status': 'status',
            '#bookingId': 'bookingId',
            '#upd': 'updatedAt',
          },
          {
            ':status': RequestStatus.OPEN,
            ':nullVal': null,
            ':updatedAt': nowIso,
          }
        );
      }
    }

    return buildSuccess({
      success: true,
      bookingId,
      status: BookingStatus.CANCELLED,
      message: 'Booking declined. Associated requests released back to open status.',
    });
  } catch (err) {
    console.error('Error in BookingRejectFunction:', err);
    return buildError(500, 'INTERNAL_SERVER_ERROR', 'Failed to reject booking.');
  }
}
