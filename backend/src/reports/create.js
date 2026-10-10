/**
 * Lambda Handler: POST /shortage-reports
 * Creates a community water shortage report.
 */

import { db } from '../shared/db.js';
import { buildSuccess, buildError, handleOptions } from '../shared/response.js';
import { validateCoordinates } from '../shared/validation.js';
import { ShortageReportStatus } from '../../../shared/types.js';

const REPORTS_TABLE = process.env.REPORTS_TABLE || 'WaterSaathi-ShortageReports';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return handleOptions();
  }

  try {
    let payload;
    try {
      payload = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    } catch {
      return buildError(400, 'MALFORMED_JSON', 'Request body contains invalid JSON.');
    }

    const { reporterId, locality, latitude, longitude, description } = payload;

    if (!reporterId || typeof reporterId !== 'string' || reporterId.trim().length === 0) {
      return buildError(400, 'VALIDATION_ERROR', 'A valid non-empty "reporterId" is required.');
    }

    if (!locality || typeof locality !== 'string' || locality.trim().length === 0) {
      return buildError(400, 'VALIDATION_ERROR', 'A valid non-empty "locality" is required.');
    }

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return buildError(400, 'VALIDATION_ERROR', 'A valid description of the shortage is required.');
    }

    const coordVal = validateCoordinates(latitude, longitude);
    if (!coordVal.valid) {
      return buildError(400, 'VALIDATION_ERROR', coordVal.error);
    }

    const nowIso = new Date().toISOString();
    const reportId = `rep-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const newReport = {
      reportId,
      reporterId: reporterId.trim(),
      locality: locality.trim(),
      latitude: coordVal.latitude,
      longitude: coordVal.longitude,
      description: description.trim(),
      reportedAt: nowIso,
      verificationStatus: ShortageReportStatus.UNVERIFIED, // Community reports are unverified by default
    };

    await db.put(REPORTS_TABLE, newReport);

    return buildSuccess(newReport, 201);
  } catch (err) {
    console.error('Error in ShortageReportCreateFunction:', err);
    return buildError(500, 'INTERNAL_SERVER_ERROR', 'Failed to submit shortage report.');
  }
}
