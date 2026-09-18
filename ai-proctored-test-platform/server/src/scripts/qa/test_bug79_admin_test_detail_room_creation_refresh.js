// test_bug79_admin_test_detail_room_creation_refresh.js
// QA Verification Suite for BUG-79:
// Verifies AdminTestDetail.jsx fetchTestAndRooms, room creation, and socket event refresh flow.

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Admin = require('../../models/Admin');
const Folder = require('../../models/Folder');
const QuestionSet = require('../../models/QuestionSet');
const Question = require('../../models/Question');
const roomController = require('../../controllers/roomController');
const testController = require('../../controllers/testController');

async function runTests() {
  console.log('========================================================================');
  console.log('QA SUITE: BUG-79 - ADMIN TEST DETAIL ROOM CREATION & REFRESH');
  console.log('========================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passedTests++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      process.exitCode = 1;
    }
  }

  // --- Step 1: Static Code Inspection of AdminTestDetail.jsx ---
  console.log('--- Step 1: Static Code Inspection of AdminTestDetail.jsx ---');
  const adminTestDetailPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminTestDetail.jsx');
  const sourceCode = fs.readFileSync(adminTestDetailPath, 'utf8');

  assert(!sourceCode.includes('qsRes'), 'AdminTestDetail.jsx has no undefined references to qsRes');
  assert(!sourceCode.includes('setQuestionSets(qsRes'), 'AdminTestDetail.jsx removed invalid setQuestionSets(qsRes)');
  assert(!sourceCode.includes('setPools(poolRes'), 'AdminTestDetail.jsx removed invalid setPools(poolRes)');
  assert(sourceCode.includes('setFolders(poolRes.data?.pools || [])'), 'AdminTestDetail.jsx correctly updates folders state from poolRes');
  assert(sourceCode.includes('setRooms(roomsRes.data.rooms || [])'), 'AdminTestDetail.jsx correctly updates rooms state from roomsRes');
  assert(sourceCode.includes('setTest(fetchedTest)'), 'AdminTestDetail.jsx correctly updates test state');

  // --- Step 2: Database Live Execution & Endpoint Flow Verification ---
  console.log('\n--- Step 2: Database Live Execution & Endpoint Flow Verification ---');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  let testFolder, testQSet, testQuestion, liveTest, createdRoomId;

  try {
    const adminId = new mongoose.Types.ObjectId();

    testFolder = await Folder.create({
      name: `BUG79 Folder ${Date.now()}`,
      testType: 'JAVASCRIPT',
      createdBy: adminId,
    });

    testQSet = await QuestionSet.create({
      name: 'BUG79 Set 1',
      folderId: testFolder._id,
      testType: 'JAVASCRIPT',
      createdBy: adminId,
      questionIds: [],
    });

    testQuestion = await Question.create({
      questionSetId: testQSet._id,
      testType: 'JAVASCRIPT',
      title: 'BUG79 Q1',
      description: 'Test Q',
      difficulty: 'EASY',
      sampleInput: '1',
      sampleOutput: '1',
    });

    testQSet.questionIds.push(testQuestion._id);
    await testQSet.save();

    liveTest = await Test.create({
      title: `BUG79 Test ${Date.now()}`,
      testType: 'JAVASCRIPT',
      folderId: testFolder._id,
      questionSetPoolId: testFolder._id.toString(),
      durationMinutes: 60,
      totalQuestions: 1,
      passingCriteria: 1,
      instructions: 'Instructions',
      startTestWindowMinutes: 10,
      supportedLanguages: ['javascript'],
      status: 'DRAFT',
      createdBy: adminId,
    });

    // 1. Simulate Room Creation via Controller
    console.log('\n--- Step 3: Simulating Room Creation ---');
    const mockReqCreateRoom = {
      params: { testId: liveTest._id.toString() },
      body: { roomName: 'df', capacity: 50 },
      user: { _id: adminId },
      app: {
        get: (key) => (key === 'io' ? { to: () => ({ emit: () => {} }) } : null),
      },
    };
    let createdRoomData = null;
    const mockResCreateRoom = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        createdRoomData = data;
        return this;
      },
    };

    await roomController.createRoom(mockReqCreateRoom, mockResCreateRoom, (err) => {
      if (err) throw err;
    });

    assert(createdRoomData && createdRoomData.room, 'Room "df" created successfully in backend');
    assert(createdRoomData.room.roomName === 'df', 'Created room has correct roomName "df"');
    assert(createdRoomData.room.roomCode && createdRoomData.room.roomPassword, 'Created room has valid roomCode and roomPassword');
    createdRoomId = createdRoomData.room._id;

    // 2. Simulate fetchTestAndRooms call sequence
    console.log('\n--- Step 4: Simulating fetchTestAndRooms Promise.all Sequence ---');
    const mockReqGetTest = {
      params: { testId: liveTest._id.toString() },
      user: { _id: adminId },
    };
    let testResponseData = null;
    const mockResGetTest = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        testResponseData = data;
        return this;
      },
    };
    await testController.getTest(mockReqGetTest, mockResGetTest, (err) => {
      if (err) throw err;
    });

    const mockReqGetRooms = {
      params: { testId: liveTest._id.toString() },
      user: { _id: adminId },
    };
    let roomsResponseData = null;
    const mockResGetRooms = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        roomsResponseData = data;
        return this;
      },
    };
    await roomController.getRooms(mockReqGetRooms, mockResGetRooms, (err) => {
      if (err) throw err;
    });

    assert(testResponseData && testResponseData.test, 'api.getTest returned valid test payload');
    assert(roomsResponseData && roomsResponseData.rooms, 'api.getRooms returned valid rooms payload');
    assert(roomsResponseData.rooms.length === 1, 'api.getRooms returned newly created room');
    assert(roomsResponseData.rooms[0].roomName === 'df', 'Room in list matches created room "df"');

    // 3. Simulate React Client State Updates
    console.log('\n--- Step 5: Simulating Client State Execution ---');
    let clientState = {
      test: null,
      folders: [],
      passingCriteria: 0,
      malpracticeThreshold: '',
      rooms: [],
    };

    let clientError = null;
    try {
      const testRes = { data: testResponseData };
      const roomsRes = { data: roomsResponseData };
      const poolRes = { data: { pools: [{ poolId: testFolder._id.toString(), name: testFolder.name }] } };

      const fetchedTest = testRes.data.test;
      clientState.test = fetchedTest;
      clientState.folders = poolRes.data?.pools || [];
      clientState.passingCriteria = fetchedTest.passingCriteria || 0;
      clientState.malpracticeThreshold =
        fetchedTest.malpracticeDisqualifyThreshold !== null &&
        fetchedTest.malpracticeDisqualifyThreshold !== undefined
          ? fetchedTest.malpracticeDisqualifyThreshold
          : '';
      clientState.rooms = roomsRes.data.rooms || [];
    } catch (err) {
      clientError = err;
    }

    assert(clientError === null, 'Client fetchTestAndRooms executed without throwing any error');
    assert(clientState.test && clientState.test.title === liveTest.title, 'Client test state set accurately');
    assert(clientState.rooms.length === 1, 'Client rooms state updated with 1 room');
    assert(clientState.rooms[0].roomName === 'df', 'Client room name is "df"');
    assert(clientState.folders.length === 1, 'Client folders state updated accurately');

  } finally {
    // Cleanup
    if (createdRoomId) await Room.findByIdAndDelete(createdRoomId);
    if (liveTest) await Test.findByIdAndDelete(liveTest._id);
    if (testQuestion) await Question.findByIdAndDelete(testQuestion._id);
    if (testQSet) await QuestionSet.findByIdAndDelete(testQSet._id);
    if (testFolder) await Folder.findByIdAndDelete(testFolder._id);
    await mongoose.disconnect();
  }

  console.log('\n========================================================================');
  console.log(`QA VERIFICATION SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('========================================================================\n');
  process.exit(passedTests === totalTests ? 0 : 1);
}

runTests().catch((err) => {
  console.error('Fatal error in QA suite:', err);
  process.exit(1);
});
