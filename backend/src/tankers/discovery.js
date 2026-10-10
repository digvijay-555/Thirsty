/**
 * Lambda Handler: GET /tankers?lat={latitude}&lng={longitude}
 * Discovers and ranks available water tankers near a resident's location.
 */

import { db } from '../shared/db.js';
import { buildSuccess, buildError, handleOptions } from '../shared/response.js';
import { validateCoordinates } from '../shared/validation.js';
import { rankAvailableTankers } from '../shared/matching.js';
import { TankerStatus } from '../../../shared/types.js';

const TANKERS_TABLE = process.env.TANKERS_TABLE || 'WaterSaathi-Tankers';

export async function handler(event) {
  // CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleOptions();
  }

  try {
    const query = event.queryStringParameters || {};
    const { lat, lng, waterType } = query;

    // Validate coordinates - do not silently use arbitrary location
    if (lat === undefined || lng === undefined) {
      return buildError(
        400,
        'VALIDATION_ERROR',
        'Missing required query parameters: "lat" and "lng" are required for tanker discovery.'
      );
    }

    const coordValidation = validateCoordinates(lat, lng);
    if (!coordValidation.valid) {
      return buildError(400, 'VALIDATION_ERROR', coordValidation.error);
    }

    // Fetch tankers from database
    const allTankers = await db.scan(TANKERS_TABLE);

    // Filter out OFFLINE tankers by default
    const onlineTankers = allTankers.filter(t => t.status !== TankerStatus.OFFLINE);

    // Rank available tankers by distance, rating, price, and location freshness
    const rankedTankers = rankAvailableTankers(
      onlineTankers,
      coordValidation.latitude,
      coordValidation.longitude,
      0, // discovery view without specific quantity
      waterType
    );

    return buildSuccess({
      tankers: rankedTankers,
      count: rankedTankers.length,
      searchedLocation: {
        latitude: coordValidation.latitude,
        longitude: coordValidation.longitude,
      },
    });
  } catch (err) {
    console.error('Error in TankerDiscoveryFunction:', err);
    return buildError(500, 'INTERNAL_SERVER_ERROR', 'Failed to retrieve nearby tankers.');
  }
}
