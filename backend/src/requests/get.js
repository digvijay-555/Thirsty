/**
 * Lambda Handler: GET /requests/{id}
 * Retrieves water request details and associated booking info.
 */

import { db } from '../shared/db.js';
import { buildSuccess, buildError, handleOptions } from '../shared/response.js';

const REQUESTS_TABLE = process.env.REQUESTS_TABLE || 'WaterSaathi-Requests';
const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE || 'WaterSaathi-Bookings';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return handleOptions();
  }

  try {
    const requestId = event.pathParameters?.id;
    if (!requestId) {
      return buildError(400, 'VALIDATION_ERROR', 'Missing required requestId parameter in path.');
    }

    const request = await db.get(REQUESTS_TABLE, { requestId });
    if (!request) {
      return buildError(404, 'NOT_FOUND', `Water request '${requestId}' was not found.`);
    }

    let booking = null;
    if (request.bookingId) {
      booking = await db.get(BOOKINGS_TABLE, { bookingId: request.bookingId });
    }

    return buildSuccess({
      request,
      booking,
    });
  } catch (err) {
    console.error('Error in RequestGetFunction:', err);
    return buildError(500, 'INTERNAL_SERVER_ERROR', 'Failed to retrieve water request.');
  }
}
