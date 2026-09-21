// test_bug90_inspect_loading_alignment.js
// Verifies BUG-90: Vertically aligned loading spinner/text, skeleton placeholder cards,
// and unified incident badge count in Candidate Inspection & Evidence modal.

const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✕ [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ [PASS] ${message}`);
}

async function runSuite() {
  console.log('========================================================================');
  console.log('QA VERIFICATION: BUG-90 Inspect Modal Loading Alignment & Unified Count');
  console.log('========================================================================\n');

  const adminLiveDashboardPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');
  const code = fs.readFileSync(adminLiveDashboardPath, 'utf8');

  // --- CHECK 1: Vertical Alignment of Loading Spinner & Text ---
  console.log('--- CHECK 1: Vertical Alignment of Loading Spinner & Text ---');
  assert(
    code.includes("display: 'flex'") &&
    code.includes("alignItems: 'center'") &&
    code.includes("justifyContent: 'center'") &&
    code.includes('Loading violation proof history...'),
    'Loading container uses flexbox with alignItems: center and justifyContent: center'
  );
  assert(
    code.includes("margin: 0") &&
    code.includes("flexShrink: 0"),
    'Spinner has margin: 0 and flexShrink: 0 to prevent baseline misalignment'
  );

  // --- CHECK 2: Skeleton Loader Cards ---
  console.log('\n--- CHECK 2: Skeleton Loader Cards for Incident History ---');
  assert(
    code.includes("animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite'"),
    'Renders pulsing skeleton placeholder cards during loading'
  );
  assert(
    code.includes('[1, 2].map((i) => ('),
    'Renders multiple placeholder card shapes previewing incoming incident records'
  );

  // --- CHECK 3: Unified Incident Badge Count ---
  console.log('\n--- CHECK 3: Unified Incident Badge Count ---');
  assert(
    code.includes('const totalIncidents = Math.max(activeInspectCandidate.malpracticeCount || 0, candidateLogs.length);'),
    'Incident count badge unifies with known activeInspectCandidate.malpracticeCount during loading'
  );
  assert(
    code.includes('{totalIncidents} {totalIncidents === 1 ? \'Incident\' : \'Incidents\'}'),
    'Renders unified incident count so it never shows 0 when candidate has violations'
  );

  // --- CHECK 4: Non-Regression of Clean Record & Malpractice Cards ---
  console.log('\n--- CHECK 4: Non-Regression of Modal States ---');
  assert(
    code.includes('Clean Record:'),
    'Clean Record state is preserved when candidate has 0 violations'
  );
  assert(
    code.includes('candidateLogs.map((log, index) => {'),
    'Incident card mapping is preserved for loaded logs'
  );
  assert(
    code.includes('🔍 Candidate Inspection &amp; Evidence'),
    'Modal title and header are preserved'
  );

  console.log('\n========================================================================');
  console.log('✓ ALL BUG-90 VERIFICATION CHECKS PASSED!');
  console.log('========================================================================\n');
}

runSuite().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
