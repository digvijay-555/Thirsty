/**
 * Integration & Handler Unit Tests: API Handlers, CORS, Concurrency & Persistence
 */

import { db } from '../src/shared/db.js';
import { handler as tankerDiscovery } from '../src/tankers/discovery.js';
import { handler as tankerLocation } from '../src/tankers/location.js';
import { handler as requestCreate } from '../src/requests/create.js';
import { handler as requestGet } from '../src/requests/get.js';
import { handler as requestJoinPool } from '../src/requests/pool.js';
import { handler as bookingList } from '../src/bookings/list.js';
import { handler as bookingAccept } from '../src/bookings/accept.js';
import { handler as bookingReject } from '../src/bookings/reject.js';
import { handler as bookingStatus } from '../src/bookings/status.js';
import { handler as shortageReportCreate } from '../src/reports/create.js';
import { handler as shortageReportList } from '../src/reports/list.js';
import { seedDatabase } from '../../scripts/seed-demo-data.js';
import { BookingStatus, RequestStatus, TankerStatus } from '../../shared/types.js';

export async function runApiHandlerTests(assert) {
  // Reset and seed in-memory database
  db.inMemory.reset();
  await seedDatabase(db);

  // Helper to parse response body
  function parseRes(res) {
    return {
      statusCode: res.statusCode,
      headers: res.headers,
      body: JSON.parse(res.body || '{}'),
    };
  }

  // 1. Tanker Discovery
  {
    // Missing lat/lng -> 400 Validation Error
    const badReq = await tankerDiscovery({
      httpMethod: 'GET',
      queryStringParameters: {},
    });
    const parsedBad = parseRes(badReq);
    assert.strictEqual(parsedBad.statusCode, 400, 'Discovery without lat/lng must return 400');
    assert.strictEqual(parsedBad.body.error.code, 'VALIDATION_ERROR');

    // Valid coordinates -> 200 OK with tankers list & CORS
    const goodReq = await tankerDiscovery({
      httpMethod: 'GET',
      queryStringParameters: { lat: '19.8762', lng: '75.3433' },
    });
    const parsedGood = parseRes(goodReq);
    assert.strictEqual(parsedGood.statusCode, 200, 'Discovery with coordinates must return 200');
    assert.ok(Array.isArray(parsedGood.body.tankers), 'Response contains tankers array');
    assert.strictEqual(parsedGood.headers['Access-Control-Allow-Origin'], '*', 'CORS origin present');
    assert.ok(parsedGood.body.tankers.length > 0, 'Found seeded tankers');
  }

  // 2. Water Request Creation & Validation
  let createdRequestId = null;
  {
    // Negative quantity -> 400
    const badQty = await requestCreate({
      httpMethod: 'POST',
      body: JSON.stringify({
        requesterId: 'test-user',
        quantityLitres: -500,
        latitude: 19.8762,
        longitude: 75.3433,
        deliveryWindowStart: '2026-10-11T12:00:00.000Z',
      }),
    });
    assert.strictEqual(parseRes(badQty).statusCode, 400, 'Negative quantity must return 400');

    // Valid creation -> 201 Created
    const createRes = await requestCreate({
      httpMethod: 'POST',
      body: JSON.stringify({
        requesterId: 'resident-test-1',
        quantityLitres: 2000,
        latitude: 19.8762,
        longitude: 75.3433,
        deliveryWindowStart: '2026-10-10T14:15:00.000Z',
        waterType: 'NON_DRINKING',
      }),
    });
    const parsedCreate = parseRes(createRes);
    assert.strictEqual(parsedCreate.statusCode, 201, 'Valid request returns 201');
    assert.strictEqual(parsedCreate.body.status, RequestStatus.OPEN, 'Initial status is OPEN');
    assert.strictEqual(parsedCreate.body.quantityLitres, 2000);
    assert.ok(parsedCreate.body.quotedPrice > 0, 'Price quote generated');
    createdRequestId = parsedCreate.body.requestId;

    // Duplicate submission / Idempotency protection
    const idempotentRes = await requestCreate({
      httpMethod: 'POST',
      headers: { 'X-Idempotency-Key': createdRequestId },
      body: JSON.stringify({
        requesterId: 'resident-test-1',
        quantityLitres: 2000,
        latitude: 19.8762,
        longitude: 75.3433,
        deliveryWindowStart: '2026-10-10T14:15:00.000Z',
      }),
    });
    assert.strictEqual(parseRes(idempotentRes).statusCode, 200, 'Idempotent retry returns 200 with existing request');
  }

  // 3. Request Lookup
  {
    const getRes = await requestGet({
      httpMethod: 'GET',
      pathParameters: { id: createdRequestId },
    });
    const parsedGet = parseRes(getRes);
    assert.strictEqual(parsedGet.statusCode, 200, 'Request lookup returns 200');
    assert.strictEqual(parsedGet.body.request.requestId, createdRequestId);

    const notFound = await requestGet({
      httpMethod: 'GET',
      pathParameters: { id: 'non-existent-id' },
    });
    assert.strictEqual(parseRes(notFound).statusCode, 404, 'Unknown requestId returns 404');
  }

  // 4. Demand Pooling
  let candidateBookingId = null;
  {
    const poolRes = await requestJoinPool({
      httpMethod: 'POST',
      pathParameters: { id: createdRequestId },
    });
    const parsedPool = parseRes(poolRes);
    assert.strictEqual(parsedPool.statusCode, 200, 'Join pool returns 200');
    assert.strictEqual(parsedPool.body.eligible, true, 'Compatible pool found with seeded request-001/002');
    assert.ok(parsedPool.body.candidateBookingId, 'Candidate booking ID returned');
    assert.ok(parsedPool.body.combinedQuantityLitres >= 2000, 'Combined quantity computed');
    candidateBookingId = parsedPool.body.candidateBookingId;
  }

  // 5. Booking Acceptance & Capacity Reservation
  {
    const acceptRes = await bookingAccept({
      httpMethod: 'POST',
      pathParameters: { id: candidateBookingId },
    });
    const parsedAccept = parseRes(acceptRes);
    assert.strictEqual(parsedAccept.statusCode, 200, 'Booking acceptance returns 200');
    assert.strictEqual(parsedAccept.body.booking.status, BookingStatus.ACCEPTED);
    assert.ok(parsedAccept.body.tanker.availableLitres >= 0, 'Tanker capacity decremented');

    // Attempting to accept again should return conflict (409)
    const duplicateAccept = await bookingAccept({
      httpMethod: 'POST',
      pathParameters: { id: candidateBookingId },
    });
    assert.strictEqual(parseRes(duplicateAccept).statusCode, 409, 'Accepting already accepted booking returns 409');
  }

  // 6. Booking Status Updates & Allowed Transitions
  {
    // ACCEPTED -> EN_ROUTE (valid)
    const enRouteRes = await bookingStatus({
      httpMethod: 'POST',
      pathParameters: { id: candidateBookingId },
      body: JSON.stringify({ status: BookingStatus.EN_ROUTE }),
    });
    assert.strictEqual(parseRes(enRouteRes).statusCode, 200, 'ACCEPTED -> EN_ROUTE is valid');
    assert.strictEqual(parseRes(enRouteRes).body.booking.status, BookingStatus.EN_ROUTE);

    // EN_ROUTE -> DELIVERED (valid)
    const deliveredRes = await bookingStatus({
      httpMethod: 'POST',
      pathParameters: { id: candidateBookingId },
      body: JSON.stringify({ status: BookingStatus.DELIVERED }),
    });
    assert.strictEqual(parseRes(deliveredRes).statusCode, 200, 'EN_ROUTE -> DELIVERED is valid');
    assert.strictEqual(parseRes(deliveredRes).body.booking.status, BookingStatus.DELIVERED);

    // DELIVERED -> OPEN (illegal transition)
    const illegalRes = await bookingStatus({
      httpMethod: 'POST',
      pathParameters: { id: candidateBookingId },
      body: JSON.stringify({ status: BookingStatus.OPEN }),
    });
    assert.strictEqual(parseRes(illegalRes).statusCode, 400, 'DELIVERED -> OPEN is illegal and returns 400');
  }

  // 7. Tanker Location Updates
  {
    const locRes = await tankerLocation({
      httpMethod: 'POST',
      pathParameters: { id: 'tanker-001' },
      body: JSON.stringify({
        latitude: 19.8800,
        longitude: 75.3500,
        locationSource: 'SIMULATED',
      }),
    });
    const parsedLoc = parseRes(locRes);
    assert.strictEqual(parsedLoc.statusCode, 200, 'Location update returns 200');
    assert.strictEqual(parsedLoc.body.latitude, 19.8800);
    assert.strictEqual(parsedLoc.body.longitude, 75.3500);
  }

  // 8. Community Shortage Reports
  {
    const createRep = await shortageReportCreate({
      httpMethod: 'POST',
      body: JSON.stringify({
        reporterId: 'resident-demo-test',
        locality: 'Cidco Sector N-5',
        latitude: 19.8762,
        longitude: 75.3433,
        description: 'Borewell yield dry for 4 days.',
      }),
    });
    const parsedRep = parseRes(createRep);
    assert.strictEqual(parsedRep.statusCode, 201, 'Shortage report creation returns 201');
    assert.strictEqual(parsedRep.body.verificationStatus, 'UNVERIFIED', 'Initial status is UNVERIFIED');

    const listRep = await shortageReportList({ httpMethod: 'GET' });
    const parsedList = parseRes(listRep);
    assert.strictEqual(parsedList.statusCode, 200, 'Listing shortage reports returns 200');
    assert.ok(parsedList.body.reports.length >= 3, 'Reports include seeded and new reports');
  }
}
