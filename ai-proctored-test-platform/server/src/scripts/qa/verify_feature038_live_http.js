/**
 * Live HTTP Verification for FEATURE-038
 * Tests live backend API against real room data
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const LOCAL_API = 'http://localhost:5000/api/v1';
const PROD_API = 'https://smart-ai-spoj-test-website.onrender.com/api/v1';

async function testBackend(baseUrl, label) {
  console.log(`\n====================================================`);
  console.log(`Verifying ${label}: ${baseUrl}`);
  console.log(`====================================================`);

  try {
    // 1. Admin login
    const loginRes = await fetch(`${baseUrl}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'superadmin@globussoft.in',
        password: 'GlobusAdmin2026!',
      }),
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    if (!token) throw new Error('Failed to get token: ' + JSON.stringify(loginData));
    console.log(`[PASS] Admin authenticated. Token received.`);

    const authHeaders = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    };

    // 2. Fetch tests
    const testsRes = await fetch(`${baseUrl}/tests`, authHeaders);
    const testsData = await testsRes.json();
    const tests = testsData.tests || [];
    console.log(`[PASS] Fetched ${tests.length} tests from /tests.`);

    if (tests.length === 0) {
      console.log('No tests found in DB.');
      return;
    }

    console.log(`\n--- Inspecting First 5 Tests in Table Response ---`);
    for (let i = 0; i < Math.min(5, tests.length); i++) {
      const t = tests[i];
      console.log(
        `#${i + 1} "${t.title}" | Status: ${t.status} | Total Participants: ${t.totalParticipants ?? 0} | Total Rooms: ${t.totalRooms ?? t.roomCount ?? 0}`
      );
    }

    // 3. Verify parity with /tests/:testId/rooms for at least 3 tests
    console.log(`\n--- Verifying Parity with Manage & Rooms (Physical Rooms) for 3 Tests ---`);
    const testSample = tests.slice(0, 3);
    for (const t of testSample) {
      const roomsRes = await fetch(`${baseUrl}/tests/${t._id}/rooms`, authHeaders);
      const roomsData = await roomsRes.json();
      const rooms = roomsData.rooms || [];
      const tableTotalRooms = t.totalRooms ?? t.roomCount ?? 0;
      const manageRoomsCount = rooms.length;

      const matches = tableTotalRooms === manageRoomsCount;
      console.log(
        `Test "${t.title}" (${t._id}): Table Total Rooms = ${tableTotalRooms}, Manage & Rooms count = ${manageRoomsCount} -> ${matches ? '✅ MATCH' : '❌ MISMATCH'}`
      );
      if (!matches) {
        throw new Error(`Mismatch on test ${t._id}: table=${tableTotalRooms}, rooms.length=${manageRoomsCount}`);
      }
    }

    console.log(`\n✅ ALL REAL DATA VERIFICATIONS PASSED FOR ${label}!`);
  } catch (err) {
    console.error(`Error verifying ${label}:`, err.message);
  }
}

async function run() {
  await testBackend(LOCAL_API, 'LOCAL BACKEND');
  await testBackend(PROD_API, 'HOSTED PRODUCTION BACKEND');
}

run();
