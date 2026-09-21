const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const path = require('path');
const ioClient = require(path.join(__dirname, '../../../../client/node_modules/socket.io-client'));
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'supersecretjwtkeyglobussoft2026';
console.log('[Test Script] JWT_SECRET loaded:', JWT_SECRET);

let passed = 0;
let total = 0;

function assert(condition, testName) {
  total++;
  if (condition) {
    console.log(`  ✓ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ✕ [FAIL] ${testName}`);
  }
}

async function runVerification() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: BUG-89 Malpractice Telemetry & Multi-Detection');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-proctored-test');
  const Candidate = require('../../models/Candidate');
  const Admin = require('../../models/Admin');
  const Test = require('../../models/Test');
  const Room = require('../../models/Room');
  const Submission = require('../../models/Submission');
  const MalpracticeLog = require('../../models/MalpracticeLog');

  const admin = await Admin.findOne() || (await Admin.create({ name: 'QA Super Admin', email: 'qa_admin@globussoft.com', passwordHash: 'dummy', role: 'SUPER_ADMIN' }));
  let test = await Test.findOne();
  if (!test) {
    test = await Test.create({
      title: 'QA Malpractice Test',
      durationMinutes: 60,
      passingCriteria: 70,
      createdBy: admin._id,
      testType: 'SPOJ',
      totalQuestions: 5,
      instructions: 'Test instructions',
    });
  }
  let room = await Room.findOne({ testId: test._id });
  if (!room) {
    room = await Room.create({
      testId: test._id,
      roomName: 'qa-hall-1',
      roomCode: 'ROOM-QA1',
      roomPassword: 'pass',
      capacity: 50,
    });
  }
  let candidate = await Candidate.findOne({ email: 'qa_malpractice_cand@globussoft.com' });
  if (!candidate) {
    candidate = await Candidate.create({
      name: 'QA Malpractice Candidate',
      email: 'qa_malpractice_cand@globussoft.com',
      passwordHash: 'dummy',
    });
  }

  // Clean old logs for clean test
  await MalpracticeLog.deleteMany({ candidateId: candidate._id, testId: test._id });

  // Create active submission
  await Submission.deleteMany({ candidateId: candidate._id, testId: test._id });
  await Submission.create({
    candidateId: candidate._id,
    testId: test._id,
    questionId: new mongoose.Types.ObjectId(),
    roomId: room._id,
    status: 'IN_PROGRESS',
    candidateStartTime: new Date(),
    candidateEndTime: new Date(Date.now() + 3600000),
  });

  const candidateToken = jwt.sign(
    { id: candidate._id.toString(), email: candidate.email, type: 'candidate', role: 'CANDIDATE' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const adminToken = jwt.sign(
    { id: admin._id.toString(), email: admin.email, type: 'admin', role: admin.role || 'SUPER_ADMIN' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  // Setup Admin Socket
  const adminSocket = ioClient('http://localhost:5000', {
    auth: { token: adminToken },
    transports: ['polling', 'websocket'],
  });

  const adminAlerts = [];
  const adminSeatmapEvents = [];
  const adminDashboardEvents = [];

  adminSocket.on('connect', () => {
    console.log('Admin socket connected:', adminSocket.id);
    adminSocket.emit('admin:join', { adminId: admin._id.toString(), testId: test._id.toString() });
  });

  adminSocket.on('connect_error', (e) => {
    console.log('Admin socket connect_error:', e.message);
  });

  adminSocket.on('malpractice:alert', (data) => {
    adminAlerts.push(data);
  });

  adminSocket.on('seatmap:status', (data) => {
    adminSeatmapEvents.push(data);
  });

  adminSocket.on('dashboard:update', (data) => {
    adminDashboardEvents.push(data);
  });

  // Setup Candidate Socket
  const candidateSocket = ioClient('http://localhost:5000', {
    auth: { token: candidateToken },
    transports: ['polling', 'websocket'],
  });

  const candidateWarnings = [];
  const candidateViolationsUpdated = [];

  candidateSocket.on('connect', () => {
    console.log('Candidate socket connected:', candidateSocket.id);
    candidateSocket.emit('candidate:join', {
      candidateId: candidate._id.toString(),
      testId: test._id.toString(),
      roomId: room._id.toString(),
    });
  });

  candidateSocket.on('connect_error', (e) => {
    console.log('Candidate socket connect_error:', e.message);
  });

  candidateSocket.on('candidate:warning', (data) => {
    candidateWarnings.push(data);
  });

  candidateSocket.on('candidate:violation-updated', (data) => {
    candidateViolationsUpdated.push(data);
  });

  await new Promise((r) => setTimeout(r, 1200));

  // ── TEST 1: Fullscreen Exit Violation Relay ──
  console.log('--- TEST 1: Fullscreen Exit Violation Relay ---');
  adminAlerts.length = 0;
  candidateWarnings.length = 0;

  candidateSocket.emit('candidate:fullscreenexit', {
    candidateId: candidate._id.toString(),
    testId: test._id.toString(),
    roomId: room._id.toString(),
  });

  await new Promise((r) => setTimeout(r, 1000));

  const fsLog = await MalpracticeLog.findOne({ candidateId: candidate._id, testId: test._id, violationType: 'FULLSCREEN_EXIT' });
  assert(Boolean(fsLog), '1.1: MalpracticeLog for FULLSCREEN_EXIT created in MongoDB via socket event');
  assert(adminAlerts.some((a) => a.violationType === 'FULLSCREEN_EXIT' && a.candidateId === candidate._id.toString()), '1.2: malpractice:alert emitted to admin room for FULLSCREEN_EXIT');
  assert(adminSeatmapEvents.some((s) => s.candidateId === candidate._id.toString() && s.colorStatus === 'YELLOW'), '1.3: seatmap:status emitted YELLOW to admin room');
  assert(candidateWarnings.some((w) => w.violationType === 'FULLSCREEN_EXIT'), '1.4: candidate:warning emitted to candidate socket');

  // Simulate delayed HTTP POST attaching proof screenshot
  const fakeProof = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const fsHttpRes = await fetch('http://localhost:5000/api/v1/proctoring/violation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${candidateToken}` },
    body: JSON.stringify({
      candidateId: candidate._id.toString(),
      testId: test._id.toString(),
      roomId: room._id.toString(),
      violationType: 'FULLSCREEN_EXIT',
      screenshotBase64: fakeProof,
      detectedAt: new Date().toISOString(),
    }),
  });
  const fsHttpData = await fsHttpRes.json();
  assert(fsHttpRes.status === 201, '1.5: Delayed HTTP POST /violation returns 201');
  const updatedFsLog = await MalpracticeLog.findById(fsLog._id);
  assert(Boolean(updatedFsLog?.proofScreenshotUrl), '1.6: Evidence screenshot attached to FULLSCREEN_EXIT log');

  // ── TEST 2: Tab Switch Violation Relay ──
  console.log('\n--- TEST 2: Tab Switch Violation Relay ---');
  adminAlerts.length = 0;
  candidateWarnings.length = 0;

  candidateSocket.emit('candidate:tabswitch', {
    candidateId: candidate._id.toString(),
    testId: test._id.toString(),
    roomId: room._id.toString(),
  });

  await new Promise((r) => setTimeout(r, 1000));

  const tabLog = await MalpracticeLog.findOne({ candidateId: candidate._id, testId: test._id, violationType: 'TAB_SWITCH' });
  assert(Boolean(tabLog), '2.1: MalpracticeLog for TAB_SWITCH created in MongoDB via socket event');
  assert(adminAlerts.some((a) => a.violationType === 'TAB_SWITCH' && a.candidateId === candidate._id.toString()), '2.2: malpractice:alert emitted to admin room for TAB_SWITCH');
  assert(candidateWarnings.some((w) => w.violationType === 'TAB_SWITCH'), '2.3: candidate:warning emitted to candidate socket for TAB_SWITCH');

  // ── TEST 3: Multi-Face Detection Handling ──
  console.log('\n--- TEST 3: Multi-Face Detection Handling ---');
  adminAlerts.length = 0;
  const mfHttpRes = await fetch('http://localhost:5000/api/v1/proctoring/violation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${candidateToken}` },
    body: JSON.stringify({
      candidateId: candidate._id.toString(),
      testId: test._id.toString(),
      roomId: room._id.toString(),
      violationType: 'MULTIPLE_FACES',
      screenshotBase64: fakeProof,
      detectedAt: new Date().toISOString(),
    }),
  });
  const mfHttpData = await mfHttpRes.json();
  assert(mfHttpRes.status === 201, '3.1: MULTIPLE_FACES violation returns 201 with no backend crash');
  const mfLog = await MalpracticeLog.findOne({ candidateId: candidate._id, testId: test._id, violationType: 'MULTIPLE_FACES' });
  assert(Boolean(mfLog && mfLog.proofScreenshotUrl), '3.2: MULTIPLE_FACES logged with evidence screenshot');
  assert(adminAlerts.some((a) => a.violationType === 'MULTIPLE_FACES'), '3.3: malpractice:alert broadcast for MULTIPLE_FACES');

  // ── TEST 4: No Face (15 Min Absence) Handling ──
  console.log('\n--- TEST 4: No Face (15 Min Absence) Handling ---');
  adminAlerts.length = 0;
  const nfHttpRes = await fetch('http://localhost:5000/api/v1/proctoring/violation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${candidateToken}` },
    body: JSON.stringify({
      candidateId: candidate._id.toString(),
      testId: test._id.toString(),
      roomId: room._id.toString(),
      violationType: 'NO_FACE_15MIN',
      screenshotBase64: fakeProof,
      detectedAt: new Date().toISOString(),
    }),
  });
  assert(nfHttpRes.status === 201, '4.1: NO_FACE_15MIN violation returns 201 with no backend crash');
  const nfLog = await MalpracticeLog.findOne({ candidateId: candidate._id, testId: test._id, violationType: 'NO_FACE_15MIN' });
  assert(Boolean(nfLog && nfLog.proofScreenshotUrl), '4.2: NO_FACE_15MIN logged with evidence screenshot');
  assert(adminAlerts.some((a) => a.violationType === 'NO_FACE_15MIN'), '4.3: malpractice:alert broadcast for NO_FACE_15MIN');

  // ── TEST 5: Graceful Non-String Screenshot Guard ──
  console.log('\n--- TEST 5: Graceful Non-String Screenshot Guard ---');
  const badScreenshotRes = await fetch('http://localhost:5000/api/v1/proctoring/violation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${candidateToken}` },
    body: JSON.stringify({
      candidateId: candidate._id.toString(),
      testId: test._id.toString(),
      roomId: room._id.toString(),
      violationType: 'OTHER',
      screenshotBase64: { bad: 'promise_object' },
      detectedAt: new Date().toISOString(),
    }),
  });
  assert(badScreenshotRes.status === 201, '5.1: Non-string screenshot object handled gracefully with 201 (no 500 error)');
  const badLog = await MalpracticeLog.findOne({ candidateId: candidate._id, testId: test._id, violationType: 'OTHER' });
  assert(Boolean(badLog && badLog.proofScreenshotUrl === null), '5.2: Violation successfully logged even when screenshot payload is malformed');

  // ── TEST 6: Candidate Malpractice Inspection History API ──
  console.log('\n--- TEST 6: Admin Candidate Malpractice Inspection History API ---');
  const getLogsRes = await fetch(`http://localhost:5000/api/v1/tests/${test._id}/candidates/${candidate._id}/malpractice-logs`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const getLogsData = await getLogsRes.json();
  assert(getLogsRes.status === 200, '6.1: Admin getCandidateMalpracticeLogs returns 200');
  assert(Array.isArray(getLogsData.malpracticeLogs) && getLogsData.malpracticeLogs.length >= 4, '6.2: All candidate violation records returned in array');
  assert(getLogsData.malpracticeLogs.some((l) => Boolean(l.proofScreenshotUrl)), '6.3: Violation logs include evidence screenshot URLs for viewing in admin panel');

  // ── TEST 7: YOLO Phone Detection Service ──
  console.log('\n--- TEST 7: YOLO Phone Detection Service ---');
  const { detectPhone } = require('../../services/malpracticeService');
  // Create a 1x1 blank image buffer
  const blankJpgBuffer = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
  const phoneResult = await detectPhone(blankJpgBuffer);
  assert(typeof phoneResult.phoneDetected === 'boolean', `7.1: YOLO detectPhone responds successfully without ECONNREFUSED (phoneDetected: ${phoneResult.phoneDetected})`);

  console.log(`\n========================================================================`);
  console.log(`SUMMARY: ${passed}/${total} verification tests passed!`);
  console.log(`========================================================================\n`);

  adminSocket.disconnect();
  candidateSocket.disconnect();
  await mongoose.disconnect();

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
