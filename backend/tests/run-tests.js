/**
 * WaterSaathi - Pure JavaScript Automated Test Suite Runner
 * 
 * Runs all Person 2 unit and handler integration tests without external test frameworks.
 */

import assert from 'node:assert';
import { runValidationTests } from './validation.test.js';
import { runPricingTests } from './pricing.test.js';
import { runStatusTransitionTests } from './statusTransitions.test.js';
import { runMatchingTests } from './matching.test.js';
import { runApiHandlerTests } from './apiHandlers.test.js';

let passed = 0;
let failed = 0;

function wrapAssert(baseAssert) {
  const handler = {
    get(target, prop) {
      if (typeof target[prop] === 'function') {
        return (...args) => {
          try {
            target[prop](...args);
            passed++;
          } catch (err) {
            failed++;
            console.error(`  FAIL [${prop}]:`, err.message);
            throw err;
          }
        };
      }
      return target[prop];
    },
  };
  return new Proxy(baseAssert, handler);
}

const proxyAssert = wrapAssert(assert);

async function runAll() {
  console.log('====================================================');
  console.log(' WaterSaathi Backend Test Suite (Person 2)');
  console.log('====================================================\n');

  const testSuites = [
    { name: '1. Input Validation Tests', fn: () => runValidationTests(proxyAssert) },
    { name: '2. Pricing Engine & Currency Tests', fn: () => runPricingTests(proxyAssert) },
    { name: '3. Lifecycle State Transition Tests', fn: () => runStatusTransitionTests(proxyAssert) },
    { name: '4. Candidate Matching & Pooling Tests', fn: () => runMatchingTests(proxyAssert) },
    { name: '5. API Lambda Handlers & DB Integration Tests', fn: () => runApiHandlerTests(proxyAssert) },
  ];

  for (const suite of testSuites) {
    console.log(`RUNNING: ${suite.name}...`);
    try {
      await suite.fn();
      console.log(`  PASSED: ${suite.name}\n`);
    } catch (err) {
      console.error(`\n  FAILED: ${suite.name}\n`, err);
    }
  }

  console.log('====================================================');
  console.log(` Test Execution Summary:`);
  console.log(`   Passed Assertions: ${passed}`);
  console.log(`   Failed Assertions: ${failed}`);
  console.log(`   Result: ${failed === 0 ? 'ALL TESTS PASSED' : 'TESTS FAILED'}`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
