/**
 * WaterSaathi - Demand Pooling and Matching Engine
 * 
 * Simple, explainable candidate matching based on:
 * 1. Tanker availability and capacity
 * 2. Water category compatibility
 * 3. Geographical proximity (Haversine)
 * 4. Delivery window alignment
 * 5. Deterministic scoring
 */

import { calculateDistanceKm } from './distance.js';
import { calculatePooledQuote } from './pricing.js';
import { TankerStatus, RequestStatus, WaterType } from '../../../shared/types.js';

// Configuration thresholds
export const MATCHING_CONFIG = {
  MAX_PROXIMITY_KM: 7.5,              // Maximum distance between resident coordinates for pooling
  MAX_WINDOW_DIFF_MINUTES: 120,       // Maximum difference between delivery windows (2 hours)
  MAX_TANKER_DISTANCE_KM: 25.0,       // Maximum tanker distance to fulfill request
  LOCATION_FRESHNESS_HOURS: 4,        // Freshness threshold for location reports
};

/**
 * Ranks available tankers for a given water demand.
 * @param {Array<Object>} tankers 
 * @param {number} residentLat 
 * @param {number} residentLng 
 * @param {number} requiredLitres 
 * @param {string} requiredWaterType 
 * @returns {Array<Object>} ranked tankers with distance and score
 */
export function rankAvailableTankers(tankers, residentLat, residentLng, requiredLitres, requiredWaterType = WaterType.NON_DRINKING) {
  const eligibleTankers = tankers.filter(tanker => {
    // 1. Must be AVAILABLE
    if (tanker.status !== TankerStatus.AVAILABLE) return false;

    // 2. Must have sufficient remaining capacity
    if (tanker.availableLitres < requiredLitres) return false;

    // 3. Water type compatibility
    // If resident asks for DRINKING water, tanker must be DRINKING
    // If resident asks for NON_DRINKING, DRINKING is also acceptable if tanker agrees, but strictly match by default
    if (requiredWaterType && tanker.waterType !== requiredWaterType) return false;

    return true;
  });

  const scoredTankers = eligibleTankers.map(tanker => {
    const distanceKm = calculateDistanceKm(residentLat, residentLng, tanker.latitude, tanker.longitude);

    // Calculate location freshness penalty
    const updateTime = new Date(tanker.lastLocationUpdate || 0).getTime();
    const ageHours = (Date.now() - updateTime) / (1000 * 60 * 60);
    const freshnessScore = Math.max(0, 10 - ageHours); // Higher is fresher

    // Capacity fit: reward tankers whose capacity matches demand without excessive excess
    const capacityRatio = requiredLitres / tanker.capacityLitres; // closer to 1 is better utilization

    // Verification bonus
    const verificationBonus = tanker.verificationStatus === 'VERIFIED' ? 5 : 0;

    // Composite ranking score (lower distance is better, lower price is better)
    // Score = - (distanceKm * 2) - (pricePer1000Litres / 100) + freshnessScore + verificationBonus + (capacityRatio * 5)
    const score = -(distanceKm * 2) - (tanker.pricePer1000Litres / 100) + freshnessScore + verificationBonus + (capacityRatio * 5);

    return {
      ...tanker,
      distanceKm,
      rankingScore: Math.round(score * 100) / 100,
    };
  });

  // Sort descending by rankingScore (or ascending by distance as primary tie-breaker)
  return scoredTankers.sort((a, b) => b.rankingScore - a.rankingScore);
}

/**
 * Finds demand pooling candidates for an open water request.
 * @param {Object} primaryRequest - The request seeking pooling
 * @param {Array<Object>} otherRequests - All other requests in the system
 * @param {Array<Object>} availableTankers - All available tankers
 * @returns {{ eligible: boolean, candidateBookingId?: string, combinedQuantityLitres?: number, quotedPrice?: number, message: string, matchedRequests?: Array<Object> }}
 */
export function evaluateDemandPool(primaryRequest, otherRequests, availableTankers) {
  if (!primaryRequest) {
    return { eligible: false, message: 'Primary request is required.' };
  }

  // Find candidate requests that are:
  // - In OPEN status
  // - Not the primary request itself
  // - Same water type
  // - Within MAX_PROXIMITY_KM
  // - Within MAX_WINDOW_DIFF_MINUTES delivery window
  const primaryWindowTime = new Date(primaryRequest.deliveryWindowStart).getTime();

  const compatibleRequests = otherRequests.filter(req => {
    if (req.requestId === primaryRequest.requestId) return false;
    if (req.status !== RequestStatus.OPEN) return false;
    if (req.waterType !== primaryRequest.waterType) return false;

    // Proximity check
    const distKm = calculateDistanceKm(
      primaryRequest.latitude,
      primaryRequest.longitude,
      req.latitude,
      req.longitude
    );
    if (distKm > MATCHING_CONFIG.MAX_PROXIMITY_KM) return false;

    // Delivery window check
    const reqWindowTime = new Date(req.deliveryWindowStart).getTime();
    const diffMinutes = Math.abs(reqWindowTime - primaryWindowTime) / (1000 * 60);
    if (diffMinutes > MATCHING_CONFIG.MAX_WINDOW_DIFF_MINUTES) return false;

    return true;
  });

  if (compatibleRequests.length === 0) {
    return {
      eligible: false,
      message: 'No compatible nearby water requests currently open for pooling in your delivery window.',
    };
  }

  // Pick the closest compatible request
  const matchedRequest = compatibleRequests[0];
  const combinedQuantity = primaryRequest.quantityLitres + matchedRequest.quantityLitres;

  // Find a tanker with capacity for the combined order
  const candidateTankers = rankAvailableTankers(
    availableTankers,
    primaryRequest.latitude,
    primaryRequest.longitude,
    combinedQuantity,
    primaryRequest.waterType
  );

  if (candidateTankers.length === 0) {
    return {
      eligible: false,
      message: `Found nearby compatible demand (${combinedQuantity}L total), but no available tanker currently has capacity to serve both requests in a single trip.`,
    };
  }

  const selectedTanker = candidateTankers[0];
  const pooledQuote = calculatePooledQuote(
    primaryRequest.quantityLitres,
    combinedQuantity,
    selectedTanker.pricePer1000Litres
  );

  return {
    eligible: true,
    candidateTankerId: selectedTanker.tankerId,
    candidateTankerName: selectedTanker.displayName,
    combinedQuantityLitres: combinedQuantity,
    quotedPrice: pooledQuote.quotedPriceInr,
    savingsInr: pooledQuote.savingsInr,
    matchedRequestsCount: 2,
    matchedRequestIds: [primaryRequest.requestId, matchedRequest.requestId],
    message: `Compatible shared delivery found with nearby household in your locality. Combined ${combinedQuantity}L order with ${selectedTanker.displayName}.`,
  };
}
