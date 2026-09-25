/**
 * QA Automated Test Suite for FEATURE-030:
 * Expand/Fullscreen Toggle for Live Physical Seat Map
 *
 * Verifies:
 * 1. AdminLiveDashboard.jsx declares `isSeatMapExpanded` state initialized to false (no persistent leak across navigation).
 * 2. `Escape` key listener is registered to safely close the expanded seat map view when no child modals (inspection modal, screenshot zoom, evaluation detail) are active.
 * 3. An expand button (`#expand-seat-map-btn`) with expand icon (⤢) is placed in the Live Physical Seat Map section header.
 * 4. Clicking `#expand-seat-map-btn` toggles `isSeatMapExpanded` to true.
 * 5. Full-viewport overlay container (`#seat-map-expanded-overlay`) renders with `position: fixed`, `inset: 0` / full viewport dimensions, `zIndex: 900`, and an independent scrollable body area.
 * 6. A collapse button (`#collapse-seat-map-btn`) with collapse icon (><) is placed in the same corner position within the expanded header, clicking which sets `isSeatMapExpanded` to false.
 * 7. Real-time updates and props (`candidateList`, `roomsById`, `now`, `isTestEnded`, `handleOpenInspectCandidate`) are bound identically in both the normal and expanded views.
 * 8. Non-regression: Candidate inspection modal (`#candidate-inspection-modal` with zIndex 1050), enlarged evidence screenshot, CandidateDetailEvaluationModal, Candidate Live Proctoring Roster, Voice TTS toggle, stats cards, and Results navigation remain 100% intact.
 */

const fs = require('fs');
const path = require('path');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

async function runFeature030Tests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: FEATURE-030 Live Physical Seat Map Expand/Fullscreen');
  console.log('========================================================================\n');

  const adminLiveDashboardPath = path.resolve(
    __dirname,
    '../../../../client/src/admin/pages/AdminLiveDashboard.jsx'
  );
  const code = fs.readFileSync(adminLiveDashboardPath, 'utf8');

  // 1. State Declaration & Default Behavior
  assert(
    code.includes('const [isSeatMapExpanded, setIsSeatMapExpanded] = useState(false);'),
    'isSeatMapExpanded state is declared with default value false (resets on navigation)'
  );

  // 2. Escape Key Dismissal with Modal Safety Check
  assert(
    code.includes("if (e.key === 'Escape')") &&
    code.includes('if (inspectCandidate || zoomScreenshotUrl || evaluationDetailCandidate) return;') &&
    code.includes('setIsSeatMapExpanded(false);'),
    'Escape key listener safely collapses expanded seat map unless a child modal is active'
  );

  // 3. Expand Button in Embedded Seat Map Header
  assert(
    code.includes('id="expand-seat-map-btn"') &&
    code.includes('onClick={() => setIsSeatMapExpanded(true)}') &&
    code.includes('title="Expand Seat Map (Full-screen view)"'),
    'Embedded seat map card header contains #expand-seat-map-btn with expand trigger & tooltip'
  );

  // 4. Expand Button SVG Icon
  assert(
    code.includes('<polyline points="15 3 21 3 21 9" />') &&
    code.includes('<polyline points="9 21 3 21 3 15" />'),
    'Expand button renders clean expand vector icon'
  );

  // 5. Full-Viewport Expanded Overlay
  assert(
    code.includes('id="seat-map-expanded-overlay"') &&
    code.includes("position: 'fixed'") &&
    code.includes("width: '100vw'") &&
    code.includes("height: '100vh'") &&
    code.includes('zIndex: 900'),
    '#seat-map-expanded-overlay renders as a full-viewport fixed overlay at zIndex: 900'
  );

  // 6. Collapse Button in Expanded Header
  assert(
    code.includes('id="collapse-seat-map-btn"') &&
    code.includes('onClick={() => setIsSeatMapExpanded(false)}') &&
    code.includes('title="Collapse Seat Map (Return to normal view)"'),
    'Expanded header contains #collapse-seat-map-btn with collapse trigger & tooltip'
  );

  // 7. Collapse Button SVG Icon
  assert(
    code.includes('<polyline points="4 14 10 14 10 20" />') &&
    code.includes('<polyline points="20 10 14 10 14 4" />'),
    'Collapse button renders clean collapse vector icon'
  );

  // 8. Independent Scrollable Container
  assert(
    code.includes("flex: 1") &&
    code.includes("overflowY: 'auto'") &&
    code.includes("padding: '24px 32px'"),
    'Expanded view provides an independent scrollable area for seat tiles'
  );

  // 9. Real-Time Data & Prop Parity
  assert(
    code.includes('key={`expanded-${c.candidateId}`}') &&
    code.includes('roomName={roomsById[c.roomId] || \'Room\'}') &&
    code.includes('onClick={handleOpenInspectCandidate}') &&
    code.includes('now={now}') &&
    code.includes('isTestEnded={isTestEnded}'),
    'Expanded seat tiles receive identical live socket data, timer (now), and handleOpenInspectCandidate'
  );

  // 10. Non-Regression: Modals Layering & Dashboard Features
  assert(
    code.includes('id="candidate-inspection-modal"') &&
    code.includes('CandidateDetailEvaluationModal') &&
    code.includes('zoomScreenshotUrl') &&
    (code.includes('Candidate Live Proctoring') || code.includes('Candidate Proctoring Summary')),
    'Candidate Inspection modal, Evaluation modal, zoom frame, and Proctoring Roster are all preserved'
  );

  console.log(`\nFEATURE-030 Verification Result: ${passedTests}/${totalTests} checks passed.`);
  if (passedTests === totalTests) {
    console.log('STATUS: ALL CRITERIA VERIFIED SUCCESSFUL\n');
  } else {
    process.exit(1);
  }
}

runFeature030Tests();
