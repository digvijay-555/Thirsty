/**
 * Lambda Handler: POST /bookings/{id}/accept
 * Operator accepts a pending/matched booking with conditional capacity checks.
 */

import { db } from '../shared/db.js';
import { buildSuccess, buildError, handleOptions } from '../shared/response.js';
import { BookingStatus, RequestStatus, TankerStatus } from '../../../shared/types.js';

const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE || 'WaterSaathi-Bookings';
const TANKERS_TABLE = process.env.TANKERS_TABLE || 'WaterSaathi-Tankers';
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

    // 1. Fetch booking
    const booking = await db.get(BOOKINGS_TABLE, { bookingId });
    if (!booking) {
      return buildError(404, 'NOT_FOUND', `Booking '${bookingId}' was not found.`);
    }

    // Check if booking is in eligible state
    if (booking.status !== BookingStatus.OPEN && booking.status !== BookingStatus.MATCHED) {
      return buildError(
        409,
        'INELIGIBLE_STATE',
        `Booking '${bookingId}' cannot be accepted because it is currently in '${booking.status}' status.`
      );
    }

    // 2. Fetch tanker
    const tanker = await db.get(TANKERS_TABLE, { tankerId: booking.tankerId });
    if (!tanker) {
      return buildError(404, 'NOT_FOUND', `Assigned tanker '${booking.tankerId}' was not found.`);
    }

    // Check available capacity
    const requiredLitres = booking.totalQuantityLitres || 0;
    if (tanker.availableLitres < requiredLitres) {
      return buildError(
        409,
        'CAPACITY_UNAVAILABLE',
        `Tanker '${tanker.displayName}' only has ${tanker.availableLitres}L available, but booking requires ${requiredLitres}L.`
      );
    }

    const newAvailableLitres = Math.max(0, tanker.availableLitres - requiredLitres);
    const newTankerStatus = newAvailableLitres === 0 ? TankerStatus.BUSY : tanker.status;
    const nowIso = new Date().toISOString();

    // 3. Conditional update on Tanker to prevent concurrent double-booking of same litres
    try {
      await db.update(
        TANKERS_TABLE,
        { tankerId: tanker.tankerId },
        'SET #avail = :newAvail, #status = :newStatus, #upd = :updatedAt',
        {
          '#avail': 'availableLitres',
          '#status': 'status',
          '#upd': 'lastLocationUpdate',
        },
        {
          ':newAvail': newAvailableLitres,
          ':newStatus': newTankerStatus,
          ':requiredLitres': requiredLitres,
          ':available': TankerStatus.AVAILABLE,
          ':busy': TankerStatus.BUSY,
          ':updatedAt': nowIso,
        },
        'attribute_exists(tankerId) AND availableLitres >= :requiredLitres AND #status IN (:available, :busy)'
      );
    } catch (condErr) {
      if (condErr.name === 'ConditionalCheckFailedException') {
        return buildError(
          409,
          'CONCURRENT_CAPACITY_CONFLICT',
          'The tanker capacity was reserved by another order during processing. Please refresh available tankers.'
        );
      }
      throw condErr;
    }

    // 4. Update booking status to ACCEPTED
    const updatedBooking = await db.update(
      BOOKINGS_TABLE,
      { bookingId },
      'SET #status = :newStatus, #upd = :updatedAt',
      {
        '#status': 'status',
        '#upd': 'updatedAt',
      },
      {
        ':newStatus': BookingStatus.ACCEPTED,
        ':updatedAt': nowIso,
      }
    );

    // 5. Update associated requests to ACCEPTED
    if (booking.requestIds && Array.isArray(booking.requestIds)) {
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
            ':status': RequestStatus.ACCEPTED,
            ':updatedAt': nowIso,
          }
        );
      }
    }

    return buildSuccess({
      success: true,
      booking: updatedBooking,
      tanker: {
        tankerId: tanker.tankerId,
        availableLitres: newAvailableLitres,
        status: newTankerStatus,
      },
      message: `Booking ${bookingId} successfully accepted. Tanker ${tanker.displayName} capacity updated.`,
    });
  } catch (err) {
    console.error('Error in BookingAcceptFunction:', err);
    return buildError(500, 'INTERNAL_SERVER_ERROR', 'Failed to accept booking.');
  }
}
