/**
 * WaterSaathi Backend - Standardized HTTP Response Utility
 */

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.CORS_ALLOW_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token, X-Idempotency-Key',
};

export function buildResponse(statusCode, body = {}, customHeaders = {}) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      ...customHeaders,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

export function buildSuccess(data, statusCode = 200) {
  return buildResponse(statusCode, data);
}

export function buildError(statusCode, code, message, details = null) {
  return buildResponse(statusCode, {
    error: {
      code,
      message,
      details,
    },
  });
}

export function handleOptions() {
  return {
    statusCode: 204,
    headers: CORS_HEADERS,
    body: '',
  };
}
