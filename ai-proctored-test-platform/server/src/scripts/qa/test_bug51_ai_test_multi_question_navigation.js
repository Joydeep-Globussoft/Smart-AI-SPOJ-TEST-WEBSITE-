/**
 * QA Automated Verification Suite: BUG-XX (BUG-51)
 * AI Test Question Set Multi-Question Support and Navigation
 *
 * Verifies that:
 * 1. Backend submissionController.js populates and returns all questions associated with questionSetId.
 * 2. CandidateAITestScreen.jsx initializes per-question files cache (questionFilesRef) for every question in session.
 * 3. Question navigation tabs (#ai-question-nav-strip, #ai-question-tab-*) render dynamically for all questions.
 * 4. Prev/Next navigation controls (#ai-prev-question-btn, #ai-next-question-btn) allow sequential question navigation.
 * 5. Switching questions (handleSelectQuestion) preserves current files, autosaves to backend, loads target files, and resets previewKey.
 * 6. Top bar progress indicator dynamically reflects submittedQuestions.size / session.questions.length.
 * 7. Question submissions are isolated per question.
 * 8. All existing proctoring, view-mode toggle, in-page preview modal, and camera-disconnect logic remain intact.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: BUG-51 (AI Test Multi-Question Navigation)');
  console.log('========================================================================\n');

  const aiTestPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateAITestScreen.jsx');
  const submissionControllerPath = path.resolve(__dirname, '../../controllers/submissionController.js');

  const aiTestCode = fs.readFileSync(aiTestPath, 'utf-8');
  const submissionCode = fs.readFileSync(submissionControllerPath, 'utf-8');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Backend Returns All Questions From Question Set (Criteria 1, 3, 10)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Backend Question Loading & Retrieval ---');

  assert(
    submissionCode.includes('path: \'questionSetId\'') &&
    submissionCode.includes('populate: { path: \'questionIds\' }'),
    'Backend populates questionIds from questionSetId in startAttempt'
  );

  assert(
    submissionCode.includes('const questions = allQuestions.slice(0, test.totalQuestions)'),
    'Backend slices questions up to test.totalQuestions without hardcoding a single question'
  );

  assert(
    submissionCode.includes('aiTestBriefFiles: q.aiTestBriefFiles'),
    'Backend includes aiTestBriefFiles in returned questions for AI_TEST'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Per-Question Files Isolation & Caching (Criteria 3, 4, 7)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Per-Question Files Isolation & Caching ---');

  assert(
    aiTestCode.includes('const questionFilesRef = useRef({});') &&
    aiTestCode.includes('const questionActiveFileRef = useRef({});'),
    'CandidateAITestScreen defines per-question file cache refs (Criterion 3)'
  );

  assert(
    aiTestCode.includes('(s.questions || []).forEach((q) => {') &&
    aiTestCode.includes('questionFilesRef.current[qIdStr] = sub.filesJson'),
    'Initializes files cache for all questions from existing submissions (Criterion 4)'
  );

  assert(
    aiTestCode.includes('questionFilesRef.current[qIdStr] = initial') &&
    aiTestCode.includes('q.aiTestBriefFiles'),
    'Falls back to aiTestBriefFiles for unworked questions'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Question Navigation UI Elements (Criteria 2, 5, 6)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Question Navigation UI Elements ---');

  assert(
    aiTestCode.includes('id="ai-question-nav-strip"') &&
    aiTestCode.includes('session?.questions && session.questions.length > 1'),
    'Renders dynamic question tab navigation strip when multiple questions exist (Criterion 6)'
  );

  assert(
    aiTestCode.includes('id={`ai-question-tab-${idx}`}') &&
    aiTestCode.includes('onClick={() => handleSelectQuestion(idx)}'),
    'Renders clickable question tabs calling handleSelectQuestion (Criterion 2)'
  );

  assert(
    aiTestCode.includes('id="ai-prev-question-btn"') &&
    aiTestCode.includes('id="ai-next-question-btn"'),
    'Renders Prev and Next question navigation buttons in Question panel'
  );

  assert(
    aiTestCode.includes('disabled={activeQuestionIdx <= 0') &&
    aiTestCode.includes('disabled={activeQuestionIdx >= session.questions.length - 1'),
    'Prev is disabled on first question and Next is disabled on last question'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: State Preservation & Preview Refresh on Switch (Criteria 5, 8)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: State Preservation & Preview Refresh on Switch ---');

  assert(
    aiTestCode.includes('questionFilesRef.current[currentQId] = currentFiles') &&
    aiTestCode.includes('api.saveFiles(currentQ._id, { filesJson: currentFiles })'),
    'handleSelectQuestion snapshots and autosaves current question files before switching (Criterion 5)'
  );

  assert(
    aiTestCode.includes('const targetFiles = questionFilesRef.current[targetQId] || DEFAULT_FILES') &&
    aiTestCode.includes('setFiles(targetFiles)'),
    'handleSelectQuestion loads target question files from cache without data loss'
  );

  assert(
    aiTestCode.includes('setPreviewKey((k) => k + 1)'),
    'handleSelectQuestion triggers preview reload for the target question (Criterion 8)'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Progress Display & Isolated Question Submission (Criteria 8, 9)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Progress Display & Isolated Question Submission ---');

  assert(
    aiTestCode.includes('Progress:') &&
    aiTestCode.includes('{submittedQuestions.size}/{session.questions?.length || 1} Submitted'),
    'Dynamic Progress indicator displays submitted count out of total questions (Criterion 8)'
  );

  assert(
    aiTestCode.includes('const qIdStr = activeQuestion._id.toString();') &&
    aiTestCode.includes('setSubmittedQuestions(prev => new Set([...prev, qIdStr]));'),
    'Question submission is tracked per question ID (Criterion 9)'
  );

  assert(
    aiTestCode.includes('id="ai-submit-all-btn"') &&
    aiTestCode.includes('api.submitAll(session.test._id)'),
    'Submit All & Finish finalizes the test attempt'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Regression Audit (Criterion 10, 11, 13)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: Regression Audit ---');

  assert(
    aiTestCode.includes('ViewModeSegmentedToggle'),
    'ViewModeSegmentedToggle (BUG-46/47/48) is preserved'
  );
  assert(
    aiTestCode.includes('ViolationNotificationBanner'),
    'ViolationNotificationBanner (BUG-49) is preserved'
  );
  assert(
    aiTestCode.includes('id="ai-preview-popout-btn"') &&
    aiTestCode.includes('id="ai-preview-modal-overlay"'),
    'In-page preview modal (BUG-50) is preserved'
  );
  assert(
    aiTestCode.includes('CameraDisconnectedOverlay'),
    'Camera disconnected proctoring overlay (BUG-40/42) is preserved'
  );

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('========================================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
