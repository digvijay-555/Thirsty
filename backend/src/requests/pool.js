/**
 * Lambda Handler: POST /requests/{id}/join-pool
 * Evaluates demand pooling eligibility and matches compatible neighborhood water orders.
 */

import { db } from '../shared/db.js';
import { buildSuccess, buildError, handleOptions } from '../shared/response.js';
import { evaluateDemandPool } from '../shared/matching.js';
import { BookingStatus, RequestStatus } from '../../../shared/types.js';

const REQUESTS_TABLE = process.env.REQUESTS_TABLE || 'WaterSaathi-Requests';
const TANKERS_TABLE = process.env.TANKERS_TABLE || 'WaterSaathi-Tankers';
const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE || 'WaterSaathi-Bookings';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return handleOptions();
  }

  try {
    const requestId = event.pathParameters?.id;
    if (!requestId) {
      return buildError(400, 'VALIDATION_ERROR', 'Missing required requestId in path.');
    }

    const primaryRequest = await db.get(REQUESTS_TABLE, { requestId });
    if (!primaryRequest) {
      return buildError(404, 'NOT_FOUND', `Water request '${requestId}' was not found.`);
    }

    // Must be in OPEN or MATCHED status to seek/join pool
    if (primaryRequest.status !== RequestStatus.OPEN && primaryRequest.status !== RequestStatus.MATCHED) {
      return buildError(
        400,
        'INVALID_STATE',
        `Request '${requestId}' cannot join a pool because its current status is '${primaryRequest.status}'.`
      );
    }

    // Fetch all requests and available tankers
    const allRequests = await db.scan(REQUESTS_TABLE);
    const allTankers = await db.scan(TANKERS_TABLE);

    const poolResult = evaluateDemandPool(primaryRequest, allRequests, allTankers);

    if (!poolResult.eligible) {
      return buildSuccess({
        eligible: false,
        candidateBookingId: null,
        combinedQuantityLitres: null,
        quotedPrice: null,
        message: poolResult.message,
      });
    }

    // When eligible, create or update a candidate booking in MATCHED status
    const bookingId = `book-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const nowIso = new Date().toISOString();

    const candidateBooking = {
      bookingId,
      tankerId: poolResult.candidateTankerId,
      requestIds: poolResult.matchedRequestIds,
      quotedPrice: poolResult.quotedPrice,
      finalPrice: poolResult.quotedPrice,
      totalQuantityLitres: poolResult.combinedQuantityLitres,
      deliveryWindowStart: primaryRequest.deliveryWindowStart,
      status: BookingStatus.MATCHED,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await db.put(BOOKINGS_TABLE, candidateBooking);

    // Update status and bookingId for matched requests without losing individual quantities
    for (const reqId of poolResult.matchedRequestIds) {
      await db.update(
        REQUESTS_TABLE,
        { requestId: reqId },
        'SET #status = :status, #bookingId = :bookingId, #upd = :updatedAt',
        {
          '#status': 'status',
          '#bookingId': 'bookingId',
          '#upd': 'updatedAt',
        },
        {
          ':status': RequestStatus.MATCHED,
          ':bookingId': bookingId,
          ':updatedAt': nowIso,
        }
      );
    }

    return buildSuccess({
      eligible: true,
      candidateBookingId: bookingId,
      tankerId: poolResult.candidateTankerId,
      tankerName: poolResult.candidateTankerName,
      combinedQuantityLitres: poolResult.combinedQuantityLitres,
      quotedPrice: poolResult.quotedPrice,
      savingsInr: poolResult.savingsInr,
      matchedRequestsCount: poolResult.matchedRequestsCount,
      message: poolResult.message,
    });
  } catch (err) {
    console.error('Error in RequestJoinPoolFunction:', err);
    return buildError(500, 'INTERNAL_SERVER_ERROR', 'Failed to evaluate demand pool.');
  }
}
