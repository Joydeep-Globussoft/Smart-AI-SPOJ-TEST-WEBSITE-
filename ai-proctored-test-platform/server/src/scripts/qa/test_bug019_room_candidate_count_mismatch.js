/**
 * test_bug019_room_candidate_count_mismatch.js
 * 
 * Comprehensive QA Test Suite for BUG-019:
 * - Verifies room card candidate count matches candidate modal count exactly.
 * - Verifies submittedCount counts distinct candidates rather than raw submission documents (e.g. 5 questions = 1 submitted candidate).
 * - Verifies duplicate joinedCandidates entries or reconnects do not inflate candidate counts.
 * - Verifies rooms with unstarted candidates show correct NOT_STARTED status and distinct candidate count.
 * - Verifies empty rooms show 0 candidates and 0 submitted.
 * - Verifies test-level and room-level isolation.
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000/api/v1';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || 'dev_jwt_access_secret_globussoft_2026';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_proctored_test_platform';

const Admin = require('../../models/Admin');
const Candidate = require('../../models/Candidate');
const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Question = require('../../models/Question');
const QuestionSet = require('../../models/QuestionSet');
const Folder = require('../../models/Folder');
const Submission = require('../../models/Submission');
const MalpracticeLog = require('../../models/MalpracticeLog');

async function runBug019Tests() {
  console.log('===============================================================');
  console.log('   QA Test Suite: BUG-019 Physical Room Candidate Count Mismatch');
  console.log('===============================================================\n');

  await mongoose.connect(MONGODB_URI);

  try {
    // 0. Setup Admin Token
    let admin = await Admin.findOne({ email: 'superadmin@globussoft.in' });
    if (!admin) {
      admin = await Admin.create({
        name: 'Super Admin',
        email: 'superadmin@globussoft.in',
        passwordHash: '$2a$10$dummyhashedpasswordfortesting1234567890123456',
        role: 'SUPER_ADMIN',
      });
    }
    const adminToken = jwt.sign({ id: admin._id, type: 'admin', role: admin.role }, JWT_SECRET, { expiresIn: '2h' });
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    };

    // 1. Setup Folder, Test & QuestionSet with 5 questions
    const folder = await Folder.create({
      name: `QA Folder BUG-019 ${Date.now()}`,
      testType: 'SPOJ',
      createdBy: admin._id,
    });

    const qSet = await QuestionSet.create({
      name: `QA BUG-019 Question Set ${Date.now()}`,
      testType: 'SPOJ',
      folderId: folder._id,
      createdBy: admin._id,
      totalMarks: 100,
      passingMarks: 40,
    });

    const questions = [];
    for (let i = 1; i <= 5; i++) {
      const q = await Question.create({
        questionSetId: qSet._id,
        testType: 'SPOJ',
        title: `BUG-019 Question ${i}`,
        description: `Description for question ${i}`,
        difficulty: 'EASY',
        inputFormat: 'Input',
        outputFormat: 'Output',
        visibleTestCases: [{ input: '1', expectedOutput: '1' }],
      });
      questions.push(q);
    }

    const test = await Test.create({
      title: `BUG-019 Test Center Run ${Date.now()}`,
      description: 'Verifying room candidate count alignment',
      instructions: 'Follow all proctoring rules.',
      testType: 'SPOJ',
      durationMinutes: 60,
      totalQuestions: 5,
      questionSetId: qSet._id,
      status: 'LIVE',
      startTestWindowMinutes: 30,
      passingCriteria: 50,
      createdBy: admin._id,
    });

    // 2. Setup Rooms
    // Room 1: Sample - 001 (Simulating the exact reported bug: 1 candidate, 5 questions submitted, 15 violations, duplicate joined entries)
    const room1 = await Room.create({
      testId: test._id,
      roomName: 'Sample - 001',
      roomCode: `BUG1_${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      roomPassword: 'PASSWORD1',
      capacity: 5,
      status: 'ACTIVE',
      passwordValidUntil: new Date(Date.now() + 30 * 60 * 1000),
    });

    // Room 2: Sample - 002 (1 candidate joined, not started yet)
    const room2 = await Room.create({
      testId: test._id,
      roomName: 'Sample - 002',
      roomCode: `BUG2_${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      roomPassword: 'PASSWORD2',
      capacity: 10,
      status: 'ACTIVE',
      passwordValidUntil: new Date(Date.now() + 30 * 60 * 1000),
    });

    // Room 3: Sample - 003 (Empty room)
    const room3 = await Room.create({
      testId: test._id,
      roomName: 'Sample - 003',
      roomCode: `BUG3_${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      roomPassword: 'PASSWORD3',
      capacity: 20,
      status: 'ACTIVE',
      passwordValidUntil: new Date(Date.now() + 30 * 60 * 1000),
    });

    // Candidates
    const suresh = await Candidate.create({
      name: 'Suresh',
      email: `suresh_${Date.now()}@testing.com`,
      phone: '9876543210',
    });

    const ramesh = await Candidate.create({
      name: 'Ramesh',
      email: `ramesh_${Date.now()}@testing.com`,
      phone: '9876543211',
    });

    const dinesh = await Candidate.create({
      name: 'Dinesh',
      email: `dinesh_${Date.now()}@testing.com`,
      phone: '9876543212',
    });

    // Simulate Suresh joining Room 1 TWICE (duplicate entry simulation)
    room1.joinedCandidates.push({
      candidateId: suresh._id,
      joinedAt: new Date(Date.now() - 20000),
      assignedQuestionSetId: qSet._id,
      joinIndex: 1,
    });
    room1.joinedCandidates.push({
      candidateId: suresh._id,
      joinedAt: new Date(Date.now() - 10000),
      assignedQuestionSetId: qSet._id,
      joinIndex: 1,
    });
    await room1.save();

    // Simulate Suresh submitting 5 questions in Room 1
    const subNow = new Date();
    for (const q of questions) {
      await Submission.create({
        testId: test._id,
        roomId: room1._id,
        candidateId: suresh._id,
        questionId: q._id,
        assignedQuestionSetId: qSet._id,
        sourceCode: 'print(1)',
        language: 'python',
        status: 'SUBMITTED',
        score: 20,
        submittedAt: subNow,
        candidateStartTime: new Date(Date.now() - 30 * 60 * 1000),
        candidateEndTime: new Date(Date.now() + 30 * 60 * 1000),
      });
    }

    // Simulate 15 Malpractice logs for Suresh in Room 1
    for (let i = 1; i <= 15; i++) {
      await MalpracticeLog.create({
        testId: test._id,
        roomId: room1._id,
        candidateId: suresh._id,
        violationType: 'TAB_SWITCH',
        adminAction: 'NONE',
        detectedAt: new Date(),
      });
    }

    // Simulate Ramesh joining Room 2 (NOT started, 0 submissions)
    room2.joinedCandidates.push({
      candidateId: ramesh._id,
      joinedAt: new Date(),
      assignedQuestionSetId: qSet._id,
      joinIndex: 1,
    });
    await room2.save();

    console.log('--- Test Scenario 1: Room Card vs Modal Alignment for Sample - 001 ---');
    const roomsRes1 = await fetch(`${BASE_URL}/tests/${test._id}/rooms`, { headers: authHeaders });
    assert.strictEqual(roomsRes1.status, 200, 'GET /tests/:testId/rooms should succeed');
    const roomsData1 = await roomsRes1.json();

    const roomCard1 = roomsData1.rooms.find((r) => r._id.toString() === room1._id.toString());
    assert(Boolean(roomCard1), 'Room 1 returned in list');

    console.log(`[Result] Room 1 Card Metrics -> candidateCount: ${roomCard1.candidateCount}, submittedCount: ${roomCard1.submittedCount}, violationCount: ${roomCard1.violationCount}`);
    assert.strictEqual(roomCard1.candidateCount, 1, 'Room 1 candidateCount must be 1 (distinct candidate, not 2 from duplicate join)');
    assert.strictEqual(roomCard1.submittedCount, 1, 'Room 1 submittedCount must be 1 (distinct candidate, not 5 from 5 questions)');
    assert.strictEqual(roomCard1.violationCount, 15, 'Room 1 violationCount must be 15');

    // Check Room 1 Candidate Modal
    const modalRes1 = await fetch(`${BASE_URL}/rooms/${room1._id}/candidates`, { headers: authHeaders });
    assert.strictEqual(modalRes1.status, 200, 'GET /rooms/:roomId/candidates should succeed');
    const modalData1 = await modalRes1.json();

    console.log(`[Result] Room 1 Modal Candidates -> count: ${modalData1.candidates.length}`);
    assert.strictEqual(modalData1.candidates.length, 1, 'Room 1 modal must return exactly 1 candidate');
    assert.strictEqual(modalData1.candidates[0].candidateId.toString(), suresh._id.toString(), 'Candidate in modal is Suresh');
    assert.strictEqual(modalData1.candidates[0].status, 'SUBMITTED', 'Candidate status is SUBMITTED');
    assert.strictEqual(modalData1.candidates[0].malpracticeCount, 15, 'Candidate malpracticeCount is 15');

    // Strict equality check between Room Card and Candidate Modal
    assert.strictEqual(
      roomCard1.candidateCount,
      modalData1.candidates.length,
      'CRITICAL: Room Card candidateCount must exactly match Candidates Modal count'
    );
    console.log('✅ Scenario 1 PASSED: Room Card (1 Candidate, 1 Submitted, 15 Violations) matches Modal (1 Candidate) perfectly!\n');

    console.log('--- Test Scenario 2: Unstarted Candidate in Room 2 (Sample - 002) ---');
    const roomCard2 = roomsData1.rooms.find((r) => r._id.toString() === room2._id.toString());
    assert(Boolean(roomCard2), 'Room 2 returned in list');
    assert.strictEqual(roomCard2.candidateCount, 1, 'Room 2 candidateCount must be 1');
    assert.strictEqual(roomCard2.submittedCount, 0, 'Room 2 submittedCount must be 0 (unstarted)');
    assert.strictEqual(roomCard2.violationCount, 0, 'Room 2 violationCount must be 0');

    const modalRes2 = await fetch(`${BASE_URL}/rooms/${room2._id}/candidates`, { headers: authHeaders });
    const modalData2 = await modalRes2.json();
    assert.strictEqual(modalData2.candidates.length, 1, 'Room 2 modal returns 1 candidate');
    assert.strictEqual(modalData2.candidates[0].name, 'Ramesh', 'Candidate is Ramesh');
    assert.strictEqual(modalData2.candidates[0].status, 'NOT_STARTED', 'Status is NOT_STARTED');
    assert.strictEqual(roomCard2.candidateCount, modalData2.candidates.length, 'Room 2 Card matches Modal');
    console.log('✅ Scenario 2 PASSED: Room 2 shows 1 Candidate, 0 Submitted, NOT_STARTED in modal.\n');

    console.log('--- Test Scenario 3: Empty Room 3 (Sample - 003) ---');
    const roomCard3 = roomsData1.rooms.find((r) => r._id.toString() === room3._id.toString());
    assert(Boolean(roomCard3), 'Room 3 returned in list');
    assert.strictEqual(roomCard3.candidateCount, 0, 'Room 3 candidateCount must be 0');
    assert.strictEqual(roomCard3.submittedCount, 0, 'Room 3 submittedCount must be 0');
    assert.strictEqual(roomCard3.violationCount, 0, 'Room 3 violationCount must be 0');

    const modalRes3 = await fetch(`${BASE_URL}/rooms/${room3._id}/candidates`, { headers: authHeaders });
    const modalData3 = await modalRes3.json();
    assert.strictEqual(modalData3.candidates.length, 0, 'Room 3 modal returns 0 candidates');
    assert.strictEqual(roomCard3.candidateCount, modalData3.candidates.length, 'Room 3 Card matches Modal');
    console.log('✅ Scenario 3 PASSED: Empty room shows 0 Candidates, 0 Submitted, 0 Violations.\n');

    console.log('--- Test Scenario 4: Multi-Candidate Room with Disqualification ---');
    // Add Dinesh to Room 1 and simulate disqualification
    room1.joinedCandidates.push({
      candidateId: dinesh._id,
      joinedAt: new Date(),
      assignedQuestionSetId: qSet._id,
      joinIndex: 2,
    });
    await room1.save();

    // Create disqualified submissions for Dinesh
    for (const q of questions) {
      await Submission.create({
        testId: test._id,
        roomId: room1._id,
        candidateId: dinesh._id,
        questionId: q._id,
        assignedQuestionSetId: qSet._id,
        sourceCode: 'print(2)',
        language: 'python',
        status: 'AUTO_SUBMITTED_DISQUALIFIED',
        score: 0,
        submittedAt: new Date(),
        candidateStartTime: new Date(Date.now() - 10 * 60 * 1000),
      });
    }

    await MalpracticeLog.create({
      testId: test._id,
      roomId: room1._id,
      candidateId: dinesh._id,
      violationType: 'OTHER',
      adminAction: 'DISQUALIFIED',
      detectedAt: new Date(),
    });

    const roomsResMulti = await fetch(`${BASE_URL}/tests/${test._id}/rooms`, { headers: authHeaders });
    const roomsDataMulti = await roomsResMulti.json();
    const room1Multi = roomsDataMulti.rooms.find((r) => r._id.toString() === room1._id.toString());

    console.log(`[Result] Room 1 Multi Metrics -> candidateCount: ${room1Multi.candidateCount}, submittedCount: ${room1Multi.submittedCount}, violationCount: ${room1Multi.violationCount}`);
    assert.strictEqual(room1Multi.candidateCount, 2, 'Room 1 now has 2 distinct candidates (Suresh & Dinesh)');
    assert.strictEqual(room1Multi.submittedCount, 2, 'Room 1 has 2 submitted candidates (Suresh SUBMITTED + Dinesh AUTO_SUBMITTED_DISQUALIFIED)');
    assert.strictEqual(room1Multi.violationCount, 16, 'Room 1 has 16 violations (15 + 1)');

    const modalResMulti = await fetch(`${BASE_URL}/rooms/${room1._id}/candidates`, { headers: authHeaders });
    const modalDataMulti = await modalResMulti.json();
    assert.strictEqual(modalDataMulti.candidates.length, 2, 'Room 1 modal returns 2 candidates');
    assert.strictEqual(room1Multi.candidateCount, modalDataMulti.candidates.length, 'Room 1 Card matches Modal');
    console.log('✅ Scenario 4 PASSED: Multi-candidate room with disqualification is accurate.\n');

    console.log('--- Test Scenario 5: Duplicate Join Protection in API ---');
    // Attempt joining Room 2 with Ramesh again using Candidate Token
    const rameshToken = jwt.sign({ id: ramesh._id, type: 'candidate', role: 'candidate' }, JWT_SECRET, { expiresIn: '1h' });
    const joinRes = await fetch(`${BASE_URL}/rooms/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${rameshToken}`,
      },
      body: JSON.stringify({
        roomCode: room2.roomCode,
        roomPassword: 'PASSWORD2',
      }),
    });
    assert.strictEqual(joinRes.status, 200, 'Re-joining room should succeed gracefully');

    const reloadedRoom2 = await Room.findById(room2._id);
    const rameshEntries = reloadedRoom2.joinedCandidates.filter((j) => j.candidateId?.toString() === ramesh._id.toString());
    assert.strictEqual(rameshEntries.length, 1, 'joinedCandidates must NOT accumulate duplicate entries for the same candidate');
    console.log('✅ Scenario 5 PASSED: Reconnecting / re-joining room does not create duplicate entries in DB.\n');

    // Cleanup test artifacts
    await MalpracticeLog.deleteMany({ testId: test._id });
    await Submission.deleteMany({ testId: test._id });
    await Room.deleteMany({ testId: test._id });
    await Question.deleteMany({ questionSetId: qSet._id });
    await QuestionSet.findByIdAndDelete(qSet._id);
    await Folder.findByIdAndDelete(folder._id);
    await Test.findByIdAndDelete(test._id);
    await Candidate.deleteMany({ _id: { $in: [suresh._id, ramesh._id, dinesh._id] } });

    console.log('===============================================================');
    console.log('   🎉 ALL BUG-019 TEST SCENARIOS PASSED SUCCESSFULLY!          ');
    console.log('===============================================================\n');
  } catch (err) {
    console.error('❌ BUG-019 Test Suite Failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runBug019Tests();
