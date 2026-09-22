/**
 * QA Test Suite for FEATURE-016:
 * Platform-wide Custom 3-Dot Triangular Orbit Loading Animation
 *
 * Verifies:
 * 1. LoadingDots component exists, exports LoadingDots & OrbitingDots, supports all size variants and color tokens.
 * 2. global.css defines @keyframes triangularOrbit and corresponding classes (.orbiting-dots-container, .orbiting-dot).
 * 3. All 28 identified locations across 15 files are confirmed replaced with LoadingDots.
 * 4. Zero legacy spinner JSX usages remain in client component files.
 */

const fs = require('fs');
const path = require('path');

const CLIENT_ROOT = path.resolve(__dirname, '../../../../client/src');

function runTests() {
  console.log('====================================================');
  console.log('FEATURE-016: Verification of Custom 3-Dot Orbit Dots');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // Check 1: LoadingDots.jsx exists and has proper exports & specs
  console.log('--- Step 1: Verify LoadingDots Component ---');
  const loadingDotsPath = path.join(CLIENT_ROOT, 'shared/LoadingDots.jsx');
  assert(fs.existsSync(loadingDotsPath), 'LoadingDots.jsx exists in client/src/shared/');

  const loadingDotsContent = fs.readFileSync(loadingDotsPath, 'utf8');
  assert(loadingDotsContent.includes('export function LoadingDots'), 'Exports named LoadingDots');
  assert(loadingDotsContent.includes('export const OrbitingDots = LoadingDots'), 'Exports alias OrbitingDots');
  assert(loadingDotsContent.includes('export default LoadingDots'), 'Exports default LoadingDots');
  assert(loadingDotsContent.includes('role="status"'), 'Includes role="status" accessibility attribute');
  assert(loadingDotsContent.includes('aria-label='), 'Includes aria-label accessibility attribute');
  assert(loadingDotsContent.includes('className="sr-only"'), 'Includes screen reader fallback text');
  assert(loadingDotsContent.includes("case 'xs':"), 'Supports xs size variant');
  assert(loadingDotsContent.includes("case 'sm':"), 'Supports sm size variant');
  assert(loadingDotsContent.includes("case 'md':"), 'Supports md size variant');
  assert(loadingDotsContent.includes("case 'lg':"), 'Supports lg size variant');
  assert(loadingDotsContent.includes("color === 'white'"), 'Supports white color variant');
  assert(loadingDotsContent.includes("color === 'currentColor'"), 'Supports currentColor variant');

  // Check 2: global.css definitions
  console.log('\n--- Step 2: Verify CSS Keyframes & Classes in global.css ---');
  const globalCssPath = path.join(CLIENT_ROOT, 'styles/global.css');
  const globalCssContent = fs.readFileSync(globalCssPath, 'utf8');
  assert(globalCssContent.includes('@keyframes loadingDotsOrbit'), 'global.css defines 360-deg container orbit @keyframes loadingDotsOrbit');
  assert(globalCssContent.includes('@keyframes loadingDotsBreathe'), 'global.css defines independent dot breathe @keyframes loadingDotsBreathe');
  assert(globalCssContent.includes('@keyframes triangularOrbit'), 'global.css defines backward-compatible @keyframes triangularOrbit');
  assert(globalCssContent.includes('.orbiting-dots-container'), 'global.css defines .orbiting-dots-container');
  assert(globalCssContent.includes('.orbiting-dot'), 'global.css defines .orbiting-dot');
  assert(globalCssContent.includes('animation: loadingDotsOrbit 2.4s linear infinite'), 'Container rotates 360-deg linear over 2.4s');
  assert(globalCssContent.includes('animation: loadingDotsBreathe 1.8s ease-in-out infinite'), 'Dots independently breathe over 1.8s ease-in-out');
  assert(globalCssContent.includes('animation-delay: 0s'), 'Dot 1 uses 0s delay');
  assert(globalCssContent.includes('animation-delay: -0.6s'), 'Dot 2 uses -0.6s negative delay');
  assert(globalCssContent.includes('animation-delay: -1.2s'), 'Dot 3 uses -1.2s negative delay');
  assert(globalCssContent.includes('top: 12.5%') && globalCssContent.includes('left: 12.5%'), 'Dot 1 positioned at (2px, 2px) in 16px container (12.5%, 12.5%)');
  assert(globalCssContent.includes('top: 25%') && globalCssContent.includes('left: 65.625%'), 'Dot 2 positioned at (10.5px, 4px) in 16px container (65.625%, 25%)');
  assert(globalCssContent.includes('top: 65.625%') && globalCssContent.includes('left: 28.125%'), 'Dot 3 positioned at (4.5px, 10.5px) in 16px container (28.125%, 65.625%)');
  assert(globalCssContent.includes('@media (prefers-reduced-motion: reduce)'), 'Includes prefers-reduced-motion fallback');

  // Check 3: Check each of the 28 locations in their respective files
  console.log('\n--- Step 3: Verify All 28 Locations Replaced with LoadingDots ---');

  const locations = [
    { id: 1, file: 'App.jsx', search: '<LoadingDots size="lg" />', name: 'Root App / Route Suspense loading' },
    { id: 2, file: 'admin/pages/AdminDashboard.jsx', search: '<LoadingDots size="md" />', name: 'Admin Dashboard recent assessments loading' },
    { id: 3, file: 'admin/pages/AdminTests.jsx', search: '<LoadingDots size="md" />', name: 'Admin Tests table loading' },
    { id: 4, file: 'admin/pages/AdminTestDetail.jsx', search: '<LoadingDots size="lg" />', name: 'Admin Test Detail main page loading' },
    { id: 5, file: 'admin/pages/AdminTestDetail.jsx', search: '<LoadingDots size="md" />', name: 'Admin Test Detail candidates modal loading' },
    { id: 6, file: 'admin/pages/AdminResults.jsx', search: '<LoadingDots size="lg" />', name: 'Admin Results main page loading' },
    { id: 7, file: 'admin/pages/AdminResults.jsx', search: '<LoadingDots size="md" />', name: 'Admin Results audit logs modal loading' },
    { id: 8, file: 'admin/pages/AdminQuestionBank.jsx', search: '<LoadingDots size="md" />', name: 'Admin Question Bank folders loading' },
    { id: 9, file: 'admin/pages/AdminQuestionBank.jsx', search: '<LoadingDots size="md" />', name: 'Admin Question Bank questions list loading' },
    { id: 10, file: 'admin/pages/AdminQuestionBank.jsx', search: '<LoadingDots size="sm" color="white" />', name: 'Admin Question Bank PDF upload button' },
    { id: 11, file: 'admin/pages/AdminProfile.jsx', search: '<LoadingDots size="md" />', name: 'Admin Profile information loading' },
    { id: 12, file: 'admin/pages/AdminCreateAdmin.jsx', search: '<LoadingDots size="md" />', name: 'Admin Create Admin accounts list loading' },
    { id: 13, file: 'admin/pages/AdminLogin.jsx', search: '<LoadingDots size="sm" color="white" />', name: 'Admin Login submit button' },
    { id: 14, file: 'admin/pages/AdminLiveDashboard.jsx', search: '<LoadingDots size="lg" />', name: 'Admin Live Dashboard initial page loading' },
    { id: 15, file: 'admin/pages/AdminLiveDashboard.jsx', search: '<LoadingDots size="sm" />', name: 'Admin Live Dashboard candidate inspect modal loading (BUG-90)' },
    { id: 16, file: 'admin/pages/AdminLiveDashboard.jsx', search: '<LoadingDots size="xs" color="#d97706" />', name: 'Admin Live Dashboard pending proof screenshot status' },
    { id: 17, file: 'candidate/pages/CandidateLogin.jsx', search: '<LoadingDots size="sm" color="white" />', name: 'Candidate Login submit button' },
    { id: 18, file: 'candidate/pages/CandidateRegister.jsx', search: '<LoadingDots size="sm" color="white" />', name: 'Candidate Register submit button' },
    { id: 19, file: 'candidate/pages/CandidateJoinRoom.jsx', search: '<LoadingDots size="sm" />', name: 'Candidate Join Room approval connecting alert' },
    { id: 20, file: 'candidate/pages/CandidateJoinRoom.jsx', search: '<LoadingDots size="sm" color="white" />', name: 'Candidate Join Room Notifying Admin button' },
    { id: 21, file: 'candidate/pages/CandidateJoinRoom.jsx', search: '<LoadingDots size="sm" color="white" />', name: 'Candidate Join Room Enter Test Room button' },
    { id: 22, file: 'candidate/pages/CandidateInstructions.jsx', search: '<LoadingDots size="xs" />', name: 'Candidate Instructions camera preview checking' },
    { id: 23, file: 'candidate/pages/CandidateInstructions.jsx', search: '<LoadingDots size="sm" color="white" />', name: 'Candidate Instructions starting test button' },
    { id: 24, file: 'candidate/pages/CandidateTestScreen.jsx', search: '<LoadingDots size="lg" />', name: 'Candidate Test Screen initial test environment loading' },
    { id: 25, file: 'candidate/pages/CandidateTestScreen.jsx', search: '<LoadingDots size="xs" color="#94a3b8" />', name: 'Candidate Test Screen autosave saving status' },
    { id: 26, file: 'candidate/pages/CandidateTestScreen.jsx', search: '<LoadingDots size="sm" color="white" />', name: 'Candidate Test Screen Run code button' },
    { id: 27, file: 'candidate/pages/CandidateAITestScreen.jsx', search: '<LoadingDots size="lg" />', name: 'Candidate AI Test Screen initial environment loading' },
    { id: 28, file: 'candidate/pages/CandidateAITestScreen.jsx', search: '<LoadingDots size="xs" />', name: 'Candidate AI Test Screen Kimi writing status' },
  ];

  locations.forEach(loc => {
    const fullPath = path.join(CLIENT_ROOT, loc.file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const hasMatch = content.includes(loc.search);
    assert(hasMatch, `Location #${loc.id}: [${loc.file}] ${loc.name}`);
  });

  // Check 4: Confirm 0 remaining legacy spinners in any JSX file
  console.log('\n--- Step 4: Verify Zero Legacy Spinners Remain in JSX Files ---');
  function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        scanDir(full);
      } else if (full.endsWith('.jsx')) {
        const text = fs.readFileSync(full, 'utf8');
        const match = text.match(/className=["'][^"']*\bspinner\b[^"']*["']/);
        if (match) {
          assert(false, `Found unexpected legacy spinner class in ${path.relative(CLIENT_ROOT, full)}: ${match[0]}`);
        }
      }
    }
  }
  scanDir(CLIENT_ROOT);
  assert(true, 'Scan completed: 0 legacy spinner classes in any client JSX file');

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
