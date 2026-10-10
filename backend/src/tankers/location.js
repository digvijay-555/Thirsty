/**
 * Lambda Handler: POST /tankers/{id}/location
 * Updates real-time or simulated GPS coordinates for a tanker.
 */

import { db } from '../shared/db.js';
import { buildSuccess, buildError, handleOptions } from '../shared/response.js';
import { validateCoordinates, validateLocationSource } from '../shared/validation.js';

const TANKERS_TABLE = process.env.TANKERS_TABLE || 'WaterSaathi-Tankers';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return handleOptions();
  }

  try {
    const tankerId = event.pathParameters?.id;
    if (!tankerId) {
      return buildError(400, 'VALIDATION_ERROR', 'Missing required tanker ID in path.');
    }

    let payload;
    try {
      payload = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    } catch {
      return buildError(400, 'MALFORMED_JSON', 'Request body contains invalid JSON.');
    }

    const { latitude, longitude, locationSource } = payload;

    const coordVal = validateCoordinates(latitude, longitude);
    if (!coordVal.valid) {
      return buildError(400, 'VALIDATION_ERROR', coordVal.error);
    }

    const srcVal = validateLocationSource(locationSource);
    if (!srcVal.valid) {
      return buildError(400, 'VALIDATION_ERROR', srcVal.error);
    }

    // Verify tanker exists
    const existing = await db.get(TANKERS_TABLE, { tankerId });
    if (!existing) {
      return buildError(404, 'NOT_FOUND', `Tanker '${tankerId}' was not found.`);
    }

    const nowIso = new Date().toISOString();

    const updated = await db.update(
      TANKERS_TABLE,
      { tankerId },
      'SET #lat = :latitude, #lng = :longitude, #src = :locationSource, #upd = :lastLocationUpdate',
      {
        '#lat': 'latitude',
        '#lng': 'longitude',
        '#src': 'locationSource',
        '#upd': 'lastLocationUpdate',
      },
      {
        ':latitude': coordVal.latitude,
        ':longitude': coordVal.longitude,
        ':locationSource': srcVal.locationSource,
        ':lastLocationUpdate': nowIso,
      }
    );

    return buildSuccess({
      success: true,
      tankerId,
      latitude: coordVal.latitude,
      longitude: coordVal.longitude,
      locationSource: srcVal.locationSource,
      lastLocationUpdate: nowIso,
    });
  } catch (err) {
    console.error('Error in TankerLocationFunction:', err);
    return buildError(500, 'INTERNAL_SERVER_ERROR', 'Failed to update tanker location.');
  }
}
