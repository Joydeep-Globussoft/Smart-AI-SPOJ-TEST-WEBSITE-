/**
 * QA Automated Verification Suite: BUG-82
 * Invite-link & Manual "Notify Admin" (Expired Room Window) Auto-Advance on Approval
 *
 * Verifies:
 * 1. Static code & contract audits (roomController, submissionController, CandidateJoinRoom)
 * 2. Expired window rejection on join attempt (both inviteToken and manual join)
 * 3. Candidate request late join rate-limiting & admin notification
 * 4. Admin dismissal resets candidate state and emits candidate:lateJoinDismissed
 * 5. Candidate re-request after dismissal
 * 6. Admin approval sets manualJoinOverride & emits candidate:lateJoinApproved (with inviteToken & roomId)
 * 7. Candidate 1 auto-join via inviteToken succeeds and receives Question Set 1
 * 8. Candidate 2 auto-join via roomId succeeds and receives Question Set 2 (FEATURE-012 round-robin)
 * 9. Candidate 1 reconnect preserves Question Set 1 (BUG-53)
 * 10. Candidate 3 on-mount reload race recovery via getLateJoinStatus + auto-join
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const crypto = require('crypto');

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

// Ensure clean environment
process.env.NODE_ENV = 'test';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/spoj_test_platform_test';

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: BUG-82 (Notify Admin Auto-Advance on Approval)');
  console.log('========================================================================\n');

  // --- PART 1: Static Architecture & File Verification ---
  console.log('--- Part 1: Static Architecture & Source Audits ---');

  const roomControllerPath = path.resolve(__dirname, '../../controllers/roomController.js');
  const submissionControllerPath = path.resolve(__dirname, '../../controllers/submissionController.js');
  const candidateJoinRoomPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateJoinRoom.jsx');

  const roomControllerSrc = fs.readFileSync(roomControllerPath, 'utf8');
  const submissionControllerSrc = fs.readFileSync(submissionControllerPath, 'utf8');
  const candidateJoinRoomSrc = fs.readFileSync(candidateJoinRoomPath, 'utf8');

  // 1. roomController audits
  assert(
    roomControllerSrc.includes("io.to(`candidate:${candidateId}`).emit('candidate:lateJoinApproved'") &&
    roomControllerSrc.includes('inviteToken: room.inviteToken'),
    'roomController: allowLateJoin emits candidate:lateJoinApproved containing inviteToken to candidate socket room'
  );

  assert(
    roomControllerSrc.includes("io.to(`candidate:${candidateId}`).emit('candidate:lateJoinDismissed'"),
    'roomController: dismissLateJoin emits candidate:lateJoinDismissed to candidate socket room'
  );

  // 2. submissionController audits
  assert(
    submissionControllerSrc.includes('const { roomCode, roomPassword, inviteToken, roomId } = req.body') &&
    submissionControllerSrc.includes('else if (roomId)'),
    'submissionController: joinRoom accepts and processes roomId payload'
  );

  assert(
    submissionControllerSrc.includes('isCandidateOverridden') &&
    submissionControllerSrc.includes('manualJoinOverride === true'),
    'submissionController: joinRoom authorizes roomId joins when candidate has manualJoinOverride'
  );

  assert(
    submissionControllerSrc.includes('candidate.manualJoinOverride = false'),
    'submissionController: joinRoom automatically clears manualJoinOverride upon successful join'
  );

  // 3. CandidateJoinRoom audits
  assert(
    candidateJoinRoomSrc.includes('performAutoJoin') &&
    candidateJoinRoomSrc.includes("navigate('/candidate/instructions', { replace: true })"),
    'CandidateJoinRoom: implements performAutoJoin and routes to /candidate/instructions'
  );

  assert(
    candidateJoinRoomSrc.includes('onLateJoinApproved') &&
    candidateJoinRoomSrc.includes('performAutoJoin(data)'),
    'CandidateJoinRoom: listens for onLateJoinApproved and automatically executes auto-join without manual click'
  );

  assert(
    candidateJoinRoomSrc.includes('onLateJoinDismissed') &&
    candidateJoinRoomSrc.includes('setIsLateJoinRequested(false)'),
    'CandidateJoinRoom: listens for onLateJoinDismissed and cleanly resets request state'
  );

  assert(
    candidateJoinRoomSrc.includes('getLateJoinStatus') &&
    candidateJoinRoomSrc.includes('data.manualJoinOverride'),
    'CandidateJoinRoom: on-mount getLateJoinStatus recovers approved state after reload and triggers performAutoJoin'
  );

  assert(
    candidateJoinRoomSrc.includes('isAutoJoining ?') &&
    candidateJoinRoomSrc.includes('manualOverrideGranted ?') &&
    candidateJoinRoomSrc.includes('isLateJoinRequested ?'),
    'CandidateJoinRoom: manages mutually exclusive alert states and handles loading banner during auto-join'
  );

  // --- PART 2: Database & Controller Integration Tests ---
  console.log('\n--- Part 2: Dynamic Controller & Model Integration Tests ---');

  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB test database.');

    const Admin = require('../../models/Admin');
    const Test = require('../../models/Test');
    const Room = require('../../models/Room');
    const Candidate = require('../../models/Candidate');
    const Folder = require('../../models/Folder');
    const QuestionSet = require('../../models/QuestionSet');
    const Question = require('../../models/Question');
    const { lateJoinRequest, allowLateJoin, dismissLateJoin, getLateJoinStatus } = require('../../controllers/roomController');
    const { joinRoom } = require('../../controllers/submissionController');

    // Clean test artifacts
    await Admin.deleteMany({ email: { $regex: /@bug82test\.com$/ } });
    await Candidate.deleteMany({ email: { $regex: /@bug82test\.com$/ } });
    await Folder.deleteMany({ name: { $regex: /BUG-82/ } });
    await Test.deleteMany({ title: { $regex: /BUG-82/ } });
    await Room.deleteMany({ roomName: { $regex: /BUG-82/ } });
    await QuestionSet.deleteMany({ name: { $regex: /BUG-82/ } });
    await Question.deleteMany({ title: { $regex: /BUG-82/ } });

    // Mock socket io collector
    const emittedEvents = [];
    const mockIo = {
      to: (roomName) => ({
        emit: (event, payload) => {
          emittedEvents.push({ room: roomName, event, payload });
        },
      }),
    };

    const mockApp = {
      get: (key) => (key === 'io' ? mockIo : null),
    };

    // Helper for req/res simulation
    const runController = async (controllerFn, req) => {
      let resStatus = 200;
      let resData = null;
      req.app = mockApp;
      const res = {
        status: (code) => {
          resStatus = code;
          return res;
        },
        json: (data) => {
          resData = data;
          return res;
        },
      };
      await controllerFn(req, res, (err) => {
        if (err) throw err;
      });
      return { status: resStatus, data: resData };
    };

    // 1. Create Admin
    const testAdmin = await Admin.create({
      name: 'BUG82 Admin',
      email: 'admin@bug82test.com',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
      role: 'ADMIN',
    });

    // 2. Create Folder with 2 QuestionSets (FEATURE-012 / FEATURE-013 Pool)
    const testFolder = await Folder.create({
      name: 'BUG-82 Folder',
      testType: 'SPOJ',
      description: 'Folder for BUG-82 test',
      createdBy: testAdmin._id,
    });

    const set1 = await QuestionSet.create({
      name: 'BUG-82 Question Set Alpha',
      folderId: testFolder._id,
      testType: 'SPOJ',
      createdBy: testAdmin._id,
      questionIds: [],
    });

    const set2 = await QuestionSet.create({
      name: 'BUG-82 Question Set Beta',
      folderId: testFolder._id,
      testType: 'SPOJ',
      createdBy: testAdmin._id,
      questionIds: [],
    });

    const q1 = await Question.create({
      questionSetId: set1._id,
      testType: 'SPOJ',
      title: 'BUG-82 Question 1',
      description: 'Test Q1',
      points: 10,
    });
    const q2 = await Question.create({
      questionSetId: set2._id,
      testType: 'SPOJ',
      title: 'BUG-82 Question 2',
      description: 'Test Q2',
      points: 10,
    });

    set1.questionIds = [q1._id];
    await set1.save();
    set2.questionIds = [q2._id];
    await set2.save();

    const liveTest = await Test.create({
      title: 'BUG-82 Live Test with Pool',
      testType: 'SPOJ',
      description: 'Test suite for expired window late join auto-advance',
      createdBy: testAdmin._id,
      status: 'LIVE',
      folderId: testFolder._id,
      durationMinutes: 60,
      totalQuestions: 1,
      passingCriteria: 1,
      instructions: 'Please follow test rules',
    });

    // 3. Create Room with Expired passwordValidUntil
    const expiredUntil = new Date(Date.now() - 3600 * 1000); // 1 hour ago
    const expiredRoom = await Room.create({
      testId: liveTest._id,
      roomName: 'BUG-82 Expired Room',
      roomCode: 'EXP82X',
      roomPassword: 'PASSWORD82',
      passwordValidUntil: expiredUntil,
      inviteToken: crypto.randomBytes(16).toString('hex'),
      status: 'ACTIVE',
    });

    // 4. Create Candidates
    const cand1 = await Candidate.create({
      name: 'Candidate One',
      email: 'cand1@bug82test.com',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
    });

    const cand2 = await Candidate.create({
      name: 'Candidate Two',
      email: 'cand2@bug82test.com',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
    });

    const cand3 = await Candidate.create({
      name: 'Candidate Three',
      email: 'cand3@bug82test.com',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
    });

    // --- TEST STEP 1: Candidate 1 Join with expired inviteToken -> Expect 403 ---
    const step1Req = {
      user: { id: cand1._id.toString() },
      body: { inviteToken: expiredRoom.inviteToken },
    };
    const step1Res = await runController(joinRoom, step1Req);
    assert(step1Res.status === 403, 'Step 1: Joining expired room via inviteToken returns 403');
    assert(step1Res.data.error === 'Room code expired', 'Step 1: 403 error is "Room code expired"');
    assert(step1Res.data.roomId.toString() === expiredRoom._id.toString(), 'Step 1: 403 response includes roomId');

    // --- TEST STEP 2: Candidate 1 requests late join ---
    const step2Req = {
      params: { roomId: expiredRoom._id.toString(), candidateId: cand1._id.toString() },
    };
    const step2Res = await runController(lateJoinRequest, step2Req);
    assert(step2Res.status === 200, 'Step 2: Candidate 1 lateJoinRequest returns 200');

    const updatedCand1 = await Candidate.findById(cand1._id);
    assert(Boolean(updatedCand1.lateJoinRequestedAt), 'Step 2: Candidate DB record has lateJoinRequestedAt populated');
    assert(
      updatedCand1.lateJoinRoomId.toString() === expiredRoom._id.toString(),
      'Step 2: Candidate DB record has lateJoinRoomId populated'
    );

    // Verify rate limit (409 Conflict)
    const step2DupRes = await runController(lateJoinRequest, step2Req);
    assert(step2DupRes.status === 409, 'Step 2: Duplicate late-join request returns 409 Conflict');

    // --- TEST STEP 3: Admin Dismisses Late Join ---
    const step3Req = {
      params: { roomId: expiredRoom._id.toString(), candidateId: cand1._id.toString() },
    };
    emittedEvents.length = 0;
    const step3Res = await runController(dismissLateJoin, step3Req);
    assert(step3Res.status === 200, 'Step 3: dismissLateJoin returns 200');

    const dismissedCand1 = await Candidate.findById(cand1._id);
    assert(dismissedCand1.lateJoinRequestedAt === null, 'Step 3: lateJoinRequestedAt is cleared on dismiss');
    assert(dismissedCand1.lateJoinRoomId === null, 'Step 3: lateJoinRoomId is cleared on dismiss');
    assert(dismissedCand1.manualJoinOverride === false, 'Step 3: manualJoinOverride is false');

    const dismissedEvent = emittedEvents.find(
      (e) => e.room === `candidate:${cand1._id.toString()}` && e.event === 'candidate:lateJoinDismissed'
    );
    assert(Boolean(dismissedEvent), 'Step 3: candidate:lateJoinDismissed emitted directly to candidate personal socket');

    // --- TEST STEP 4: Candidate 1 re-requests late join ---
    const step4Res = await runController(lateJoinRequest, step2Req);
    assert(step4Res.status === 200, 'Step 4: Candidate 1 re-requests late join after dismiss and succeeds');

    // --- TEST STEP 5: Admin Approves Late Join ---
    emittedEvents.length = 0;
    const step5Req = {
      params: { roomId: expiredRoom._id.toString(), candidateId: cand1._id.toString() },
    };
    const step5Res = await runController(allowLateJoin, step5Req);
    assert(step5Res.status === 200, 'Step 5: allowLateJoin returns 200');

    const approvedCand1 = await Candidate.findById(cand1._id);
    assert(approvedCand1.manualJoinOverride === true, 'Step 5: manualJoinOverride is set to true on approval');

    const approvedEvent = emittedEvents.find(
      (e) => e.room === `candidate:${cand1._id.toString()}` && e.event === 'candidate:lateJoinApproved'
    );
    assert(Boolean(approvedEvent), 'Step 5: candidate:lateJoinApproved emitted directly to candidate socket room');
    assert(
      approvedEvent.payload.inviteToken === expiredRoom.inviteToken,
      'Step 5: candidate:lateJoinApproved payload carries room inviteToken'
    );
    assert(
      approvedEvent.payload.roomId === expiredRoom._id.toString(),
      'Step 5: candidate:lateJoinApproved payload carries roomId'
    );

    // --- TEST STEP 6: Candidate 1 Auto-Join via inviteToken ---
    const step6Req = {
      user: { id: cand1._id.toString() },
      body: { inviteToken: approvedEvent.payload.inviteToken },
    };
    const step6Res = await runController(joinRoom, step6Req);
    assert(step6Res.status === 200, 'Step 6: Candidate 1 auto-joins expired room via inviteToken with manualJoinOverride');

    const reloadedCand1 = await Candidate.findById(cand1._id);
    assert(
      reloadedCand1.manualJoinOverride === false,
      'Step 6: manualJoinOverride is cleanly consumed & reset to false upon successful join'
    );

    const reloadedRoom = await Room.findById(expiredRoom._id);
    const cand1JoinedEntry = reloadedRoom.joinedCandidates.find(
      (j) => j.candidateId.toString() === cand1._id.toString()
    );
    assert(Boolean(cand1JoinedEntry), 'Step 6: Candidate 1 added to room.joinedCandidates');
    assert(cand1JoinedEntry.joinIndex === 1, 'Step 6: Candidate 1 assigned joinIndex 1');
    assert(
      cand1JoinedEntry.assignedQuestionSetId.toString() === set1._id.toString(),
      'Step 6: Candidate 1 assigned Question Set Alpha (Set 1)'
    );

    // --- TEST STEP 7: Candidate 2 Expired Manual Join + Approval + Auto-Join via roomId (FEATURE-012 Round-Robin) ---
    // Cand 2 manual attempt -> 403
    const cand2AttemptReq = {
      user: { id: cand2._id.toString() },
      body: { roomCode: expiredRoom.roomCode, roomPassword: expiredRoom.roomPassword },
    };
    const cand2AttemptRes = await runController(joinRoom, cand2AttemptReq);
    assert(cand2AttemptRes.status === 403, 'Step 7: Candidate 2 manual entry on expired room returns 403');

    // Cand 2 notify admin
    await runController(lateJoinRequest, {
      params: { roomId: expiredRoom._id.toString(), candidateId: cand2._id.toString() },
    });

    // Admin approves Cand 2
    await runController(allowLateJoin, {
      params: { roomId: expiredRoom._id.toString(), candidateId: cand2._id.toString() },
    });

    // Cand 2 auto-joins via roomId
    const cand2AutoJoinReq = {
      user: { id: cand2._id.toString() },
      body: { roomId: expiredRoom._id.toString() },
    };
    const cand2AutoJoinRes = await runController(joinRoom, cand2AutoJoinReq);
    assert(cand2AutoJoinRes.status === 200, 'Step 7: Candidate 2 auto-joins expired room via roomId');

    const roomAfterCand2 = await Room.findById(expiredRoom._id);
    const cand2JoinedEntry = roomAfterCand2.joinedCandidates.find(
      (j) => j.candidateId.toString() === cand2._id.toString()
    );
    assert(cand2JoinedEntry.joinIndex === 2, 'Step 7: Candidate 2 assigned joinIndex 2');
    assert(
      cand2JoinedEntry.assignedQuestionSetId.toString() === set2._id.toString(),
      'Step 7: FEATURE-012: Candidate 2 rotates to Question Set Beta (Set 2)'
    );

    // --- TEST STEP 8: Candidate 1 Reconnect / Resume Preservation (BUG-53) ---
    const cand1ReconnectReq = {
      user: { id: cand1._id.toString() },
      body: { inviteToken: expiredRoom.inviteToken },
    };
    const cand1ReconnectRes = await runController(joinRoom, cand1ReconnectReq);
    assert(cand1ReconnectRes.status === 200, 'Step 8: Candidate 1 reconnect returns 200 OK');

    const roomAfterReconnect = await Room.findById(expiredRoom._id);
    const cand1ReconnectEntry = roomAfterReconnect.joinedCandidates.find(
      (j) => j.candidateId.toString() === cand1._id.toString()
    );
    assert(
      cand1ReconnectEntry.assignedQuestionSetId.toString() === set1._id.toString(),
      'Step 8: BUG-53: Candidate 1 preserves original assigned Question Set Alpha on reconnect'
    );

    // --- TEST STEP 9: Reload Race Condition Recovery (getLateJoinStatus on mount) ---
    // Candidate 3 has manualJoinOverride = true already in DB
    cand3.manualJoinOverride = true;
    cand3.lateJoinRoomId = expiredRoom._id;
    await cand3.save();

    const statusReq = {
      params: { candidateId: cand3._id.toString() },
      user: { id: cand3._id.toString() },
    };
    const statusRes = await runController(getLateJoinStatus, statusReq);
    assert(statusRes.status === 200, 'Step 9: getLateJoinStatus returns 200');
    assert(statusRes.data.manualJoinOverride === true, 'Step 9: getLateJoinStatus returns manualJoinOverride: true');
    assert(
      statusRes.data.lateJoinRoomId.toString() === expiredRoom._id.toString(),
      'Step 9: getLateJoinStatus returns lateJoinRoomId'
    );

    // Client mount logic then invokes joinRoom with { roomId }
    const cand3MountJoinReq = {
      user: { id: cand3._id.toString() },
      body: { roomId: statusRes.data.lateJoinRoomId.toString() },
    };
    const cand3MountJoinRes = await runController(joinRoom, cand3MountJoinReq);
    assert(cand3MountJoinRes.status === 200, 'Step 9: Candidate 3 recovers after reload and joins room successfully');

    const roomAfterCand3 = await Room.findById(expiredRoom._id);
    const cand3JoinedEntry = roomAfterCand3.joinedCandidates.find(
      (j) => j.candidateId.toString() === cand3._id.toString()
    );
    assert(cand3JoinedEntry.joinIndex === 3, 'Step 9: Candidate 3 assigned joinIndex 3');
    assert(
      cand3JoinedEntry.assignedQuestionSetId.toString() === set1._id.toString(),
      'Step 9: FEATURE-012: Candidate 3 wraps around to Question Set Alpha (Set 1)'
    );

    // Clean up test data
    await Admin.deleteMany({ email: { $regex: /@bug82test\.com$/ } });
    await Candidate.deleteMany({ email: { $regex: /@bug82test\.com$/ } });
    await Test.deleteMany({ title: { $regex: /BUG-82/ } });
    await Room.deleteMany({ roomName: { $regex: /BUG-82/ } });
    await QuestionSet.deleteMany({ title: { $regex: /BUG-82/ } });
    await Question.deleteMany({ title: { $regex: /BUG-82/ } });

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  } catch (err) {
    console.error('[ERROR during dynamic test run]:', err);
    process.exitCode = 1;
  }

  console.log('\n------------------------------------------------------------------------');
  console.log(`BUG-82 TEST SUMMARY: ${passedTests}/${totalTests} checks passed.`);
  console.log('------------------------------------------------------------------------\n');
}

runTests();
