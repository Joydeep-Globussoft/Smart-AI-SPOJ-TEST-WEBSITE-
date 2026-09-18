const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config();

const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Candidate = require('../../models/Candidate');
const Question = require('../../models/Question');
const QuestionSet = require('../../models/QuestionSet');
const Folder = require('../../models/Folder');
const Submission = require('../../models/Submission');
const { createRoom, resolveInviteToken, getRooms } = require('../../controllers/roomController');
const { joinRoom } = require('../../controllers/submissionController');

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: FEATURE-015 ("Copy Full Invite" Opaque Deep-Link)');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  const createdCandidateIds = [];
  const createdTestIds = [];
  const createdRoomIds = [];
  const createdFolderIds = [];
  const createdQuestionSetIds = [];
  const createdQuestionIds = [];

  try {
    // ── STEP 1: Fixtures Setup ──
    const folder = await Folder.create({
      name: 'DeepLink Test Folder',
      testType: 'JAVASCRIPT',
      createdBy: new mongoose.Types.ObjectId(),
    });
    createdFolderIds.push(folder._id);

    const qSet = await QuestionSet.create({
      name: 'DeepLink Question Set',
      testType: 'JAVASCRIPT',
      folderId: folder._id,
      createdBy: new mongoose.Types.ObjectId(),
    });
    createdQuestionSetIds.push(qSet._id);

    const question = await Question.create({
      questionSetId: qSet._id,
      testType: 'JAVASCRIPT',
      title: 'DeepLink JS Question',
      description: 'Solve this function',
      inputFormat: 'input',
      outputFormat: 'output',
      visibleTestCases: [{ input: '1', expectedOutput: '1' }],
      hiddenTestCases: [{ input: '2', expectedOutput: '2' }],
      points: 10,
    });
    createdQuestionIds.push(question._id);

    await QuestionSet.findByIdAndUpdate(qSet._id, { questionIds: [question._id] });

    const liveTest = await Test.create({
      title: 'Full Stack Engineering Assessment',
      testType: 'JAVASCRIPT',
      status: 'LIVE',
      durationMinutes: 60,
      passingCriteria: 3,
      instructions: 'Please follow test guidelines carefully.',
      startTestWindowMinutes: 10,
      questionSetId: qSet._id,
      createdBy: new mongoose.Types.ObjectId(),
    });
    createdTestIds.push(liveTest._id);

    // ── TEST 1: Room Creation with Cryptographically Random Opaque inviteToken ──
    let createdRoomObj = null;
    const reqCreate = {
      params: { testId: liveTest._id.toString() },
      body: { roomName: 'Alpha Lab Room' },
      app: { get: () => null },
    };
    const resCreate = {
      status: function (code) { this.statusCode = code; return this; },
      json: function (payload) { createdRoomObj = payload.room; return this; },
    };

    await createRoom(reqCreate, resCreate, (e) => { if (e) throw e; });

    assert(createdRoomObj !== null, 'Room successfully created');
    assert(Boolean(createdRoomObj.inviteToken), `Room has inviteToken generated: ${createdRoomObj.inviteToken}`);
    assert(createdRoomObj.inviteToken.length === 32, 'inviteToken is 32-character hexadecimal string');
    createdRoomIds.push(createdRoomObj._id);

    // ── TEST 2: Security & Non-Reversibility Verification ──
    const token = createdRoomObj.inviteToken;
    const pwd = createdRoomObj.roomPassword;
    const code = createdRoomObj.roomCode;

    assert(!token.includes(pwd), 'Token does not contain roomPassword in plain text');
    assert(!token.includes(code), 'Token does not contain roomCode in plain text');
    assert(!pwd.includes(token), 'Password does not contain token');

    // Attempt common decodings (Base64, hex-to-ascii) to verify no embedded password payload
    let decodedHex = '';
    try {
      decodedHex = Buffer.from(token, 'hex').toString('utf8');
    } catch (_) {}
    assert(!decodedHex.includes(pwd) && !decodedHex.includes(code), 'Hex decoding of inviteToken does not reveal password or room code');

    // ── TEST 3: Public Invite Token Resolution (GET /rooms/invite/:inviteToken) ──
    let inviteInfoPayload = null;
    let inviteStatusCode = 200;
    const reqResolve = { params: { inviteToken: token } };
    const resResolve = {
      status: function (c) { inviteStatusCode = c; return this; },
      json: function (p) { inviteInfoPayload = p; return this; },
    };

    await resolveInviteToken(reqResolve, resResolve, (e) => { if (e) throw e; });

    assert(inviteStatusCode === 200, 'Public resolveInviteToken returns 200 OK');
    assert(inviteInfoPayload.valid === true, 'Invite info reports valid: true');
    assert(inviteInfoPayload.roomName === 'Alpha Lab Room', 'Invite info correctly returns roomName');
    assert(inviteInfoPayload.testTitle === 'Full Stack Engineering Assessment', 'Invite info correctly returns testTitle');
    assert(inviteInfoPayload.isLive === true, 'Invite info reports isLive: true');
    assert(inviteInfoPayload.roomPassword === undefined, 'Security: Public resolveInviteToken NEVER returns roomPassword');
    assert(inviteInfoPayload.roomCode === undefined, 'Security: Public resolveInviteToken NEVER returns raw roomCode');

    // ── TEST 4: Direct Candidate Join via Opaque Token ({ inviteToken }) ──
    const candidateA = await Candidate.create({
      name: 'Alice Deeplink Candidate',
      email: `alice_${Date.now()}@example.com`,
      passwordHash: 'hash_alice_123',
      role: 'candidate',
    });
    createdCandidateIds.push(candidateA._id);

    let joinPayloadA = null;
    let joinStatusA = 200;
    const reqJoinA = {
      user: { id: candidateA._id.toString() },
      body: { inviteToken: token },
    };
    const resJoinA = {
      status: function (c) { joinStatusA = c; return this; },
      json: function (p) { joinPayloadA = p; return this; },
    };

    await joinRoom(reqJoinA, resJoinA, (e) => { if (e) throw e; });

    assert(joinStatusA === 200, 'Authenticated candidate successfully joins room via { inviteToken }');
    assert(joinPayloadA.test !== undefined, 'Join response contains test payload');
    assert(joinPayloadA.room !== undefined, 'Join response contains room payload');
    assert(joinPayloadA.room.roomName === 'Alpha Lab Room', 'Join payload confirms correct room');

    // ── TEST 5: Manual Entry Fallback ({ roomCode, roomPassword }) Non-Regression ──
    const candidateB = await Candidate.create({
      name: 'Bob Manual Candidate',
      email: `bob_${Date.now()}@example.com`,
      passwordHash: 'hash_bob_123',
      role: 'candidate',
    });
    createdCandidateIds.push(candidateB._id);

    let joinPayloadB = null;
    let joinStatusB = 200;
    const reqJoinB = {
      user: { id: candidateB._id.toString() },
      body: { roomCode: createdRoomObj.roomCode, roomPassword: createdRoomObj.roomPassword },
    };
    const resJoinB = {
      status: function (c) { joinStatusB = c; return this; },
      json: function (p) { joinPayloadB = p; return this; },
    };

    await joinRoom(reqJoinB, resJoinB, (e) => { if (e) throw e; });

    assert(joinStatusB === 200, 'Standard manual entry ({ roomCode, roomPassword }) succeeds without regression');
    assert(joinPayloadB.room.roomName === 'Alpha Lab Room', 'Manual join connects to the correct room');

    // ── TEST 6: Expiry & Access Window Parity with Opaque Token ──
    const expiredRoom = await Room.create({
      testId: liveTest._id,
      roomName: 'Expired Room',
      roomCode: 'EXP' + Math.floor(1000 + Math.random() * 9000),
      roomPassword: 'EXP_PASSWORD',
      inviteToken: crypto.randomBytes(16).toString('hex'),
      passwordValidUntil: new Date(Date.now() - 60000), // Expired 1 min ago
      status: 'ACTIVE',
    });
    createdRoomIds.push(expiredRoom._id);

    const candidateC = await Candidate.create({
      name: 'Charlie Expired Candidate',
      email: `charlie_${Date.now()}@example.com`,
      passwordHash: 'hash_charlie_123',
      role: 'candidate',
    });
    createdCandidateIds.push(candidateC._id);

    let expiredJoinStatus = 200;
    let expiredJoinPayload = null;
    const reqJoinExpired = {
      user: { id: candidateC._id.toString() },
      body: { inviteToken: expiredRoom.inviteToken },
    };
    const resJoinExpired = {
      status: function (c) { expiredJoinStatus = c; return this; },
      json: function (p) { expiredJoinPayload = p; return this; },
    };

    await joinRoom(reqJoinExpired, resJoinExpired, (e) => { if (e) throw e; });

    assert(expiredJoinStatus === 403, 'Expired room returns 403 Forbidden when joining via invite token');
    assert(expiredJoinPayload.error === 'Room code expired', 'Expired error message matches manual entry behavior');
    assert(expiredJoinPayload.roomId.toString() === expiredRoom._id.toString(), 'Expired response includes roomId for late-join notification');

    // ── TEST 7: Invalid/Unknown Invite Token Handling ──
    let invalidTokenStatus = 200;
    let invalidTokenPayload = null;
    const reqJoinInvalid = {
      user: { id: candidateC._id.toString() },
      body: { inviteToken: 'non_existent_token_1234567890abcdef' },
    };
    const resJoinInvalid = {
      status: function (c) { invalidTokenStatus = c; return this; },
      json: function (p) { invalidTokenPayload = p; return this; },
    };

    await joinRoom(reqJoinInvalid, resJoinInvalid, (e) => { if (e) throw e; });

    assert(invalidTokenStatus === 404, 'Non-existent inviteToken returns 404 Not Found');

    // ── TEST 8: Lazy Migration of Existing Rooms in getRooms ──
    const legacyRoom = await Room.create({
      testId: liveTest._id,
      roomName: 'Legacy Room Without Token',
      roomCode: 'LEG' + Math.floor(1000 + Math.random() * 9000),
      roomPassword: 'LEG_PASSWORD',
      inviteToken: undefined,
      status: 'ACTIVE',
    });
    createdRoomIds.push(legacyRoom._id);

    let getRoomsPayload = null;
    const reqGetRooms = { params: { testId: liveTest._id.toString() } };
    const resGetRooms = {
      json: function (p) { getRoomsPayload = p; return this; },
    };

    await getRooms(reqGetRooms, resGetRooms, (e) => { if (e) throw e; });

    const updatedLegacy = await Room.findById(legacyRoom._id);
    assert(Boolean(updatedLegacy.inviteToken), 'getRooms lazily populates inviteToken for legacy rooms');
    assert(updatedLegacy.inviteToken.length === 32, 'Lazily populated token is valid 32-char hex string');

  } catch (err) {
    console.error('Test suite error:', err);
    process.exitCode = 1;
  } finally {
    // Cleanup
    if (createdCandidateIds.length > 0) {
      await Candidate.deleteMany({ _id: { $in: createdCandidateIds } });
    }
    if (createdRoomIds.length > 0) {
      await Room.deleteMany({ _id: { $in: createdRoomIds } });
    }
    if (createdTestIds.length > 0) {
      await Test.deleteMany({ _id: { $in: createdTestIds } });
    }
    if (createdQuestionIds.length > 0) {
      await Question.deleteMany({ _id: { $in: createdQuestionIds } });
    }
    if (createdQuestionSetIds.length > 0) {
      await QuestionSet.deleteMany({ _id: { $in: createdQuestionSetIds } });
    }
    if (createdFolderIds.length > 0) {
      await Folder.deleteMany({ _id: { $in: createdFolderIds } });
    }

    await mongoose.disconnect();
    console.log('\n------------------------------------------------------------------------');
    console.log(`FEATURE-015 TEST SUMMARY: ${passedTests}/${totalTests} tests passed.`);
    console.log('------------------------------------------------------------------------\n');
  }
}

runTests();
