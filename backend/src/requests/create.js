/**
 * Lambda Handler: POST /requests
 * Creates a new water delivery request.
 */

import { db } from '../shared/db.js';
import { buildSuccess, buildError, handleOptions } from '../shared/response.js';
import {
  validateCoordinates,
  validateQuantityLitres,
  validateIsoTimestamp,
  validateWaterType,
} from '../shared/validation.js';
import { calculateQuote, PRICE_BOUNDS } from '../shared/pricing.js';
import { RequestStatus } from '../../../shared/types.js';

const REQUESTS_TABLE = process.env.REQUESTS_TABLE || 'WaterSaathi-Requests';
const TANKERS_TABLE = process.env.TANKERS_TABLE || 'WaterSaathi-Tankers';

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

    const {
      requesterId,
      quantityLitres,
      latitude,
      longitude,
      deliveryWindowStart,
      waterType,
      tankerId, // optional preferred tanker
    } = payload;

    // Validate requesterId
    if (!requesterId || typeof requesterId !== 'string' || requesterId.trim().length === 0) {
      return buildError(400, 'VALIDATION_ERROR', 'A valid non-empty "requesterId" is required.');
    }

    // Validate quantity
    const qtyVal = validateQuantityLitres(quantityLitres);
    if (!qtyVal.valid) {
      return buildError(400, 'VALIDATION_ERROR', qtyVal.error);
    }

    // Validate coordinates
    const coordVal = validateCoordinates(latitude, longitude);
    if (!coordVal.valid) {
      return buildError(400, 'VALIDATION_ERROR', coordVal.error);
    }

    // Validate delivery window
    const timeVal = validateIsoTimestamp(deliveryWindowStart);
    if (!timeVal.valid) {
      return buildError(400, 'VALIDATION_ERROR', `Invalid "deliveryWindowStart": ${timeVal.error}`);
    }

    // Validate water type
    const waterVal = validateWaterType(waterType);
    if (!waterVal.valid) {
      return buildError(400, 'VALIDATION_ERROR', waterVal.error);
    }

    // Check idempotency header or duplicate active request protection
    const idempotencyKey = event.headers?.['x-idempotency-key'] || event.headers?.['X-Idempotency-Key'];
    if (idempotencyKey) {
      const existingReq = await db.get(REQUESTS_TABLE, { requestId: idempotencyKey });
      if (existingReq) {
        return buildSuccess(existingReq, 200);
      }
    }

    // Determine pricing rate (from preferred tanker or locality benchmark)
    let ratePer1000L = PRICE_BOUNDS.DEFAULT_RATE_PER_1000L;
    if (tankerId) {
      const preferred = await db.get(TANKERS_TABLE, { tankerId });
      if (preferred && preferred.pricePer1000Litres) {
        ratePer1000L = preferred.pricePer1000Litres;
      }
    }

    const quote = calculateQuote(qtyVal.quantityLitres, ratePer1000L);

    const now = new Date().toISOString();
    const requestId = idempotencyKey || `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const newRequest = {
      requestId,
      requesterId: requesterId.trim(),
      quantityLitres: qtyVal.quantityLitres,
      latitude: coordVal.latitude,
      longitude: coordVal.longitude,
      deliveryWindowStart: timeVal.date,
      waterType: waterVal.waterType,
      status: RequestStatus.OPEN,
      quotedPrice: quote.quotedPriceInr,
      quotedPricePaise: quote.quotedPricePaise,
      ratePer1000Litres: quote.ratePer1000Litres,
      bookingId: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.put(REQUESTS_TABLE, newRequest);

    return buildSuccess(newRequest, 201);
  } catch (err) {
    console.error('Error in RequestCreateFunction:', err);
    return buildError(500, 'INTERNAL_SERVER_ERROR', 'Failed to create water request.');
  }
}
