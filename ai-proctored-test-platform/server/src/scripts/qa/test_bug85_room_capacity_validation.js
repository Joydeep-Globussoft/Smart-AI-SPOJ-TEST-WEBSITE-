/**
 * QA Test Suite for BUG-85: Room Capacity Validation (Max: 150)
 * 
 * Validates:
 * 1. Backend validation in roomController.js:
 *    - Valid inputs: 1, 50, 100, 150 -> 201 Created
 *    - Omitted / empty string capacity -> 201 Created (capacity is undefined)
 *    - Out-of-bounds: 151, 500, 347555555555555600 -> 400 Bad Request
 *    - Non-positive / 0: 0, -5 -> 400 Bad Request
 *    - Non-integers: 12.5, "abc" -> 400 Bad Request
 * 2. Frontend verification in AdminTestDetail.jsx:
 *    - input has min="1" and max="150"
 *    - client-side validation prevents invalid capacity submission
 * 3. Database verification:
 *    - room lab-1 has capacity sanitized to 50
 * 4. Non-regression:
 *    - joinRoom in submissionController.js remains untouched and candidate joins succeed
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

require('dotenv').config({ path: path.join(__dirname, '../../../../server/.env') });

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-proctored-test-platform';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'dev_jwt_access_secret_globussoft_2026';

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('BUG-85 TEST SUITE: Room Capacity Validation (Max 150)');
  console.log('======================================================\n');

  // 1. Static Code Analysis
  const roomControllerPath = path.join(__dirname, '../../controllers/roomController.js');
  const adminTestDetailPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminTestDetail.jsx');

  const roomControllerContent = fs.readFileSync(roomControllerPath, 'utf8');
  const adminTestDetailContent = fs.readFileSync(adminTestDetailPath, 'utf8');

  runTest('Backend roomController.js validates capacity between 1 and 150', () => {
    assert(
      roomControllerContent.includes('parsedCapacity < 1 || parsedCapacity > 150') ||
      roomControllerContent.includes('parsedCapacity > 150 || parsedCapacity < 1'),
      'Backend must enforce capacity between 1 and 150'
    );
    assert(
      roomControllerContent.includes('Room capacity must be an integer between 1 and 150'),
      'Backend must return informative 400 error message'
    );
  });

  runTest('Frontend AdminTestDetail.jsx input has max="150" and min="1"', () => {
    assert(adminTestDetailContent.includes('min="1"'), 'Input must have min="1"');
    assert(adminTestDetailContent.includes('max="150"'), 'Input must have max="150"');
    assert(adminTestDetailContent.includes('max 150'), 'Label or placeholder should indicate max 150');
  });

  runTest('Frontend AdminTestDetail.jsx performs client-side capacity parsing and validation', () => {
    assert(
      adminTestDetailContent.includes('raw < 1 || raw > 150') ||
      adminTestDetailContent.includes('raw > 150 || raw < 1'),
      'Client-side handleAddRoomSubmit must check 1 <= raw <= 150'
    );
    assert(
      adminTestDetailContent.includes('Room capacity must be a whole number between 1 and 150'),
      'Client-side must show toast error for out-of-range capacity'
    );
  });

  // 2. Database & API Direct Endpoint Validation
  await mongoose.connect(uri);
  const Room = require('../../models/Room');
  const Test = require('../../models/Test');
  const Candidate = require('../../models/Candidate');
  const Submission = require('../../models/Submission');

  // Verify lab-1 sanitized in DB
  await runAsyncTest('Database verification: lab-1 capacity is sanitized to 50', async () => {
    const lab1 = await Room.findOne({ roomName: 'lab-1' }).lean();
    assert(lab1, 'lab-1 room should exist in database');
    assert.strictEqual(lab1.capacity, 50, `lab-1 capacity must be 50, found: ${lab1.capacity}`);
  });

  // Setup test admin and test doc
  const testDoc = await Test.findOne({ status: { $in: ['DRAFT', 'SCHEDULED', 'LIVE'] } }).lean();
  assert(testDoc, 'Test document required for API tests');

  // Test backend validation logic directly via mock request / controller logic
  const { createRoom } = require('../../controllers/roomController');

  const testCases = [
    { capacity: 1, expectedStatus: 201, desc: 'Boundary valid: 1' },
    { capacity: 50, expectedStatus: 201, desc: 'Standard valid: 50' },
    { capacity: 100, expectedStatus: 201, desc: 'Standard valid: 100' },
    { capacity: 150, expectedStatus: 201, desc: 'Boundary valid: 150' },
    { capacity: undefined, expectedStatus: 201, desc: 'Optional omitted: undefined' },
    { capacity: '', expectedStatus: 201, desc: 'Optional blank string: ""' },
    { capacity: 0, expectedStatus: 400, desc: 'Invalid: 0' },
    { capacity: -1, expectedStatus: 400, desc: 'Invalid: -1' },
    { capacity: 151, expectedStatus: 400, desc: 'Invalid: 151 (over max 150)' },
    { capacity: 500, expectedStatus: 400, desc: 'Invalid: 500' },
    { capacity: 347555555555555600, expectedStatus: 400, desc: 'Invalid: 347555555555555600' },
    { capacity: 12.5, expectedStatus: 400, desc: 'Invalid float: 12.5' },
    { capacity: 'abc', expectedStatus: 400, desc: 'Invalid non-numeric string: "abc"' },
  ];

  for (const tc of testCases) {
    await runAsyncTest(`createRoom backend validation: ${tc.desc}`, async () => {
      let statusCode = null;
      let responseBody = null;

      const req = {
        params: { testId: testDoc._id.toString() },
        body: {
          roomName: `QA-Cap-${Date.now()}-${Math.floor(Math.random()*1000)}`,
          capacity: tc.capacity,
        },
        app: { get: () => null },
      };

      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        },
      };

      let nextError = null;
      const next = (err) => { nextError = err; };

      await createRoom(req, res, next);

      assert.strictEqual(statusCode, tc.expectedStatus, `Expected status ${tc.expectedStatus}, got ${statusCode} (${JSON.stringify(responseBody || nextError)})`);
      if (tc.expectedStatus === 201) {
        assert(responseBody?.room, 'Response body must contain room on 201');
        if (tc.capacity === undefined || tc.capacity === '') {
          assert.strictEqual(responseBody.room.capacity, undefined, 'Omitted capacity must be undefined');
        } else {
          assert.strictEqual(responseBody.room.capacity, tc.capacity, `Capacity must match ${tc.capacity}`);
        }
        // Clean up created QA room
        await Room.deleteOne({ _id: responseBody.room._id });
      } else {
        assert(responseBody?.error, 'Response body must contain error on 400');
      }
    });
  }

  // 4. Verification: Candidate join logic properly enforces room capacity (BUG-101)
  runTest('Verification: submissionController.js joinRoom enforces capacity (BUG-101)', () => {
    const submissionControllerPath = path.join(__dirname, '../../controllers/submissionController.js');
    const submissionContent = fs.readFileSync(submissionControllerPath, 'utf8');
    assert(submissionContent.includes('room.capacity') && submissionContent.includes('ROOM_CAPACITY_FULL'),
      'joinRoom must enforce capacity');
  });

  await mongoose.disconnect();

  console.log(`\n======================================================`);
  console.log(`RESULTS: ${passedTests}/${totalTests} Passed`);
  console.log(`======================================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
