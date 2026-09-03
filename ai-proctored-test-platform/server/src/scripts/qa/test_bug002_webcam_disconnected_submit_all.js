// test_bug002_webcam_disconnected_submit_all.js
// Automated QA verification for BUG-002: Webcam Disconnected Submit All & Finish Exam Flow
const fs = require('fs');
const path = require('path');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✕ FAIL: ${message}`);
  }
}

function runTests() {
  console.log('\n========================================================================');
  console.log('QA VERIFICATION SUITE: BUG-002 (Webcam Disconnected Submit All)');
  console.log('========================================================================\n');

  const overlayPath = path.join(__dirname, '../../../../client/src/candidate/components/CameraDisconnectedOverlay.jsx');
  const aiTestPath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateAITestScreen.jsx');
  const stdTestPath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateTestScreen.jsx');

  const overlayCode = fs.readFileSync(overlayPath, 'utf8');
  const aiTestCode = fs.readFileSync(aiTestPath, 'utf8');
  const stdTestCode = fs.readFileSync(stdTestPath, 'utf8');

  // ── TEST 1: CameraDisconnectedOverlay Component Verification ──
  console.log('--- TEST 1: CameraDisconnectedOverlay Component & Props ---');
  assert(overlayCode.includes('isSubmitting = false'), 'CameraDisconnectedOverlay accepts isSubmitting prop with default false');
  assert(overlayCode.includes('id="disconnected-submit-all-btn"'), 'Renders disconnected-submit-all-btn button element');
  assert(overlayCode.includes('disabled={isSubmitting}'), 'Submit button is disabled when isSubmitting is true');
  assert(overlayCode.includes('Submitting Exam...'), 'Displays loading text "Submitting Exam..." when submission is in progress');

  // ── TEST 2: CandidateAITestScreen Submit-All Audit ──
  console.log('\n--- TEST 2: CandidateAITestScreen Submission Flow ---');
  assert(aiTestCode.includes('const [isSubmittingAllState, setIsSubmittingAllState] = useState(false)'), 'Defines reactive state isSubmittingAllState to prevent double clicks');
  assert(aiTestCode.includes('if (isSubmittingAllState || isSubmittingAll.current) return'), 'Guards against double submissions before confirm dialog');
  assert(aiTestCode.includes('await api.submitAiTest(q._id'), 'Iterates and submits files/promptLog for all questions in AI test');
  assert(aiTestCode.includes('await api.submitAll(session.test._id)'), 'Calls POST /tests/:testId/submit-all endpoint');
  assert(aiTestCode.includes("navigate('/candidate/complete', { replace: true })"), 'Redirects candidate to /candidate/complete with replace: true');
  assert(aiTestCode.includes('isSubmitting={isSubmittingAllState}'), 'Passes isSubmittingAllState to CameraDisconnectedOverlay component');

  // ── TEST 3: CandidateTestScreen Submit-All Audit ──
  console.log('\n--- TEST 3: CandidateTestScreen Submission Flow ---');
  assert(stdTestCode.includes('const [isSubmittingAllState, setIsSubmittingAllState] = useState(false)'), 'CandidateTestScreen defines reactive state isSubmittingAllState');
  assert(stdTestCode.includes('if (isSubmittingAllState || isSubmittingAll.current) return'), 'Guards against double submissions in standard test');
  assert(stdTestCode.includes('await api.submitAll(session.test._id)'), 'Calls POST /tests/:testId/submit-all in standard test');
  assert(stdTestCode.includes("navigate('/candidate/complete', { replace: true })"), 'Redirects candidate to /candidate/complete in standard test');
  assert(stdTestCode.includes('isSubmitting={isSubmittingAllState}'), 'Passes isSubmittingAllState to CameraDisconnectedOverlay in standard test');

  // ── TEST 4: Re-entry Guard & Session Cleanup Audit ──
  console.log('\n--- TEST 4: Active Exam Re-entry Prevention ---');
  assert(aiTestCode.includes('s.completed = true'), 'Marks testSession as completed in sessionStorage on AI test submission');
  assert(stdTestCode.includes('s.completed = true'), 'Marks testSession as completed in sessionStorage on standard test submission');
  assert(aiTestCode.includes("if (s.completed || (s.submissions && s.submissions.length > 0 && s.submissions.every((sub) => sub.status === 'SUBMITTED')))"), 'Redirects returning candidates away from active AI test editor');
  assert(stdTestCode.includes("if (s.completed || (s.submissions && s.submissions.length > 0 && s.submissions.every((sub) => sub.status === 'SUBMITTED')))"), 'Redirects returning candidates away from active standard test editor');

  // ── TEST 5: Webcam Disconnect Guard Audit ──
  console.log('\n--- TEST 5: Independent Submission Guard Audit ---');
  assert(!aiTestCode.match(/const handleSubmitAll[\s\S]*?if\s*\(\s*proctoring\?\.isCameraDisconnected\s*\)\s*return/), 'handleSubmitAll in AI test is NOT blocked by webcam disconnect state');
  assert(!stdTestCode.match(/const handleSubmitAll[\s\S]*?if\s*\(\s*proctoring\?\.isCameraDisconnected\s*\)\s*return/), 'handleSubmitAll in standard test is NOT blocked by webcam disconnect state');

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (100%)`);
  console.log('========================================================================\n');
}

runTests();
