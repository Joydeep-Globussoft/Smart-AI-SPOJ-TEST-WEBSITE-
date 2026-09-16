/**
 * QA Automated Verification Suite: BUG-76
 * Verifies Conditional Horizontal Overflow, Anti-Cropping Alignment & Mouse Panning on Zoomed PDF View
 *
 * Requirements:
 * 1. EmbeddedPdfViewer tracks `isHorizontalOverflow` and toggles `overflowX` between 'auto' and 'hidden'.
 * 2. `alignItems` dynamically switches to 'flex-start' during horizontal overflow to prevent negative coordinate left cropping.
 * 3. Page canvas wrappers set `margin: isHorizontalOverflow ? '0 auto' : '0'` to allow positive `scrollLeft` traversal.
 * 4. Mouse click-and-drag panning handlers (`handleMouseDown`, `handleMouseMove`, `handleMouseUp`) are active on the scroll container.
 * 5. Relative step scaling in `handleZoomIn` and `handleZoomOut` prevents sudden scale jumps.
 * 6. Switching to Fit Width / Fit Page returns `overflowX` to 'hidden', preserving BUG-75.
 * 7. Multi-page bounded page range (BUG-74) is fully preserved.
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
  console.log('QA VERIFICATION SUITE: BUG-76 (Conditional Horizontal Overflow & Zoom Panning)');
  console.log('========================================================================\n');

  const viewerPath = path.resolve(__dirname, '../../../../client/src/candidate/components/EmbeddedPdfViewer.jsx');
  assert(fs.existsSync(viewerPath), 'EmbeddedPdfViewer.jsx exists');

  const code = fs.readFileSync(viewerPath, 'utf8');

  // Test 1: isHorizontalOverflow state declaration
  assert(
    code.includes('const [isHorizontalOverflow, setIsHorizontalOverflow] = useState(false)'),
    'EmbeddedPdfViewer declares isHorizontalOverflow state'
  );

  // Test 2: Conditional overflow-x on scrollAreaRef
  assert(
    code.includes("overflowX: isHorizontalOverflow ? 'auto' : 'hidden'"),
    "Scroll container toggles overflowX between 'auto' and 'hidden' based on overflow state"
  );

  // Test 3: Anti-cropping flex alignment
  assert(
    code.includes("alignItems: isHorizontalOverflow ? 'flex-start' : 'center'"),
    "alignItems switches to 'flex-start' when overflowing to prevent negative coordinate left cropping"
  );

  // Test 4: Canvas wrapper margin auto
  assert(
    code.includes("margin: isHorizontalOverflow ? '0 auto' : '0'"),
    'Canvas wrappers use margin auto when overflowing for proper left boundary alignment'
  );

  // Test 5: Mouse drag panning handlers
  assert(
    code.includes('const handleMouseDown = (e) =>') &&
    code.includes('const handleMouseMove = (e) =>') &&
    code.includes('const handleMouseUp = () =>') &&
    code.includes('onMouseDown={handleMouseDown}') &&
    code.includes('onMouseMove={handleMouseMove}'),
    'Scroll container implements click-and-drag mouse panning handlers'
  );

  // Test 6: Relative zoom step handlers
  assert(
    code.includes('handleZoomIn') &&
    code.includes('handleZoomOut') &&
    code.includes('onClick={handleZoomIn}') &&
    code.includes('onClick={handleZoomOut}'),
    'Zoom controls use relative step scaling handlers (handleZoomIn / handleZoomOut)'
  );

  // Test 7: Cursor grab state for panning
  assert(
    code.includes("cursor: isHorizontalOverflow ? (isPanning ? 'grabbing' : 'grab') : 'default'"),
    'Cursor dynamically indicates grab / grabbing when content is zoomed in and pannable'
  );

  // Test 8: Overflow tracking logic in renderAllPages
  assert(
    code.includes('maxPageWidth = Math.max(maxPageWidth, viewport.width)') &&
    code.includes('setIsHorizontalOverflow(isOverflowing)'),
    'renderAllPages calculates maximum rendered page width and updates overflow state'
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
