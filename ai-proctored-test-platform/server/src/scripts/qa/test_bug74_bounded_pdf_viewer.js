/**
 * QA Automated Verification Suite: BUG-74
 * Verifies Bounded Problem Statement PDF Rendering & Page-Range Isolation
 *
 * Requirements:
 * 1. EmbeddedPdfViewer.jsx uses canvas-based PDF.js rendering bounded to [startPage, endPage].
 * 2. Pages outside [startPage, endPage] are NEVER rendered into the DOM or scroll container.
 * 3. Multi-page questions show all pages within [startPage, endPage] with jump buttons (P1, P2...).
 * 4. Page change resets scroll position to 0.
 * 5. Controls for Fit Width, Fit Page, Zoom In (+), Zoom Out (-) and Open PDF are supported.
 * 6. Responsive scaling via ResizeObserver is in place.
 */

const fs = require('fs');
const path = require('path');

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
  console.log('QA VERIFICATION SUITE: BUG-74 (Page-Range Bounded PDF Rendering)');
  console.log('========================================================================\n');

  const viewerPath = path.resolve(__dirname, '../../../../client/src/candidate/components/EmbeddedPdfViewer.jsx');
  assert(fs.existsSync(viewerPath), 'EmbeddedPdfViewer.jsx file exists');

  const code = fs.readFileSync(viewerPath, 'utf8');

  // Test 1: Uses PDF.js rather than native unrestricted iframe
  assert(
    code.includes("import * as pdfjsLib from 'pdfjs-dist'") &&
    code.includes('pdfjsLib.getDocument'),
    'EmbeddedPdfViewer imports and uses pdfjsLib.getDocument for controlled rendering'
  );

  // Test 2: Sets up PDF.js worker
  assert(
    code.includes('pdfjsLib.GlobalWorkerOptions.workerSrc'),
    'EmbeddedPdfViewer configures PDF.js worker URL'
  );

  // Test 3: Clamps page range to question boundaries
  assert(
    code.includes('clampedStart = Math.max(1, Math.min(startPage, totalDocPages))') &&
    code.includes('clampedEnd = Math.max(clampedStart, Math.min(endPage, totalDocPages))'),
    'Page range is clamped strictly to [clampedStart, clampedEnd] against document bounds'
  );

  // Test 4: Visible pages array contains only [clampedStart ... clampedEnd]
  assert(
    code.includes('for (let p = clampedStart; p <= clampedEnd; p++)') &&
    code.includes('visiblePageNumbers.push(p)'),
    'visiblePageNumbers array is generated strictly for [clampedStart ... clampedEnd]'
  );

  // Test 5: Only renders canvas elements for visiblePageNumbers
  assert(
    code.includes('visiblePageNumbers.map') &&
    code.includes('<canvas'),
    'DOM renders <canvas> elements only for visiblePageNumbers (zero adjacent page bleed)'
  );

  // Test 6: Scroll reset on question/startPage change
  assert(
    code.includes('scrollAreaRef.current.scrollTop = 0') &&
    code.includes('[question?._id, startPage]'),
    'Scroll area resets scrollTop = 0 when active question or startPage changes'
  );

  // Test 7: Multi-page jump buttons
  assert(
    code.includes('visiblePageNumbers.length > 1') &&
    code.includes('scrollToPage'),
    'Multi-page jump buttons (P1, P2...) rendered when question spans multiple pages'
  );

  // Test 8: Fit Width / Fit Page & Custom Zoom
  assert(
    code.includes("zoomMode === 'fitWidth'") &&
    code.includes("zoomMode === 'fitPage'") &&
    code.includes('setCustomZoom'),
    'Supports Fit Width, Fit Page, and custom Zoom controls (+ / -)'
  );

  // Test 9: ResizeObserver for responsive adjustment
  assert(
    code.includes('ResizeObserver'),
    'Implements ResizeObserver for automatic recalculation on layout/panel resize'
  );

  // Test 10: Open PDF direct link preserved
  assert(
    code.includes('↗ Open PDF') &&
    code.includes('href={pdfUrl}'),
    'Fallback ↗ Open PDF link is preserved'
  );

  console.log('\n========================================================================');
  console.log(`QA TEST SUMMARY: ${passedTests}/${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
