/**
 * Lambda Handler: POST /admin/shortage-reports/{id}/status
 * Updates review status of a community shortage report.
 */

import { db } from '../shared/db.js';
import { buildSuccess, buildError, handleOptions } from '../shared/response.js';
import { validateShortageReportStatus } from '../shared/validation.js';

const REPORTS_TABLE = process.env.REPORTS_TABLE || 'WaterSaathi-ShortageReports';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return handleOptions();
  }

  try {
    const reportId = event.pathParameters?.id;
    if (!reportId) {
      return buildError(400, 'VALIDATION_ERROR', 'Missing reportId in path.');
    }

    let payload;
    try {
      payload = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    } catch {
      return buildError(400, 'MALFORMED_JSON', 'Request body contains invalid JSON.');
    }

    const { verificationStatus } = payload;
    const statusVal = validateShortageReportStatus(verificationStatus);
    if (!statusVal.valid) {
      return buildError(400, 'VALIDATION_ERROR', statusVal.error);
    }

    const existing = await db.get(REPORTS_TABLE, { reportId });
    if (!existing) {
      return buildError(404, 'NOT_FOUND', `Shortage report '${reportId}' was not found.`);
    }

    const nowIso = new Date().toISOString();

    const updated = await db.update(
      REPORTS_TABLE,
      { reportId },
      'SET #status = :newStatus, #reviewedAt = :reviewedAt',
      {
        '#status': 'verificationStatus',
        '#reviewedAt': 'reviewedAt',
      },
      {
        ':newStatus': statusVal.status,
        ':reviewedAt': nowIso,
      }
    );

    return buildSuccess({
      success: true,
      reportId,
      verificationStatus: statusVal.status,
      reviewedAt: nowIso,
    });
  } catch (err) {
    console.error('Error in ShortageReportStatusFunction:', err);
    return buildError(500, 'INTERNAL_SERVER_ERROR', 'Failed to update shortage report status.');
  }
}
