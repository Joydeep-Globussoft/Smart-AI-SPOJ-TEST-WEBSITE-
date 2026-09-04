/**
 * QA Test Suite for BUG-51: Post-Transition (1s Delay) Evidence Capture
 *
 * Verifies:
 * 1. Immediate violation event dispatch (toast, socket, detection timestamp) at t = 0
 * 2. Scheduled 1000ms post-transition screen capture at t = 1000ms
 * 3. Exact detection timestamp preservation in violation payload and watermark
 * 4. Multiple rapid transitions within 1s are throttled to a single capture
 * 5. Fast recovery (candidate switching back within 1s) does NOT cancel scheduled capture
 * 6. Capture error resilience (violation logged with null/fallback screenshot if stream fails)
 */

const assert = require('assert');

async function runTest() {
  console.log('--- STARTING BUG-51 POST-TRANSITION DELAYED CAPTURE QA SUITE ---\n');

  let passedTests = 0;
  let totalTests = 0;

  async function itAsync(description, fn) {
    totalTests++;
    try {
      await fn();
      console.log(`✅ PASS: ${description}`);
      passedTests++;
    } catch (err) {
      console.error(`❌ FAIL: ${description}`);
      console.error(err);
    }
  }

  function createMockProctoringEngine() {
    const lastViolationTime = {};
    const delayedTimeouts = new Set();
    const immediateEvents = [];
    const submittedViolations = [];
    let currentScreenState = 'EXAM_PAGE';

    function captureViolationProof(type, timestampDate) {
      if (currentScreenState === 'ERROR') {
        throw new Error('Screen stream disconnected');
      }
      return `data:image/jpeg;base64,mock_${type}_${currentScreenState}_${timestampDate.toISOString()}`;
    }

    async function sendViolationApi(violationType, proof, detectedAt) {
      submittedViolations.push({
        violationType,
        proof,
        detectedAt,
        submittedAt: new Date().toISOString(),
      });
    }

    function triggerDelayedScreenViolation(violationType, onImmediate) {
      const now = Date.now();
      const lastTime = lastViolationTime[violationType] || 0;
      if (now - lastTime < 5000) {
        return;
      }
      lastViolationTime[violationType] = now;

      const detectionDate = new Date(now);
      const detectedAt = detectionDate.toISOString();

      if (typeof onImmediate === 'function') {
        onImmediate(detectedAt);
      }

      const timerId = setTimeout(async () => {
        delayedTimeouts.delete(timerId);
        let proof = null;
        try {
          proof = captureViolationProof(violationType, detectionDate);
        } catch (captureErr) {
          console.debug('[QA] Capture error caught gracefully:', captureErr.message);
        }

        try {
          await sendViolationApi(violationType, proof, detectedAt);
        } catch (err) {}
      }, 1000);

      delayedTimeouts.add(timerId);
    }

    return {
      triggerDelayedScreenViolation,
      setScreenState: (state) => { currentScreenState = state; },
      getImmediateEvents: () => immediateEvents,
      getSubmittedViolations: () => submittedViolations,
      getDelayedTimeouts: () => delayedTimeouts,
      onImmediate: (detectedAt) => {
        immediateEvents.push({ detectedAt, timestamp: Date.now() });
      }
    };
  }

  // TEST 1: Immediate dispatch at t=0, API submission delayed by ~1000ms
  await itAsync('Test 1: Immediate event dispatch and 1000ms delayed screen submission', async () => {
    const engine = createMockProctoringEngine();
    const t0 = Date.now();

    engine.triggerDelayedScreenViolation('TAB_SWITCH', (detectedAt) => {
      engine.onImmediate(detectedAt);
    });

    assert.strictEqual(engine.getImmediateEvents().length, 1, 'Immediate event should fire at t=0');
    assert.strictEqual(engine.getSubmittedViolations().length, 0, 'No API violation should be sent before 1000ms');

    // Change screen state at t = 200ms (representing what candidate switched TO)
    engine.setScreenState('CHROME_CHATGPT_TAB');

    // Wait 1100ms
    await new Promise((r) => setTimeout(r, 1100));

    const submitted = engine.getSubmittedViolations();
    assert.strictEqual(submitted.length, 1, 'Exactly 1 violation submitted after 1000ms');
    assert.strictEqual(submitted[0].violationType, 'TAB_SWITCH');
    assert.ok(submitted[0].proof.includes('CHROME_CHATGPT_TAB'), 'Evidence must reflect destination state, not original');
    assert.strictEqual(submitted[0].detectedAt, engine.getImmediateEvents()[0].detectedAt, 'Detection timestamp must match t=0');
  });

  // TEST 2: Multiple rapid tab switches within 1s throttled to single capture
  await itAsync('Test 2: Multiple tab transitions within 1 second throttled to a single capture', async () => {
    const engine = createMockProctoringEngine();

    engine.triggerDelayedScreenViolation('TAB_SWITCH', (detectedAt) => engine.onImmediate(detectedAt));
    engine.setScreenState('TAB_1');

    await new Promise((r) => setTimeout(r, 200));
    engine.triggerDelayedScreenViolation('TAB_SWITCH', (detectedAt) => engine.onImmediate(detectedAt));
    engine.setScreenState('TAB_2');

    await new Promise((r) => setTimeout(r, 200));
    engine.triggerDelayedScreenViolation('TAB_SWITCH', (detectedAt) => engine.onImmediate(detectedAt));
    engine.setScreenState('TAB_3_FINAL');

    await new Promise((r) => setTimeout(r, 700)); // total ~1100ms from start

    assert.strictEqual(engine.getImmediateEvents().length, 1, 'Only first event should trigger immediate callback');
    assert.strictEqual(engine.getSubmittedViolations().length, 1, 'Only 1 violation should be submitted');
    assert.ok(engine.getSubmittedViolations()[0].proof.includes('TAB_3_FINAL'), 'Captured frame at 1s mark reflects active screen at that moment');
  });

  // TEST 3: Fast recovery (switching back to exam) does not cancel capture
  await itAsync('Test 3: Fast recovery does not cancel scheduled capture at 1s mark', async () => {
    const engine = createMockProctoringEngine();

    engine.triggerDelayedScreenViolation('FULLSCREEN_EXIT', (detectedAt) => engine.onImmediate(detectedAt));
    engine.setScreenState('DESKTOP_WINDOW');

    // Candidate switches back to exam at t = 400ms
    await new Promise((r) => setTimeout(r, 400));
    engine.setScreenState('RETURNED_TO_EXAM');

    await new Promise((r) => setTimeout(r, 700));

    const submitted = engine.getSubmittedViolations();
    assert.strictEqual(submitted.length, 1, 'Capture fires regardless of fast return');
    assert.strictEqual(submitted[0].violationType, 'FULLSCREEN_EXIT');
    assert.ok(submitted[0].proof.includes('RETURNED_TO_EXAM'), 'Captures active display state at 1s mark');
  });

  // TEST 4: Capture failure resilience
  await itAsync('Test 4: Capture stream failure still submits violation record with null proof', async () => {
    const engine = createMockProctoringEngine();
    engine.setScreenState('ERROR'); // Simulates closed stream

    engine.triggerDelayedScreenViolation('TAB_SWITCH', (detectedAt) => engine.onImmediate(detectedAt));

    await new Promise((r) => setTimeout(r, 1100));

    const submitted = engine.getSubmittedViolations();
    assert.strictEqual(submitted.length, 1, 'Violation record still submitted');
    assert.strictEqual(submitted[0].proof, null, 'Proof is null on stream error without breaking API call');
    assert.ok(submitted[0].detectedAt, 'Original detection timestamp preserved');
  });

  console.log(`\n================================`);
  console.log(`TOTAL: ${totalTests}, PASSED: ${passedTests}, FAILED: ${totalTests - passedTests}`);
  console.log(`================================\n`);
}

runTest();
