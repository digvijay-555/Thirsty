/**
 * WaterSaathi - Local Development HTTP Server
 * 
 * Provides a local REST API endpoint for Person 1 (Resident Web) and
 * Person 3 (Operator/Admin) using native Node.js HTTP (no express dependency required).
 * 
 * Maps HTTP requests to Lambda handler signatures with simulated event envelopes.
 */

import http from 'node:http';
import { URL } from 'node:url';
import { db } from './shared/db.js';
import { seedDatabase } from '../../scripts/seed-demo-data.js';

// Import Lambda Handlers
import { handler as tankerDiscovery } from './tankers/discovery.js';
import { handler as tankerLocation } from './tankers/location.js';
import { handler as requestCreate } from './requests/create.js';
import { handler as requestGet } from './requests/get.js';
import { handler as requestJoinPool } from './requests/pool.js';
import { handler as bookingList } from './bookings/list.js';
import { handler as bookingAccept } from './bookings/accept.js';
import { handler as bookingReject } from './bookings/reject.js';
import { handler as bookingStatus } from './bookings/status.js';
import { handler as shortageReportCreate } from './reports/create.js';
import { handler as shortageReportList } from './reports/list.js';
import { handler as shortageReportStatus } from './reports/status.js';

const PORT = process.env.PORT || 3001;

// Seed local database on boot
await seedDatabase(db);

function parsePathParams(pattern, pathname) {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');
  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      const key = patternParts[i].slice(1);
      params[key] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

const routes = [
  { method: 'GET', path: '/tankers', handler: tankerDiscovery },
  { method: 'POST', path: '/tankers/:id/location', handler: tankerLocation },
  { method: 'POST', path: '/requests', handler: requestCreate },
  { method: 'GET', path: '/requests/:id', handler: requestGet },
  { method: 'POST', path: '/requests/:id/join-pool', handler: requestJoinPool },
  { method: 'GET', path: '/bookings', handler: bookingList },
  { method: 'POST', path: '/bookings/:id/accept', handler: bookingAccept },
  { method: 'POST', path: '/bookings/:id/reject', handler: bookingReject },
  { method: 'POST', path: '/bookings/:id/status', handler: bookingStatus },
  { method: 'POST', path: '/shortage-reports', handler: shortageReportCreate },
  { method: 'GET', path: '/admin/shortage-reports', handler: shortageReportList },
  { method: 'POST', path: '/admin/shortage-reports/:id/status', handler: shortageReportStatus },
];

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;
  const method = req.method.toUpperCase();

  // CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token, X-Idempotency-Key',
    });
    return res.end();
  }

  // Find matching route
  let matchedRoute = null;
  let pathParameters = {};

  for (const r of routes) {
    if (r.method === method) {
      const params = parsePathParams(r.path, pathname);
      if (params) {
        matchedRoute = r;
        pathParameters = params;
        break;
      }
    }
  }

  if (!matchedRoute) {
    res.writeHead(404, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: `Route ${method} ${pathname} not found.` } }));
  }

  // Collect request body
  let bodyBuffer = '';
  req.on('data', chunk => {
    bodyBuffer += chunk;
  });

  req.on('end', async () => {
    const queryStringParameters = {};
    reqUrl.searchParams.forEach((val, key) => {
      queryStringParameters[key] = val;
    });

    const event = {
      httpMethod: method,
      path: pathname,
      pathParameters,
      queryStringParameters,
      headers: req.headers,
      body: bodyBuffer,
    };

    try {
      const lambdaResult = await matchedRoute.handler(event);
      res.writeHead(lambdaResult.statusCode || 200, lambdaResult.headers || { 'Content-Type': 'application/json' });
      res.end(lambdaResult.body || '');
    } catch (err) {
      console.error('Local Server Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` WaterSaathi Local API Server running on port ${PORT}`);
  console.log(` Base URL: http://localhost:${PORT}`);
  console.log(` Status: Seeded with demo tankers, requests, & reports`);
  console.log(`=======================================================`);
});

export { server };
