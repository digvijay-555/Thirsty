/**
 * WaterSaathi - Input Validation Utilities
 */

import {
  WaterType,
  TankerStatus,
  LocationSource,
  VerificationStatus,
  RequestStatus,
  BookingStatus,
  ShortageReportStatus,
} from '../../../shared/types.js';

export function isValidNumber(val) {
  return typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val);
}

export function validateCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!isValidNumber(lat) || !isValidNumber(lng)) {
    return { valid: false, error: 'Latitude and longitude must be valid numeric values.' };
  }

  if (lat < -90 || lat > 90) {
    return { valid: false, error: 'Latitude must be between -90 and 90 degrees.' };
  }

  if (lng < -180 || lng > 180) {
    return { valid: false, error: 'Longitude must be between -180 and 180 degrees.' };
  }

  return { valid: true, latitude: lat, longitude: lng };
}

export function validateQuantityLitres(quantity) {
  const qty = Number(quantity);
  if (!isValidNumber(qty) || !Number.isInteger(qty)) {
    return { valid: false, error: 'Quantity must be an integer number of litres.' };
  }

  if (qty < 100) {
    return { valid: false, error: 'Minimum request quantity is 100 litres.' };
  }

  if (qty > 25000) {
    return { valid: false, error: 'Requested quantity exceeds maximum single tanker delivery capacity (25,000 litres).' };
  }

  return { valid: true, quantityLitres: qty };
}

export function validateIsoTimestamp(timestampStr) {
  if (typeof timestampStr !== 'string') {
    return { valid: false, error: 'Timestamp must be an ISO-8601 string.' };
  }

  const date = new Date(timestampStr);
  if (Number.isNaN(date.getTime())) {
    return { valid: false, error: 'Invalid date/time format.' };
  }

  return { valid: true, date: date.toISOString() };
}

export function validateWaterType(waterType) {
  const type = waterType || WaterType.NON_DRINKING;
  if (!Object.values(WaterType).includes(type)) {
    return { valid: false, error: `Invalid water type '${type}'. Must be one of [${Object.values(WaterType).join(', ')}].` };
  }
  return { valid: true, waterType: type };
}

export function validateLocationSource(source) {
  const src = source || LocationSource.SIMULATED;
  if (!Object.values(LocationSource).includes(src)) {
    return { valid: false, error: `Invalid location source '${src}'. Must be one of [${Object.values(LocationSource).join(', ')}].` };
  }
  return { valid: true, locationSource: src };
}

export function validateShortageReportStatus(status) {
  if (!Object.values(ShortageReportStatus).includes(status)) {
    return { valid: false, error: `Invalid shortage report status '${status}'. Must be one of [${Object.values(ShortageReportStatus).join(', ')}].` };
  }
  return { valid: true, status };
}
