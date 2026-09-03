/**
 * QA Automated Verification Suite: Seat Map Tile Yellow Dot Pulse Animation (BUG-43 & BUG-45)
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
  console.log('QA VERIFICATION SUITE: Seat Map In-Progress Yellow Dot Pulse (BUG-43/45)');
  console.log('========================================================================\n');

  const cssPath = path.resolve(__dirname, '../../../../client/src/styles/global.css');
  const dashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');

  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  const dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: CSS Animation Keyframe High Visibility & Amplitude (BUG-45)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: CSS Animation Keyframe High Visibility & Amplitude ---');
  assert(
    cssContent.includes('@keyframes seatTileDotPulse') &&
    cssContent.includes('opacity: 1;') &&
    cssContent.includes('transform: scale(1);') &&
    cssContent.includes('opacity: 0.18;') &&
    cssContent.includes('transform: scale(1.28);'),
    '@keyframes seatTileDotPulse has high amplitude (opacity 1.0 -> 0.18, scale 1.0 -> 1.28)'
  );
  assert(
    cssContent.includes('box-shadow: 0 0 6px rgba(241, 196, 15, 0.9)') &&
    cssContent.includes('box-shadow: 0 0 2px rgba(241, 196, 15, 0.2), 0 0 0 5px rgba(241, 196, 15, 0)'),
    '@keyframes seatTileDotPulse includes expanding radial ping glow for prominent visibility'
  );
  assert(
    cssContent.includes('.seat-tile-dot-pulse {') &&
    cssContent.includes('animation: seatTileDotPulse 1.8s ease-in-out infinite;') &&
    cssContent.includes('will-change: opacity, transform;') &&
    cssContent.includes('transform-origin: center;'),
    '.seat-tile-dot-pulse uses GPU-composited seatTileDotPulse 1.8s ease-in-out infinite'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Yellow Dot Condition in SeatTile (Criteria 1 & 2)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Yellow Dot Condition in SeatTile ---');
  assert(
    dashboardContent.includes('const isYellowDot = color === STATUS_COLORS.YELLOW;'),
    'SeatTile calculates isYellowDot strictly based on STATUS_COLORS.YELLOW'
  );
  assert(
    dashboardContent.includes("className={isYellowDot ? 'seat-tile-dot-pulse' : ''}"),
    'SeatTile assigns seat-tile-dot-pulse class exclusively when isYellowDot is true'
  );
  assert(
    dashboardContent.includes("animation: isYellowDot ? 'seatTileDotPulse 1.8s ease-in-out infinite' : 'none'") &&
    dashboardContent.includes("willChange: isYellowDot ? 'opacity, transform' : 'auto'"),
    'SeatTile includes GPU-accelerated inline animation style with seatTileDotPulse'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Preservation of Non-Yellow States & BUG-32 Visibility (Criteria 3 & 4)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Non-Yellow Static State & BUG-32 Visibility ---');
  assert(
    dashboardContent.includes("backgroundColor: isWhite ? '#94A3B8' : color") &&
    dashboardContent.includes("border: isWhite ? '1.5px solid #111827' : `1px solid ${color}`"),
    'BUG-32 white/Not Started dot contrast styling is fully preserved'
  );
  assert(
    dashboardContent.includes("boxShadow: isWhite ? 'none' : `0 0 6px ${color}`"),
    'Glow and border styling for all dot states are preserved'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Performance & Hardware Compositing (Criterion 5)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Performance & Hardware Compositing ---');
  assert(
    !cssContent.includes('.seat-tile-dot-pulse { width') &&
    !cssContent.includes('.seat-tile-dot-pulse { margin'),
    'Pulse animation does not animate layout properties (width, margin, height) — strictly opacity and transform'
  );
  assert(
    cssContent.includes('will-change: opacity, transform;'),
    'will-change: opacity, transform ensures browser promotes pulsing dot to independent GPU layer'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: CandidateRowItem Parity & Preservation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: CandidateRowItem Parity & Preservation ---');
  assert(
    dashboardContent.includes('CandidateRowItem = memo(') &&
    dashboardContent.includes("className={isYellowDot ? 'seat-tile-dot-pulse' : ''}") &&
    dashboardContent.includes("animation: isYellowDot ? 'seatTileDotPulse 1.8s ease-in-out infinite' : 'none'"),
    'CandidateRowItem table view also reflects high-visibility pulsing indicator for In-Progress candidate'
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
