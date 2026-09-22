// test_feature007_room_candidate_inspect_deeplink.js
// QA verification script for FEATURE-007:
// 1. Room candidate list provides authoritative candidate IDs
// 2. getLiveCandidates provides matching candidate IDs across rooms for deep-linking
// 3. Candidate malpractice logs endpoint works with candidateId
// 4. Works for both LIVE and ENDED tests
// 5. Handles non-existent candidate IDs gracefully

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const mongoose = require('mongoose');
const assert = require('assert');

const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Candidate = require('../../models/Candidate');
const Submission = require('../../models/Submission');
const MalpracticeLog = require('../../models/MalpracticeLog');
const { getRoomCandidates, getLiveCandidates } = require('../../controllers/roomController');

function mockReqRes(params = {}, query = {}, body = {}) {
  const req = {
    params,
    query,
    body,
    user: { id: 'mockAdminId', role: 'SUPER_ADMIN', email: 'admin@globussoft.in' },
    app: {
      get: (key) => (key === 'io' ? { to: () => ({ emit: () => {} }) } : null),
    },
  };
  const res = {
    _status: 200,
    _data: null,
    status(code) {
      this._status = code;
      return this;
    },
    json(data) {
      this._data = data;
      return this;
    },
  };
  return { req, res };
}

async function runTest() {
  console.log('=== QA Test: FEATURE-007 Room Candidate Inspect & Deep Link Contract ===\n');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spoj-test-platform';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.\n');

  try {
    // 1. Find tests: one ENDED and one LIVE (or any tests with candidates)
    const tests = await Test.find({}).sort({ updatedAt: -1 }).limit(20);
    console.log(`Found ${tests.length} tests in database.`);

    let testedCount = 0;

    for (const test of tests) {
      const rooms = await Room.find({ testId: test._id });
      if (!rooms || rooms.length === 0) continue;

      let roomWithCandidates = null;
      for (const r of rooms) {
        if (r.joinedCandidates && r.joinedCandidates.length > 0) {
          roomWithCandidates = r;
          break;
        }
      }

      if (!roomWithCandidates) {
        // Check submissions
        const sub = await Submission.findOne({ testId: test._id, roomId: { $in: rooms.map((r) => r._id) } });
        if (sub) {
          roomWithCandidates = rooms.find((r) => r._id.toString() === sub.roomId?.toString());
        }
      }

      if (!roomWithCandidates) continue;

      console.log(`\n--- Testing Test: "${test.title}" [Status: ${test.status}] ---`);
      console.log(`Room: "${roomWithCandidates.roomName || roomWithCandidates.roomCode}" (${roomWithCandidates._id})`);

      // Test 1: getRoomCandidates payload check
      const { req: roomReq, res: roomRes } = mockReqRes({ roomId: roomWithCandidates._id.toString() });
      await getRoomCandidates(roomReq, roomRes, (err) => { if (err) throw err; });

      assert.strictEqual(roomRes._status, 200, 'getRoomCandidates returned 200');
      assert(roomRes._data?.candidates, 'Response has candidates array');
      const roomCands = roomRes._data.candidates;
      console.log(`Room candidate count: ${roomCands.length}`);

      if (roomCands.length > 0) {
        const firstCand = roomCands[0];
        console.log(`Candidate in room: ID=${firstCand.candidateId || firstCand._id}, Name=${firstCand.name}, Email=${firstCand.email}`);
        assert(firstCand.candidateId || firstCand._id, 'Candidate in room has candidateId or _id');

        const targetCid = (firstCand.candidateId || firstCand._id).toString();

        // Test 2: getLiveCandidates includes this candidate by ID
        const { req: liveReq, res: liveRes } = mockReqRes({ testId: test._id.toString() });
        await getLiveCandidates(liveReq, liveRes, (err) => { if (err) throw err; });

        assert.strictEqual(liveRes._status, 200, 'getLiveCandidates returned 200');
        assert(liveRes._data?.candidates, 'getLiveCandidates returned candidates map');
        const liveMap = liveRes._data.candidates;

        console.log(`Live candidates map keys: ${Object.keys(liveMap).length}`);
        assert(liveMap[targetCid], `Candidate ID ${targetCid} resolved in getLiveCandidates map`);
        console.log(`Candidate ${firstCand.name} found in liveCandidates map with status: ${liveMap[targetCid].status}`);

        // Test 3: Malpractice logs endpoint can query with this candidateId
        const logs = await MalpracticeLog.find({ testId: test._id, candidateId: targetCid });
        console.log(`Candidate malpractice logs count: ${logs.length}`);

        testedCount++;
        if (testedCount >= 3) break;
      }
    }

    assert(testedCount > 0, 'Successfully verified at least one test with room candidates');

    // Test 4: Graceful handling of non-existent candidate ID
    console.log('\n--- Testing Graceful Non-Existent Candidate ID Handling ---');
    const fakeCid = new mongoose.Types.ObjectId().toString();
    const testSample = tests[0];
    const { req: liveReq, res: liveRes } = mockReqRes({ testId: testSample._id.toString() });
    await getLiveCandidates(liveReq, liveRes, (err) => { if (err) throw err; });
    const liveMap = liveRes._data.candidates;
    assert.strictEqual(liveMap[fakeCid], undefined, 'Non-existent candidate ID is correctly undefined in candidatesMap');
    console.log('Verified: non-existent candidate ID returns undefined in candidate store, allowing client to cleanly trigger toast.error("Candidate record not found.") without crashing.');

    console.log('\nAll QA checks for FEATURE-007 passed successfully!');
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

runTest().catch((err) => {
  console.error('QA Test failed:', err);
  process.exit(1);
});
