/**
 * test_bug88_stream_cleanup_on_completion.js
 * Automated QA script verifying BUG-88:
 * Immediate release and teardown of camera, microphone, and screen share MediaStreams
 * upon test completion, timer auto-submit, disqualification, or navigating to /candidate/complete.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('BUG-88 QA Suite: MediaStream Cleanup on Test Completion');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(description, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`✅ PASS [${totalTests}]: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL [${totalTests}]: ${description}`);
    console.error(`   Error: ${err.message}\n`);
  }
}

// ── TEST 1: mediaStreamManager.js unit logic & mock lifecycle ───────────────
runTest('mediaStreamManager correctly stops all video/audio tracks and clears window/DOM references', () => {
  // Setup mock DOM & Window environment
  const mockTracks = [];
  function createMockTrack(kind) {
    let isStopped = false;
    const track = {
      kind,
      readyState: 'live',
      onended: () => {},
      onmute: () => {},
      stop() {
        isStopped = true;
        this.readyState = 'ended';
      },
      get isStopped() {
        return isStopped;
      }
    };
    mockTracks.push(track);
    return track;
  }

  function createMockStream(kinds = ['video', 'audio']) {
    const tracks = kinds.map(createMockTrack);
    return {
      active: true,
      getTracks: () => tracks,
      getVideoTracks: () => tracks.filter(t => t.kind === 'video'),
      getAudioTracks: () => tracks.filter(t => t.kind === 'audio'),
    };
  }

  const mockVideoEl = {
    srcObject: createMockStream(['video']),
    load: () => {},
  };
  const mockAudioEl = {
    srcObject: createMockStream(['audio']),
  };

  global.window = {
    __candidateMediaStream: null,
    __candidateScreenStream: null,
    __candidateAudioStream: null,
    __proctoringStream: null,
  };
  global.document = {
    querySelectorAll: (sel) => {
      if (sel.includes('video') || sel.includes('audio')) {
        return [mockVideoEl, mockAudioEl];
      }
      return [];
    }
  };

  // Dynamically load manager module content and convert ES module exports to exports.xyz
  const managerPath = path.resolve(__dirname, '../../../../client/src/services/mediaStreamManager.js');
  let code = fs.readFileSync(managerPath, 'utf8');
  code = code.replace(/export const ([a-zA-Z0-9_]+)/g, 'const $1 = exports.$1');

  // Evaluate in sandbox
  const sandbox = {
    exports: {},
    window: global.window,
    document: global.document,
  };
  const fn = new Function('exports', 'window', 'document', code);
  fn(sandbox.exports, global.window, global.document);

  const {
    setActiveMediaStream,
    getActiveMediaStream,
    stopActiveMediaStream,
    setScreenStream,
    getScreenStream,
    stopScreenStream,
    stopAllCandidateMediaStreams
  } = sandbox.exports;

  // 1. Test active media stream registration
  const webcamMicStream = createMockStream(['video', 'audio']);
  setActiveMediaStream(webcamMicStream);
  assert.strictEqual(getActiveMediaStream(), webcamMicStream, 'getActiveMediaStream should return active media stream');
  assert.strictEqual(global.window.__candidateMediaStream, webcamMicStream, 'window.__candidateMediaStream should be populated');

  // 2. Test screen stream registration
  const screenStream = createMockStream(['video']);
  setScreenStream(screenStream);
  assert.strictEqual(getScreenStream(), screenStream, 'getScreenStream should return active screen stream');
  assert.strictEqual(global.window.__candidateScreenStream, screenStream, 'window.__candidateScreenStream should be populated');

  // 3. Test stopAllCandidateMediaStreams
  stopAllCandidateMediaStreams();

  // Validate all registered tracks were stopped
  mockTracks.forEach((t, i) => {
    assert.strictEqual(t.isStopped, true, `Mock track ${i} (${t.kind}) must have stop() called`);
  });

  // Validate state cleared
  assert.strictEqual(getActiveMediaStream(), null, 'getActiveMediaStream should return null after stop');
  assert.strictEqual(getScreenStream(), null, 'getScreenStream should return null after stop');
  assert.strictEqual(global.window.__candidateMediaStream, null, 'window.__candidateMediaStream should be null');
  assert.strictEqual(global.window.__candidateScreenStream, null, 'window.__candidateScreenStream should be null');
  assert.strictEqual(mockVideoEl.srcObject, null, 'mockVideoEl.srcObject should be reset to null');
  assert.strictEqual(mockAudioEl.srcObject, null, 'mockAudioEl.srcObject should be reset to null');
});

// ── TEST 2: screenStreamManager.js re-exports all methods ───────────────────
runTest('screenStreamManager.js re-exports all stream lifecycle functions for backward compatibility', () => {
  const filePath = path.resolve(__dirname, '../../../../client/src/services/screenStreamManager.js');
  const code = fs.readFileSync(filePath, 'utf8');

  const requiredExports = [
    'setScreenStream',
    'getScreenStream',
    'stopScreenStream',
    'setActiveMediaStream',
    'getActiveMediaStream',
    'stopActiveMediaStream',
    'stopAllCandidateMediaStreams',
  ];

  requiredExports.forEach((exp) => {
    assert.ok(code.includes(exp), `screenStreamManager.js must export '${exp}'`);
  });
});

// ── TEST 3: useProctoring.js registers stream and supports stopMediaStream ────
runTest('useProctoring.js registers media streams and provides complete teardown on disable and unmount', () => {
  const filePath = path.resolve(__dirname, '../../../../client/src/hooks/useProctoring.js');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(code.includes('setActiveMediaStream(stream)'), 'useProctoring must call setActiveMediaStream');
  assert.ok(code.includes('stopMediaStream'), 'useProctoring must define and expose stopMediaStream');
  assert.ok(code.includes('stopActiveMediaStream()'), 'useProctoring stopMediaStream must invoke stopActiveMediaStream');
  assert.ok(code.includes('if (!enabled)'), 'useProctoring must stop media stream when enabled is false (e.g. disqualified)');
});

// ── TEST 4: CandidateTestComplete.jsx stops all streams on mount and logout ──
runTest('CandidateTestComplete.jsx releases all media streams immediately on mount and on Done button', () => {
  const filePath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateTestComplete.jsx');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(code.includes('stopAllCandidateMediaStreams()'), 'CandidateTestComplete must invoke stopAllCandidateMediaStreams in useEffect');
  assert.ok(code.includes('stopScreenStream()'), 'CandidateTestComplete must invoke stopScreenStream');
  assert.ok(code.includes('stopAllCandidateMediaStreams'), 'CandidateTestComplete handleDone must invoke stopAllCandidateMediaStreams');
});

// ── TEST 5: CandidateTestScreen.jsx stops streams across all exit routes ─────
runTest('CandidateTestScreen.jsx stops streams on manual submit, timer expire, and disqualification', () => {
  const filePath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateTestScreen.jsx');
  const code = fs.readFileSync(filePath, 'utf8');

  // Check imports
  assert.ok(code.includes('stopAllCandidateMediaStreams'), 'CandidateTestScreen must import stopAllCandidateMediaStreams');

  // Check manual submit
  assert.ok(
    code.includes('proctoring?.stopMediaStream?.()') && code.includes('stopAllCandidateMediaStreams()'),
    'CandidateTestScreen must call stopAllCandidateMediaStreams on submit'
  );

  // Check onDisqualified
  const onDisqualifiedIndex = code.indexOf('const onDisqualified =');
  assert.ok(onDisqualifiedIndex !== -1, 'onDisqualified must exist');
  const onDisqualifiedBlock = code.slice(onDisqualifiedIndex, onDisqualifiedIndex + 250);
  assert.ok(onDisqualifiedBlock.includes('stopAllCandidateMediaStreams()'), 'onDisqualified must invoke stopAllCandidateMediaStreams');

  // Check handleTimerExpire
  const timerExpireIndex = code.indexOf('const handleTimerExpire =');
  assert.ok(timerExpireIndex !== -1, 'handleTimerExpire must exist');
  const timerExpireBlock = code.slice(timerExpireIndex, timerExpireIndex + 1500);
  assert.ok(timerExpireBlock.includes('stopAllCandidateMediaStreams()'), 'handleTimerExpire must invoke stopAllCandidateMediaStreams');
});

// ── TEST 6: CandidateAITestScreen.jsx stops streams across all exit routes ───
runTest('CandidateAITestScreen.jsx stops streams on manual submit, timer expire, and disqualification', () => {
  const filePath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateAITestScreen.jsx');
  const code = fs.readFileSync(filePath, 'utf8');

  // Check imports
  assert.ok(code.includes('stopAllCandidateMediaStreams'), 'CandidateAITestScreen must import stopAllCandidateMediaStreams');

  // Check onDisqualify
  const onDisqualifyIndex = code.indexOf('const onDisqualify =');
  assert.ok(onDisqualifyIndex !== -1, 'onDisqualify must exist');
  const onDisqualifyBlock = code.slice(onDisqualifyIndex, onDisqualifyIndex + 250);
  assert.ok(onDisqualifyBlock.includes('stopAllCandidateMediaStreams()'), 'onDisqualify must invoke stopAllCandidateMediaStreams');

  // Check handleTimerExpire
  const timerExpireIndex = code.indexOf('const handleTimerExpire =');
  assert.ok(timerExpireIndex !== -1, 'handleTimerExpire must exist');
  const timerExpireBlock = code.slice(timerExpireIndex, timerExpireIndex + 1500);
  assert.ok(timerExpireBlock.includes('stopAllCandidateMediaStreams()'), 'handleTimerExpire must invoke stopAllCandidateMediaStreams');
});

// ── TEST 7: CandidateInstructions.jsx tracks and stops preview stream ───────
runTest('CandidateInstructions.jsx registers preview stream and cleanly stops it before test starts', () => {
  const filePath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateInstructions.jsx');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(code.includes('setActiveMediaStream'), 'CandidateInstructions must call setActiveMediaStream');
  assert.ok(code.includes('stopActiveMediaStream'), 'CandidateInstructions must call stopActiveMediaStream on start and unmount');
});

console.log('\n================================================================');
console.log(`BUG-88 QA Suite Summary: ${passedTests}/${totalTests} tests passed`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
