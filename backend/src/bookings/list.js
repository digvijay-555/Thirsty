/**
 * Lambda Handler: GET /bookings
 * Lists bookings with optional filters (tankerId, status, requesterId).
 */

import { db } from '../shared/db.js';
import { buildSuccess, buildError, handleOptions } from '../shared/response.js';

const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE || 'WaterSaathi-Bookings';
const REQUESTS_TABLE = process.env.REQUESTS_TABLE || 'WaterSaathi-Requests';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return handleOptions();
  }

  try {
    const query = event.queryStringParameters || {};
    const { tankerId, status, requesterId } = query;

    let bookings = await db.scan(BOOKINGS_TABLE);

    if (tankerId) {
      bookings = bookings.filter(b => b.tankerId === tankerId);
    }

    if (status) {
      bookings = bookings.filter(b => b.status === status);
    }

    // Filter by requesterId if requested
    if (requesterId) {
      // Find requestIds belonging to requesterId
      const requests = await db.scan(REQUESTS_TABLE);
      const requesterReqIds = new Set(
        requests.filter(r => r.requesterId === requesterId).map(r => r.requestId)
      );
      bookings = bookings.filter(b =>
        b.requestIds?.some(id => requesterReqIds.has(id))
      );
    }

    // Sort by createdAt descending
    bookings.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return buildSuccess({
      bookings,
      count: bookings.length,
    });
  } catch (err) {
    console.error('Error in BookingListFunction:', err);
    return buildError(500, 'INTERNAL_SERVER_ERROR', 'Failed to retrieve bookings.');
  }
}
