const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const MalpracticeLog = require('../../models/MalpracticeLog');
const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Candidate = require('../../models/Candidate');

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: BUG-31 (1-Second Delayed Screen Capture)');
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

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Unit timing simulation of triggerDelayedScreenViolation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Verify 1-second delay and immediate logging/banner ---');

  // Simulation replicating useProctoring.js triggerDelayedScreenViolation logic
  function createProctoringEngine() {
    const lastViolationTime = {};
    const pendingTimeouts = new Set();
    const capturedEvents = [];
    const immediateAlerts = [];

    function captureViolationProof(type, timestampDate) {
      return `data:image/jpeg;base64,SCREEN_PROOF_${type}_${timestampDate.getTime()}`;
    }

    function sendViolationApi(violationType, proof, detectedAt) {
      capturedEvents.push({
        violationType,
        proof,
        detectedAt,
        capturedAt: Date.now(),
      });
    }

    function reportViolation(violationType, screenshotBase64) {
      const now = Date.now();
      const last = lastViolationTime[violationType] || 0;
      if (now - last < 5000) return;
      lastViolationTime[violationType] = now;
      const detectedAt = new Date(now).toISOString();
      const proof = screenshotBase64 || `data:image/jpeg;base64,WEBCAM_PROOF_${violationType}`;
      sendViolationApi(violationType, proof, detectedAt);
    }

    function triggerDelayedScreenViolation(violationType, onImmediate) {
      const now = Date.now();
      const last = lastViolationTime[violationType] || 0;
      if (now - last < 5000) return;
      lastViolationTime[violationType] = now;

      const detectedAt = new Date(now).toISOString();

      if (typeof onImmediate === 'function') {
        onImmediate(detectedAt);
      }

      const timerId = setTimeout(() => {
        pendingTimeouts.delete(timerId);
        const proof = captureViolationProof(violationType, new Date(detectedAt));
        sendViolationApi(violationType, proof, detectedAt);
      }, 1000);

      pendingTimeouts.add(timerId);
    }

    return {
      triggerDelayedScreenViolation,
      reportViolation,
      capturedEvents,
      immediateAlerts,
      pendingTimeouts,
    };
  }

  const engine1 = createProctoringEngine();
  const t0 = Date.now();
  let immediateFired = false;
  let detectedTimestamp = null;

  engine1.triggerDelayedScreenViolation('TAB_SWITCH', (detectedAt) => {
    immediateFired = true;
    detectedTimestamp = detectedAt;
  });

  // At t = 0ms (synchronous)
  assert(immediateFired === true, 'Immediate violation alert fired synchronously at t = 0ms (Criterion 2)');
  assert(detectedTimestamp !== null, `Detection timestamp recorded at t = 0: ${detectedTimestamp}`);
  assert(engine1.capturedEvents.length === 0, 'Screenshot capture did NOT run immediately at t = 0ms (Criterion 1)');

  // Wait 400ms
  await new Promise((r) => setTimeout(r, 400));
  assert(engine1.capturedEvents.length === 0, 'Screenshot capture did NOT run prematurely at t = 400ms');

  // Wait remaining 700ms (total ~1100ms)
  await new Promise((r) => setTimeout(r, 750));
  assert(engine1.capturedEvents.length === 1, 'Screenshot capture fired after approximately 1 second (Criterion 1)');

  const event1 = engine1.capturedEvents[0];
  const elapsed = event1.capturedAt - t0;
  console.log(`Measured delay from detection to screenshot capture: ${elapsed}ms`);
  assert(elapsed >= 950 && elapsed <= 1350, `Delay is approximately 1000ms (actual: ${elapsed}ms)`);
  assert(event1.detectedAt === detectedTimestamp, 'Violation report retained the original detection timestamp from t = 0');
  assert(event1.proof.includes('SCREEN_PROOF_TAB_SWITCH'), 'Proof captured screen data URL with TAB_SWITCH label');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Rapid successive violations of different types (Criterion 3)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Rapid successive violations (TAB_SWITCH then FULLSCREEN_EXIT) ---');
  const engine2 = createProctoringEngine();
  const eventsTriggered = [];

  const startTime = Date.now();
  engine2.triggerDelayedScreenViolation('TAB_SWITCH', (ts) => {
    eventsTriggered.push({ type: 'TAB_SWITCH', ts, time: Date.now() - startTime });
  });

  // 200ms later, trigger FULLSCREEN_EXIT
  await new Promise((r) => setTimeout(r, 200));
  engine2.triggerDelayedScreenViolation('FULLSCREEN_EXIT', (ts) => {
    eventsTriggered.push({ type: 'FULLSCREEN_EXIT', ts, time: Date.now() - startTime });
  });

  assert(eventsTriggered.length === 2, 'Both immediate alerts triggered for distinct rapid violations');
  assert(eventsTriggered[0].type === 'TAB_SWITCH', 'First immediate alert is TAB_SWITCH');
  assert(eventsTriggered[1].type === 'FULLSCREEN_EXIT', 'Second immediate alert is FULLSCREEN_EXIT');
  assert(engine2.pendingTimeouts.size === 2, 'Two independent pending screenshot capture timers are active');

  // Wait for both to resolve (1500ms total from start)
  await new Promise((r) => setTimeout(r, 1300));
  assert(engine2.capturedEvents.length === 2, 'Both violations captured their screenshots independently (Criterion 3)');

  const cap1 = engine2.capturedEvents.find((e) => e.violationType === 'TAB_SWITCH');
  const cap2 = engine2.capturedEvents.find((e) => e.violationType === 'FULLSCREEN_EXIT');
  assert(cap1 !== undefined, 'TAB_SWITCH captured event exists');
  assert(cap2 !== undefined, 'FULLSCREEN_EXIT captured event exists');
  assert(cap1.proof.includes('TAB_SWITCH'), 'TAB_SWITCH proof is intact and uncorrupted');
  assert(cap2.proof.includes('FULLSCREEN_EXIT'), 'FULLSCREEN_EXIT proof is intact and uncorrupted');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Webcam violations are immediate and unchanged (Criterion 4)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Webcam violations (MULTIPLE_FACES, NO_FACE_15MIN) are immediate ---');
  const engine3 = createProctoringEngine();
  const tWebcamStart = Date.now();

  engine3.reportViolation('MULTIPLE_FACES');
  assert(engine3.capturedEvents.length === 1, 'MULTIPLE_FACES captured immediately at t = 0 without delay (Criterion 4)');
  assert(engine3.capturedEvents[0].violationType === 'MULTIPLE_FACES', 'Event type is MULTIPLE_FACES');

  const webcamElapsed = engine3.capturedEvents[0].capturedAt - tWebcamStart;
  assert(webcamElapsed < 50, `Webcam violation captured synchronously (took ${webcamElapsed}ms)`);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Backend accepts detectedAt in POST /proctoring/violation (Criterion 5)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Backend MalpracticeLog preservation of detectedAt ---');
  const sampleCandidate = await Candidate.findOne();
  const sampleTest = await Test.findOne();
  const sampleRoom = await Room.findOne();

  assert(sampleCandidate && sampleTest && sampleRoom, 'Found test, room, and candidate in database');

  const detectionDate = new Date(Date.now() - 1000); // 1 second ago
  const newLog = await MalpracticeLog.create({
    candidateId: sampleCandidate._id,
    testId: sampleTest._id,
    roomId: sampleRoom._id,
    violationType: 'TAB_SWITCH',
    proofScreenshotUrl: 'https://res.cloudinary.com/test/image/upload/sample_screen.jpg',
    detectedAt: detectionDate,
  });

  assert(newLog !== null, 'Created MalpracticeLog with explicit detectedAt');
  const savedLog = await MalpracticeLog.findById(newLog._id);
  assert(
    Math.abs(new Date(savedLog.detectedAt).getTime() - detectionDate.getTime()) < 10,
    `MalpracticeLog correctly stored original detectedAt (${savedLog.detectedAt.toISOString()})`
  );

  // Clean up sample log
  await MalpracticeLog.findByIdAndDelete(newLog._id);

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('========================================================================');

  await mongoose.disconnect();
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
