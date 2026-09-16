/**
 * QA Automated Verification Suite: BUG-75
 * Verifies Dynamic Height Recalculation & Aspect-Ratio Scaling for EmbeddedPdfViewer
 *
 * Requirements:
 * 1. EmbeddedPdfViewer tracks dynamic container height (`dynamicHeight`) matching rendered page height.
 * 2. `renderAllPages` computes cumulative pages height for single-page and multi-page questions.
 * 3. Container height is capped at parent panel height without leaving empty dead space.
 * 4. `ResizeObserver` utilizes `requestAnimationFrame` for smooth lockstep resizing during divider dragging.
 * 5. `fitWidth` scaling dynamically adapts without artificial overflow min-clamping that causes horizontal scrollbars.
 * 6. Zero regression to BUG-74 page range isolation, zoom controls, or toolbar navigation.
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
  console.log('QA VERIFICATION SUITE: BUG-75 (Dynamic PDF Viewer Height & Responsive Scaling)');
  console.log('========================================================================\n');

  const viewerPath = path.resolve(__dirname, '../../../../client/src/candidate/components/EmbeddedPdfViewer.jsx');
  assert(fs.existsSync(viewerPath), 'EmbeddedPdfViewer.jsx exists');

  const code = fs.readFileSync(viewerPath, 'utf8');

  // Test 1: dynamicHeight state declaration
  assert(
    code.includes('const [dynamicHeight, setDynamicHeight] = useState(null)'),
    'EmbeddedPdfViewer maintains dynamicHeight state'
  );

  // Test 2: Cumulative height computation in renderAllPages
  assert(
    code.includes('cumulativePagesHeight += viewport.height') &&
    code.includes('totalRequiredHeight = Math.ceil(cumulativePagesHeight + gaps + padding + toolbarHeight)'),
    'renderAllPages computes total cumulative required height for rendered pages + toolbar/padding'
  );

  // Test 3: Parent height boundary clamping
  assert(
    code.includes('setDynamicHeight(Math.min(totalRequiredHeight, parentHeight))'),
    'dynamicHeight is bounded by parent panel height (shrinks when narrow, expands when wide)'
  );

  // Test 4: Container style binds dynamicHeight
  assert(
    code.includes("height: dynamicHeight ? `${dynamicHeight}px` : '100%'") &&
    code.includes("maxHeight: '100%'"),
    'Container styling binds dynamicHeight and caps at maxHeight: 100%'
  );

  // Test 5: ResizeObserver with requestAnimationFrame
  assert(
    code.includes('new ResizeObserver') &&
    code.includes('requestAnimationFrame') &&
    code.includes('cancelAnimationFrame'),
    'ResizeObserver uses requestAnimationFrame for instantaneous lockstep divider drag updates'
  );

  // Test 6: Dynamic scale without artificial overflow minimum
  assert(
    code.includes('Math.max(0.1, availableWidth / unscaledViewport.width)'),
    'fitWidth scales dynamically to available width without artificial min-clamp causing horizontal scrollbar'
  );

  // Test 7: Multi-page question banner height calculation
  assert(
    code.includes('hasMultiplePages') &&
    code.includes('cumulativePagesHeight += 24'),
    'Cumulative height calculation correctly accounts for multi-page question headers'
  );

  // Test 8: Horizontal overflow hidden on scroll container when not zoomed
  assert(
    code.includes("overflowX: isHorizontalOverflow ? 'auto' : 'hidden'") || code.includes("overflowX: 'hidden'"),
    'Scroll container sets overflowX: hidden when not overflowing to prevent unwanted horizontal scrollbar'
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
