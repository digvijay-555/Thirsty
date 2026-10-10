/**
 * Lambda Handler: GET /admin/shortage-reports
 * Retrieves community water shortage reports for administrative review.
 */

import { db } from '../shared/db.js';
import { buildSuccess, buildError, handleOptions } from '../shared/response.js';

const REPORTS_TABLE = process.env.REPORTS_TABLE || 'WaterSaathi-ShortageReports';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return handleOptions();
  }

  try {
    const reports = await db.scan(REPORTS_TABLE);

    // Sort descending by reportedAt (most recent first)
    reports.sort((a, b) => new Date(b.reportedAt || 0) - new Date(a.reportedAt || 0));

    return buildSuccess({
      reports,
      count: reports.length,
      notice: 'Demonstration endpoint. Resident reports are not municipal announcements.',
    });
  } catch (err) {
    console.error('Error in ShortageReportListFunction:', err);
    return buildError(500, 'INTERNAL_SERVER_ERROR', 'Failed to retrieve shortage reports.');
  }
}
