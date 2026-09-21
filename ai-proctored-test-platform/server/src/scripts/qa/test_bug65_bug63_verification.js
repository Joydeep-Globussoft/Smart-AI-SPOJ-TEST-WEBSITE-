/**
 * QA Verification Script:
 * 1. BUG-65 isSubmitting Guard: Verifies that during/after submission and intentional stream teardown,
 *    no false CAMERA_DISCONNECTED malpractice violations are logged or emitted.
 * 2. BUG-63 / BUG-64 Admin Warn / Issue Warning: Verifies:
 *    a) At 0 violations: Warn button logic / guard blocks warning ('No violations recorded').
 *    b) After a violation (e.g. FULLSCREEN_EXIT or TAB_SWITCH): malpracticeCount is accurately updated to >= 1.
 *    c) Admin clicking Warn / Issue Warning triggers POST /api/v1/candidates/:candidateId/warn.
 *    d) Backend emits `candidate:warning-issued` with the correct specific `violationType`.
 *    e) Candidate receives the event and queues it for ProctorWarningModal rendering.
 */

const path = require('path');
const ioClient = require(path.join(__dirname, '../../../../client/node_modules/socket.io-client'));
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const BASE_URL = 'http://localhost:5000/api/v1';
const SOCKET_URL = 'http://localhost:5000';
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ai-proctored-test';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'supersecretjwtkeyglobussoft2026';

let passedChecks = 0;
let totalChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedChecks++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🔍 STARTING VERIFICATION FOR BUG-65 & BUG-63/64 NON-REGRESSIONS');
  console.log('================================================================\n');

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection;
  const MalpracticeLog = db.collection('malpracticelogs');
  const Candidate = db.collection('candidates');
  const Test = db.collection('tests');
  const Room = db.collection('rooms');
  const Submission = db.collection('submissions');
  const Admin = db.collection('admins');

  // Clean any existing test records
  await Candidate.deleteMany({ email: /bug(65|63).*@example\.com/ });

  // 1. Get or create Admin
  let adminDoc = await Admin.findOne({ role: { $in: ['ADMIN', 'SUPER_ADMIN'] } });
  if (!adminDoc) {
    const newAdminId = new mongoose.Types.ObjectId();
    await Admin.insertOne({
      _id: newAdminId,
      name: 'Test Admin',
      email: 'qa_admin@example.com',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    adminDoc = { _id: newAdminId, name: 'Test Admin', email: 'qa_admin@example.com', role: 'ADMIN' };
  }

  const adminToken = jwt.sign(
    { id: adminDoc._id.toString(), email: adminDoc.email, role: adminDoc.role || 'ADMIN', type: 'admin' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  // ───────────────────────────────────────────────────────────────────────────
  // CHECK 1: BUG-65 isSubmitting Guard Verification
  // ───────────────────────────────────────────────────────────────────────────
  console.log('----------------------------------------------------------------');
  console.log('CHECK 1: BUG-65 isSubmitting Guard & Submission Stream Teardown');
  console.log('----------------------------------------------------------------');

  const testId1 = new mongoose.Types.ObjectId();
  const candId1 = new mongoose.Types.ObjectId();
  const roomId1 = new mongoose.Types.ObjectId();
  const timestamp = Date.now();

  // Seed candidate, test, room, and initial in-progress submission
  await Candidate.insertOne({
    _id: candId1,
    name: 'Candidate BUG65',
    email: `bug65_${timestamp}@example.com`,
    testId: testId1,
    status: 'IN_PROGRESS',
    seatNumber: 'A1',
  });

  await Test.insertOne({
    _id: testId1,
    title: 'BUG-65 Non-Regression Test',
    status: 'ACTIVE',
  });

  await Room.insertOne({
    _id: roomId1,
    testId: testId1,
    roomName: 'Hall BUG65',
    roomCode: `CODE_65_${timestamp}`,
    capacity: 30,
  });

  const candToken1 = jwt.sign(
    { id: candId1.toString(), email: `bug65_${timestamp}@example.com`, type: 'candidate', role: 'candidate' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  // Scenario A: Candidate Submits Test
  await Submission.insertOne({
    candidateId: candId1,
    testId: testId1,
    roomId: roomId1,
    status: 'SUBMITTED',
    submittedAt: new Date(),
  });

  // Scenario B: Intentional stream teardown occurs during/after submission.
  // Late/spurious proctoring violation request sent to backend (e.g. video track stop trigger)
  const postSubmitDisconnectRes = await fetch(`${BASE_URL}/proctoring/violation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candToken1}`,
    },
    body: JSON.stringify({
      candidateId: candId1.toString(),
      testId: testId1.toString(),
      roomId: roomId1.toString(),
      violationType: 'CAMERA_DISCONNECTED',
      details: 'Webcam stream track stopped after submission',
    }),
  });
  const postSubmitJson = await postSubmitDisconnectRes.json();

  console.log('[DEBUG Check 1] postSubmitStatus:', postSubmitDisconnectRes.status, 'postSubmitJson:', postSubmitJson);

  assert(
    postSubmitDisconnectRes.status === 200 && (postSubmitJson.message?.includes('suppressed') || postSubmitJson.message?.includes('concluded')),
    'Backend proctoringController suppresses CAMERA_DISCONNECTED when candidate has SUBMITTED status'
  );

  // Scenario C: Verify zero false MalpracticeLogs saved in DB
  const falseLogs = await MalpracticeLog.find({
    candidateId: candId1,
    testId: testId1,
    violationType: 'CAMERA_DISCONNECTED',
  }).toArray();

  assert(falseLogs.length === 0, 'Zero false CAMERA_DISCONNECTED MalpracticeLogs saved in DB during submission stream teardown');

  // Scenario D: Verify client-side source code guards in useProctoring.js
  const useProctoringCode = fs.readFileSync(
    path.join(__dirname, '../../../../client/src/hooks/useProctoring.js'),
    'utf8'
  );

  assert(
    useProctoringCode.includes('if (isCameraDisconnectedRef.current || isSubmittingRef.current || isIntentionalTeardownRef.current)'),
    'useProctoring.js contains explicit guard against camera disconnect events when isSubmittingRef or isIntentionalTeardownRef is active'
  );

  assert(
    useProctoringCode.includes('suppressViolations'),
    'useProctoring.js exports suppressViolations() hook method to disarm all violation triggers before teardown'
  );


  // ───────────────────────────────────────────────────────────────────────────
  // CHECK 2: BUG-63 / BUG-64 Admin Warn & Issue Warning Action
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n----------------------------------------------------------------');
  console.log('CHECK 2: BUG-63 & BUG-64 Admin Warn / Issue Warning Workflow');
  console.log('----------------------------------------------------------------');

  const testId2 = new mongoose.Types.ObjectId();
  const candId2 = new mongoose.Types.ObjectId();
  const roomId2 = new mongoose.Types.ObjectId();

  await Candidate.insertOne({
    _id: candId2,
    name: 'Candidate BUG63',
    email: `bug63_${timestamp}@example.com`,
    testId: testId2,
    status: 'IN_PROGRESS',
    seatNumber: 'B1',
  });

  await Test.insertOne({
    _id: testId2,
    title: 'BUG-63/64 Non-Regression Test',
    status: 'ACTIVE',
  });

  await Room.insertOne({
    _id: roomId2,
    testId: testId2,
    roomName: 'Hall BUG63',
    roomCode: `CODE_63_${timestamp}`,
    capacity: 30,
  });

  await Submission.insertOne({
    candidateId: candId2,
    testId: testId2,
    roomId: roomId2,
    status: 'IN_PROGRESS',
    candidateStartTime: new Date(),
    candidateEndTime: new Date(Date.now() + 3600000),
  });

  const candToken2 = jwt.sign(
    { id: candId2.toString(), email: `bug63_${timestamp}@example.com`, type: 'candidate', role: 'candidate' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  // Scenario A: Candidate has 0 violations (BUG-63 Disabled State Check)
  const adminDashboardCode = fs.readFileSync(
    path.join(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx'),
    'utf8'
  );

  assert(
    adminDashboardCode.includes('disabled={malpracticeCount < 1}'),
    'AdminLiveDashboard.jsx strictly disables Warn button when malpracticeCount < 1 (BUG-63)'
  );

  assert(
    adminDashboardCode.includes("title={malpracticeCount > 0 ? 'Send Warning' : 'No violations recorded'}"),
    "Warn button title tooltip renders 'No violations recorded' when malpracticeCount is 0"
  );

  // Connect Admin and Candidate sockets
  const adminSocket = ioClient(SOCKET_URL, {
    auth: { token: adminToken },
    transports: ['polling', 'websocket'],
  });

  const adminAlerts = [];
  adminSocket.on('connect', () => {
    adminSocket.emit('admin:join', { adminId: adminDoc._id.toString(), testId: testId2.toString() });
  });
  adminSocket.on('malpractice:alert', (data) => {
    adminAlerts.push(data);
  });

  const candidateSocket = ioClient(SOCKET_URL, {
    auth: { token: candToken2 },
    transports: ['polling', 'websocket'],
  });

  const candidateWarnings = [];
  const candidateWarningIssuedModals = [];
  const candidateViolationsUpdated = [];

  candidateSocket.on('connect', () => {
    candidateSocket.emit('candidate:join', {
      candidateId: candId2.toString(),
      testId: testId2.toString(),
      roomId: roomId2.toString(),
    });
  });

  candidateSocket.on('candidate:warning', (data) => candidateWarnings.push(data));
  candidateSocket.on('candidate:warning-issued', (data) => candidateWarningIssuedModals.push(data));
  candidateSocket.on('candidate:violation-updated', (data) => candidateViolationsUpdated.push(data));

  await new Promise((r) => setTimeout(r, 1000));

  // Scenario B: Candidate triggers a violation (e.g. FULLSCREEN_EXIT per BUG-89 fix)
  console.log('[DEBUG Check 2] Emitting candidate:fullscreenexit for candidate:', candId2.toString(), 'test:', testId2.toString());
  candidateSocket.emit('candidate:fullscreenexit', {
    candidateId: candId2.toString(),
    testId: testId2.toString(),
    roomId: roomId2.toString(),
  });

  await new Promise((r) => setTimeout(r, 1500));

  const fsLog = await MalpracticeLog.findOne({ candidateId: candId2, testId: testId2, violationType: 'FULLSCREEN_EXIT' });
  console.log('[DEBUG Check 2] fsLog found:', fsLog);
  console.log('[DEBUG Check 2] adminAlerts:', adminAlerts);
  assert(Boolean(fsLog), 'MalpracticeLog for FULLSCREEN_EXIT successfully logged in MongoDB via socket pipeline');
  assert(adminAlerts.some((a) => a.violationType === 'FULLSCREEN_EXIT' && a.candidateId === candId2.toString()), 'Admin received real-time malpractice:alert socket event for FULLSCREEN_EXIT');
  assert(adminAlerts.some((a) => a.currentCount === 1), 'Alert reports accurate violation count = 1');

  // Scenario C: Admin Issues Warning (BUG-64)
  const warnRes = await fetch(`${BASE_URL}/candidates/${candId2}/warn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ testId: testId2.toString() }),
  });
  const warnJson = await warnRes.json();
  console.log('[DEBUG Check 2] warnStatus:', warnRes.status, 'warnJson:', warnJson);
  console.log('[DEBUG Check 2] candidateWarningIssuedModals:', candidateWarningIssuedModals);

  assert(warnRes.status === 200, `Admin warn endpoint responded 200 OK: ${warnJson.message}`);
  assert(warnJson.violationType === 'FULLSCREEN_EXIT', `Admin warn response confirms violationType = ${warnJson.violationType}`);

  await new Promise((r) => setTimeout(r, 500));

  assert(candidateWarningIssuedModals.length > 0, 'Candidate socket received candidate:warning-issued event');
  assert(candidateWarningIssuedModals[0]?.violationType === 'FULLSCREEN_EXIT', `Warning modal received violationType = ${candidateWarningIssuedModals[0]?.violationType}`);
  assert(typeof candidateWarningIssuedModals[0]?.issuedAt === 'string', 'Warning modal payload includes ISO issuedAt timestamp');

  // Scenario D: Candidate UI Warning Modal Component Verification (BUG-64)
  const proctorWarningModalCode = fs.readFileSync(
    path.join(__dirname, '../../../../client/src/candidate/components/ProctorWarningModal.jsx'),
    'utf8'
  );

  assert(
    proctorWarningModalCode.includes("FULLSCREEN_EXIT: { label: 'FULLSCREEN EXIT', icon: '⛶'"),
    'ProctorWarningModal contains distinct label, icon, and description for FULLSCREEN EXIT'
  );
  assert(
    proctorWarningModalCode.includes("TAB_SWITCH: { label: 'TAB SWITCH', icon: '🔄'"),
    'ProctorWarningModal contains distinct label, icon, and description for TAB SWITCH'
  );
  assert(
    proctorWarningModalCode.includes("MULTIPLE_FACES: { label: 'MULTIPLE FACES DETECTED', icon: '👥'"),
    'ProctorWarningModal contains distinct label, icon, and description for MULTIPLE FACES DETECTED'
  );

  // Clean up
  adminSocket.disconnect();
  candidateSocket.disconnect();

  await Candidate.deleteMany({ _id: { $in: [candId1, candId2] } });
  await Test.deleteMany({ _id: { $in: [testId1, testId2] } });
  await Room.deleteMany({ _id: { $in: [roomId1, roomId2] } });
  await Submission.deleteMany({ candidateId: { $in: [candId1, candId2] } });
  await MalpracticeLog.deleteMany({ candidateId: { $in: [candId1, candId2] } });

  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log(`🏁 VERIFICATION COMPLETE: ${passedChecks}/${totalChecks} CHECKS PASSED`);
  console.log('================================================================\n');

  if (passedChecks === totalChecks) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
