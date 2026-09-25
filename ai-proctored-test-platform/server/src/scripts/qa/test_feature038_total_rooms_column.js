/**
 * QA Test Suite for FEATURE-038:
 * Add "Total Rooms" column to Test Management table
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Admin = require('../../models/Admin');
const QuestionSet = require('../../models/QuestionSet');
const Folder = require('../../models/Folder');
const Candidate = require('../../models/Candidate');
const Submission = require('../../models/Submission');
const MalpracticeLog = require('../../models/MalpracticeLog');
const { getTests } = require('../../controllers/testController');
const { getRooms } = require('../../controllers/roomController');

async function runFeature038Tests() {
  console.log('====================================================');
  console.log('🧪 QA TEST SUITE: FEATURE-038 TOTAL ROOMS COLUMN');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function check(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Audit Frontend Source: AdminTests.jsx
  const adminTestsPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTests.jsx');
  const adminTestsSrc = fs.readFileSync(adminTestsPath, 'utf8');

  check(adminTestsSrc.includes("{ id: 'rooms', label: 'Total Rooms' }"), 'SORT_FIELDS includes Total Rooms');
  check(adminTestsSrc.includes("if (s === 'rooms_asc' || s === 'rooms_desc') return 'rooms';"), 'activeSortField handles rooms sorting');
  check(adminTestsSrc.includes("if (activeSortField === 'rooms')"), 'currentSortSummaryLabel handles rooms label');
  check(adminTestsSrc.includes("case 'rooms':"), 'filteredTests sort switch implements rooms sorting');
  check(adminTestsSrc.includes("<th style={{ width: 95, minWidth: 90 }}>Total Rooms</th>"), 'Table header includes Total Rooms column');
  check(adminTestsSrc.includes("test.totalRooms ?? test.roomCount ?? 0"), 'Table row renders test.totalRooms accurately');
  check(adminTestsSrc.includes("colSpan={11}"), 'Empty state updated with colSpan=11 for new column');

  // Verify column ordering: Question Set -> Total Rooms -> Created
  const questionSetIndex = adminTestsSrc.indexOf('Question Set</th>');
  const totalRoomsIndex = adminTestsSrc.indexOf('Total Rooms</th>');
  const createdIndex = adminTestsSrc.indexOf('Created</th>');

  check(questionSetIndex !== -1 && totalRoomsIndex !== -1 && createdIndex !== -1, 'All three adjacent headers exist in source');
  check(
    questionSetIndex < totalRoomsIndex && totalRoomsIndex < createdIndex,
    'Total Rooms is positioned strictly after Question Set and before Created'
  );

  // 2. Test Backend Logic against MongoDB
  if (!mongoose.connection.readyState) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  const cleanupIds = {
    testIds: [],
    roomIds: [],
  };

  try {
    const adminId = new mongoose.Types.ObjectId();

    // Create Test 1: Draft Test with 0 rooms
    const draftTest = await Test.create({
      title: 'QA Draft Test 038 (0 Rooms) ' + Date.now(),
      testType: 'JAVASCRIPT',
      durationMinutes: 30,
      passingCriteria: 1,
      status: 'DRAFT',
      instructions: 'QA Instructions',
      createdBy: adminId,
    });
    cleanupIds.testIds.push(draftTest._id);

    // Create Test 2: Live Test with 1 room
    const singleRoomTest = await Test.create({
      title: 'QA Single Room Test 038 ' + Date.now(),
      testType: 'JAVASCRIPT',
      durationMinutes: 45,
      passingCriteria: 2,
      status: 'LIVE',
      instructions: 'QA Instructions',
      createdBy: adminId,
    });
    cleanupIds.testIds.push(singleRoomTest._id);

    const room1 = await Room.create({
      testId: singleRoomTest._id,
      roomName: 'Single Room Lab-1',
      roomCode: 'RM1_' + Date.now().toString().slice(-4),
      roomPassword: 'pwd',
      status: 'ACTIVE',
      joinedCandidates: [],
    });
    cleanupIds.roomIds.push(room1._id);

    // Create Test 3: Ended Test with 3 rooms (2 closed, 1 active)
    const multiRoomTest = await Test.create({
      title: 'QA Multi Room Test 038 ' + Date.now(),
      testType: 'SPOJ',
      durationMinutes: 60,
      passingCriteria: 1,
      status: 'ENDED',
      instructions: 'QA Instructions',
      createdBy: adminId,
    });
    cleanupIds.testIds.push(multiRoomTest._id);

    const roomA = await Room.create({
      testId: multiRoomTest._id,
      roomName: 'Room Alpha',
      roomCode: 'RMA_' + Date.now().toString().slice(-4),
      roomPassword: 'pwd',
      status: 'CLOSED',
      joinedCandidates: [],
    });
    const roomB = await Room.create({
      testId: multiRoomTest._id,
      roomName: 'Room Beta',
      roomCode: 'RMB_' + Date.now().toString().slice(-4),
      roomPassword: 'pwd',
      status: 'CLOSED',
      joinedCandidates: [],
    });
    const roomC = await Room.create({
      testId: multiRoomTest._id,
      roomName: 'Room Gamma',
      roomCode: 'RMC_' + Date.now().toString().slice(-4),
      roomPassword: 'pwd',
      status: 'CLOSED',
      joinedCandidates: [],
    });
    cleanupIds.roomIds.push(roomA._id, roomB._id, roomC._id);

    // Execute getTests controller
    const req = { app: { get: () => null } };
    let responseData = null;
    const res = {
      json: (data) => {
        responseData = data;
      },
    };

    await getTests(req, res, (err) => {
      if (err) throw err;
    });

    check(Boolean(responseData && Array.isArray(responseData.tests)), 'getTests returned array of tests');

    const draftResult = responseData.tests.find((t) => t._id.toString() === draftTest._id.toString());
    const singleResult = responseData.tests.find((t) => t._id.toString() === singleRoomTest._id.toString());
    const multiResult = responseData.tests.find((t) => t._id.toString() === multiRoomTest._id.toString());

    // Verify 0 rooms test
    check(Boolean(draftResult), 'Draft test found in getTests response');
    check(draftResult?.totalRooms === 0, `Draft test totalRooms is 0 (actual: ${draftResult?.totalRooms})`);
    check(draftResult?.roomCount === 0, `Draft test roomCount is 0 (actual: ${draftResult?.roomCount})`);

    // Verify 1 room test
    check(Boolean(singleResult), 'Single room test found in getTests response');
    check(singleResult?.totalRooms === 1, `Single room test totalRooms is 1 (actual: ${singleResult?.totalRooms})`);
    check(singleResult?.roomCount === 1, `Single room test roomCount is 1 (actual: ${singleResult?.roomCount})`);

    // Verify 3 rooms test
    check(Boolean(multiResult), 'Multi-room test found in getTests response');
    check(multiResult?.totalRooms === 3, `Multi-room test totalRooms is 3 (actual: ${multiResult?.totalRooms})`);
    check(multiResult?.roomCount === 3, `Multi-room test roomCount is 3 (actual: ${multiResult?.roomCount})`);

    // Parity with getRooms controller ("Manage & Rooms" page data source)
    let multiRoomsResponse = null;
    const reqRooms = { params: { testId: multiRoomTest._id.toString() }, app: { get: () => null } };
    const resRooms = {
      json: (data) => {
        multiRoomsResponse = data;
      },
    };
    await getRooms(reqRooms, resRooms, (err) => {
      if (err) throw err;
    });

    check(Boolean(multiRoomsResponse && Array.isArray(multiRoomsResponse.rooms)), 'getRooms returned array of rooms for multi-room test');
    check(
      multiResult?.totalRooms === multiRoomsResponse.rooms.length,
      `totalRooms in table (${multiResult?.totalRooms}) exactly matches room count from Manage & Rooms page (${multiRoomsResponse.rooms.length})`
    );

  } finally {
    // Clean up test data
    if (cleanupIds.testIds.length > 0) await Test.deleteMany({ _id: { $in: cleanupIds.testIds } });
    if (cleanupIds.roomIds.length > 0) await Room.deleteMany({ _id: { $in: cleanupIds.roomIds } });
    await mongoose.disconnect();
  }

  console.log(`\n====================================================`);
  console.log(`📊 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runFeature038Tests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
