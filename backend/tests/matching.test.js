/**
 * Unit Tests: Tanker Ranking and Demand Pooling Matching Engine
 */

import { rankAvailableTankers, evaluateDemandPool } from '../src/shared/matching.js';
import { TankerStatus, RequestStatus, WaterType } from '../../shared/types.js';

export function runMatchingTests(assert) {
  const residentLat = 19.8762;
  const residentLng = 75.3433;

  const sampleTankers = [
    {
      tankerId: 't-close',
      displayName: 'Close Tanker',
      capacityLitres: 5000,
      availableLitres: 5000,
      pricePer1000Litres: 500,
      waterType: WaterType.NON_DRINKING,
      status: TankerStatus.AVAILABLE,
      latitude: 19.8770, // ~100m away
      longitude: 75.3440,
      lastLocationUpdate: new Date().toISOString(),
      verificationStatus: 'VERIFIED',
    },
    {
      tankerId: 't-far',
      displayName: 'Far Tanker',
      capacityLitres: 5000,
      availableLitres: 5000,
      pricePer1000Litres: 500,
      waterType: WaterType.NON_DRINKING,
      status: TankerStatus.AVAILABLE,
      latitude: 19.9500, // ~10km away
      longitude: 75.3900,
      lastLocationUpdate: new Date().toISOString(),
      verificationStatus: 'UNVERIFIED',
    },
    {
      tankerId: 't-offline',
      displayName: 'Offline Tanker',
      capacityLitres: 5000,
      availableLitres: 5000,
      pricePer1000Litres: 400,
      waterType: WaterType.NON_DRINKING,
      status: TankerStatus.OFFLINE,
      latitude: 19.8765,
      longitude: 75.3435,
      lastLocationUpdate: new Date().toISOString(),
      verificationStatus: 'VERIFIED',
    },
    {
      tankerId: 't-drinking',
      displayName: 'Drinking Water Tanker',
      capacityLitres: 5000,
      availableLitres: 5000,
      pricePer1000Litres: 700,
      waterType: WaterType.DRINKING,
      status: TankerStatus.AVAILABLE,
      latitude: 19.8780,
      longitude: 75.3450,
      lastLocationUpdate: new Date().toISOString(),
      verificationStatus: 'VERIFIED',
    },
    {
      tankerId: 't-small',
      displayName: 'Small Tanker',
      capacityLitres: 2000,
      availableLitres: 500, // Only 500L left
      pricePer1000Litres: 500,
      waterType: WaterType.NON_DRINKING,
      status: TankerStatus.AVAILABLE,
      latitude: 19.8763,
      longitude: 75.3434,
      lastLocationUpdate: new Date().toISOString(),
      verificationStatus: 'UNVERIFIED',
    },
  ];

  // 1. Tanker Filtering & Distance Ranking
  {
    const ranked = rankAvailableTankers(sampleTankers, residentLat, residentLng, 2000, WaterType.NON_DRINKING);

    // OFFLINE tanker must be excluded
    assert.strictEqual(
      ranked.some(t => t.tankerId === 't-offline'),
      false,
      'OFFLINE tankers must be excluded from available supply'
    );

    // Insufficient capacity (500L available vs 2000L required) must be excluded
    assert.strictEqual(
      ranked.some(t => t.tankerId === 't-small'),
      false,
      'Tankers with insufficient available capacity must be excluded'
    );

    // Incompatible water category (DRINKING when NON_DRINKING requested)
    assert.strictEqual(
      ranked.some(t => t.tankerId === 't-drinking'),
      false,
      'Tankers with incompatible water category must be excluded'
    );

    // Closest tanker should be ranked first
    assert.strictEqual(ranked.length, 2, '2 eligible tankers found');
    assert.strictEqual(ranked[0].tankerId, 't-close', 'Closest tanker must rank higher than distant tanker');
    assert.ok(ranked[0].distanceKm < ranked[1].distanceKm, 'Distance calculation ranks closer tanker first');
  }

  // 2. Demand Pooling - Eligible Case
  {
    const reqA = {
      requestId: 'req-A',
      requesterId: 'user-a',
      quantityLitres: 1000,
      latitude: 19.8765,
      longitude: 75.3435,
      deliveryWindowStart: '2026-10-11T14:00:00.000Z',
      waterType: WaterType.NON_DRINKING,
      status: RequestStatus.OPEN,
    };

    const reqB = {
      requestId: 'req-B',
      requesterId: 'user-b',
      quantityLitres: 1000,
      latitude: 19.8780, // ~200m from reqA
      longitude: 75.3445,
      deliveryWindowStart: '2026-10-11T14:30:00.000Z', // 30 mins window diff
      waterType: WaterType.NON_DRINKING,
      status: RequestStatus.OPEN,
    };

    const poolResult = evaluateDemandPool(reqA, [reqA, reqB], sampleTankers);
    assert.strictEqual(poolResult.eligible, true, 'Compatible nearby requests must be eligible for pooling');
    assert.strictEqual(poolResult.combinedQuantityLitres, 2000, 'Combined quantity is 2000L');
    assert.strictEqual(poolResult.matchedRequestsCount, 2, 'Pool includes 2 requests');
    assert.ok(poolResult.quotedPrice > 0, 'Quoted price calculated');
  }

  // 3. Demand Pooling - Ineligible due to Distance
  {
    const reqA = {
      requestId: 'req-A',
      requesterId: 'user-a',
      quantityLitres: 1000,
      latitude: 19.8765,
      longitude: 75.3435,
      deliveryWindowStart: '2026-10-11T14:00:00.000Z',
      waterType: WaterType.NON_DRINKING,
      status: RequestStatus.OPEN,
    };

    const distantReq = {
      requestId: 'req-distant',
      requesterId: 'user-distant',
      quantityLitres: 1000,
      latitude: 20.1500, // > 30km away
      longitude: 75.6000,
      deliveryWindowStart: '2026-10-11T14:00:00.000Z',
      waterType: WaterType.NON_DRINKING,
      status: RequestStatus.OPEN,
    };

    const poolResult = evaluateDemandPool(reqA, [reqA, distantReq], sampleTankers);
    assert.strictEqual(poolResult.eligible, false, 'Geographically distant requests must not be pooled');
  }

  // 4. Demand Pooling - Ineligible due to Window Difference
  {
    const reqA = {
      requestId: 'req-A',
      requesterId: 'user-a',
      quantityLitres: 1000,
      latitude: 19.8765,
      longitude: 75.3435,
      deliveryWindowStart: '2026-10-11T09:00:00.000Z',
      waterType: WaterType.NON_DRINKING,
      status: RequestStatus.OPEN,
    };

    const eveningReq = {
      requestId: 'req-evening',
      requesterId: 'user-evening',
      quantityLitres: 1000,
      latitude: 19.8770,
      longitude: 75.3440,
      deliveryWindowStart: '2026-10-11T20:00:00.000Z', // 11 hours difference
      waterType: WaterType.NON_DRINKING,
      status: RequestStatus.OPEN,
    };

    const poolResult = evaluateDemandPool(reqA, [reqA, eveningReq], sampleTankers);
    assert.strictEqual(poolResult.eligible, false, 'Incompatible delivery windows (> 2h) must not be pooled');
  }
}
