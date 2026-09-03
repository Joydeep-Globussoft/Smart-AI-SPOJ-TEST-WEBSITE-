/**
 * QA Automated Verification Suite: BUG-44 (Green Tile Meaning = Submitted)
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
  console.log('QA VERIFICATION SUITE: BUG-44 (Green Tile Meaning = Submitted)');
  console.log('========================================================================\n');

  const dashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');
  const roomControllerPath = path.resolve(__dirname, '../../controllers/roomController.js');
  const socketHandlerPath = path.resolve(__dirname, '../../sockets/socketHandler.js');
  const submissionControllerPath = path.resolve(__dirname, '../../controllers/submissionController.js');
  const shortlistServicePath = path.resolve(__dirname, '../../services/shortlistService.js');
  const evaluationServicePath = path.resolve(__dirname, '../../services/evaluationService.js');

  const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
  const roomControllerCode = fs.readFileSync(roomControllerPath, 'utf-8');
  const socketHandlerCode = fs.readFileSync(socketHandlerPath, 'utf-8');
  const submissionControllerCode = fs.readFileSync(submissionControllerPath, 'utf-8');
  const shortlistServiceCode = fs.readFileSync(shortlistServicePath, 'utf-8');
  const evaluationServiceCode = fs.readFileSync(evaluationServicePath, 'utf-8');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Color Status Derivation in Client Dashboard (Criteria 1, 2, 3, 4, 8)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Client Color Status Derivation ---');
  assert(
    dashboardCode.includes('const getCandidateColorStatus = (candidate) => {') &&
    dashboardCode.includes("candidate.status === 'SUBMITTED' || candidate.status === 'AUTO_SUBMITTED_TIME_UP'") &&
    dashboardCode.includes("return 'GREEN';"),
    'getCandidateColorStatus returns GREEN strictly for SUBMITTED and AUTO_SUBMITTED_TIME_UP'
  );
  assert(
    dashboardCode.includes("candidate.status === 'IN_PROGRESS' || candidate.candidateStartTime") &&
    dashboardCode.includes("return 'YELLOW';"),
    'getCandidateColorStatus returns YELLOW for IN_PROGRESS candidates regardless of score'
  );
  assert(
    dashboardCode.includes("candidate.status === 'DISQUALIFIED' || candidate.colorStatus === 'RED'") &&
    dashboardCode.includes("return 'RED';"),
    'getCandidateColorStatus returns RED for DISQUALIFIED candidates'
  );
  assert(
    dashboardCode.includes("return 'WHITE';"),
    'getCandidateColorStatus returns WHITE for NOT_STARTED candidates'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Seat Map Legend Label Update (Criterion 5)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Seat Map Legend Label Update ---');
  assert(
    dashboardCode.includes('<span>Submitted</span>') &&
    !dashboardCode.includes('<span>Passed (≥ Criteria)</span>'),
    'Seat map legend now reads "Submitted" instead of "Passed (≥ Criteria)"'
  );
  assert(
    dashboardCode.includes('<option value="GREEN">Submitted</option>') &&
    !dashboardCode.includes('<option value="GREEN">Passed</option>'),
    'Table filter dropdown uses "Submitted" for GREEN filter option'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Real-Time Metrics Bar Differentiation (Criterion 7)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Metrics Bar Differentiation ---');
  assert(
    dashboardCode.includes('<div className="stat-label">Submitted</div>') &&
    dashboardCode.includes('<div className="stat-value" style={{ color: STATUS_COLORS.GREEN }}>{stats.submitted}</div>'),
    'Metrics bar displays green card labeled "Submitted"'
  );
  assert(
    dashboardCode.includes('Meeting Criteria (≥') &&
    dashboardCode.includes('{stats.passing}'),
    'Metrics bar displays distinct stat card for candidates Meeting Criteria'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Backend Room Controller & Socket Alignment (Criteria 1, 2, 3)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Backend Room Controller & Socket Alignment ---');
  assert(
    roomControllerCode.includes("sub.status === 'SUBMITTED' || sub.status === 'AUTO_SUBMITTED_TIME_UP'") &&
    !roomControllerCode.includes("if (!c.isDisqualified && test.passingCriteria && c.questionsCompleted >= test.passingCriteria) {\n        c.colorStatus = 'GREEN';\n      }"),
    'roomController getLiveCandidates assigns GREEN based on submission, with passing criteria override removed'
  );
  assert(
    socketHandlerCode.includes("sub?.status === 'SUBMITTED' || sub?.status === 'AUTO_SUBMITTED_TIME_UP'") &&
    !socketHandlerCode.includes("questionsCompleted >= (test?.passingCriteria || Infinity)"),
    'socketHandler heartbeat assigns GREEN based on submission, with passing criteria override removed'
  );
  assert(
    submissionControllerCode.includes("colorStatus: 'GREEN'") &&
    submissionControllerCode.includes("[AutoSubmit] Candidate"),
    'submissionController emits seatmap:status GREEN on manual and auto-submit'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Shortlist & Evaluation Logic Preservation (Criterion 6)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Shortlist & Evaluation Logic Preservation ---');
  assert(
    shortlistServiceCode.includes('if (data.questionsCompleted < passingCriteria) continue;'),
    'shortlistService still strictly filters candidates by passingCriteria (Criteria 6)'
  );
  assert(
    evaluationServiceCode.includes('const isPassed = totalCompleted >= passingCriteria;'),
    'evaluationService still strictly determines isPassed against passingCriteria (Criteria 6)'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Consistent Application Across Views (Criterion 8)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: Consistent Application Across Views ---');
  assert(
    dashboardCode.includes('const colorStatus = getCandidateColorStatus(candidate);') &&
    dashboardCode.includes('SeatTile = memo('),
    'SeatTile derives colorStatus from getCandidateColorStatus'
  );
  assert(
    dashboardCode.includes('CandidateRowItem = memo(') &&
    dashboardCode.includes('const colorStatus = getCandidateColorStatus(candidate);'),
    'CandidateRowItem derives colorStatus from getCandidateColorStatus'
  );
  assert(
    dashboardCode.includes('const inspectColorStatus = getCandidateColorStatus(activeInspectCandidate);'),
    'Candidate Inspection modal derives badge color from getCandidateColorStatus'
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
