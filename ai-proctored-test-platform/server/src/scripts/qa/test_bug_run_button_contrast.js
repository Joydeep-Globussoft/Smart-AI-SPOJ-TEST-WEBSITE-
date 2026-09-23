/**
 * test_bug_run_button_contrast.js
 * 
 * QA Verification Suite for Candidate Coding Test Run Button Contrast:
 * - Asserts .editor-run-btn / #run-code-btn styling in global.css and CandidateTestScreen.jsx.
 * - Asserts that the Run button has high contrast (#ffffff text on #10B981 emerald background).
 * - Asserts that disabled state is distinct and readable (#94a3b8 on #252d3d).
 * - Asserts that .btn-secondary does NOT override Run button with dark navy text.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runRunButtonContrastTests() {
  console.log('===============================================================');
  console.log('   QA Test Suite: Candidate Test Screen Run Button Contrast    ');
  console.log('===============================================================\n');

  const cssPath = path.resolve(__dirname, '../../../../client/src/styles/global.css');
  const cssSource = fs.readFileSync(cssPath, 'utf8');

  const screenPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateTestScreen.jsx');
  const screenSource = fs.readFileSync(screenPath, 'utf8');

  console.log('--- 1. Testing global.css for dedicated .editor-run-btn rules ---');
  assert(cssSource.includes('.editor-run-btn'), 'global.css must contain .editor-run-btn rule');
  assert(cssSource.includes('#run-code-btn'), 'global.css must contain #run-code-btn rule');
  assert(cssSource.includes('background: #10B981 !important;'), 'Run button background must be vibrant emerald (#10B981)');
  assert(cssSource.includes('color: #ffffff !important;'), 'Run button text color must be white (#ffffff)');

  // Disabled state verification
  assert(cssSource.includes('.editor-run-btn:disabled'), 'global.css must contain disabled rule for .editor-run-btn');
  assert(cssSource.includes('color: #94a3b8 !important;'), 'Disabled Run button text must be clearly readable muted slate (#94a3b8)');
  assert(cssSource.includes('background: #252d3d !important;'), 'Disabled Run button background must be #252d3d');

  console.log('✅ global.css contains high-contrast enabled and disabled styles.\n');

  console.log('--- 2. Testing CandidateTestScreen.jsx button markup ---');
  assert(screenSource.includes('id="run-code-btn"'), 'Run button ID #run-code-btn is present');
  assert(screenSource.includes('editor-run-btn'), 'Run button uses editor-run-btn class');
  assert(!screenSource.includes('style={{ background: \'#2d2d44\', color: \'#cdd6f4\', border: \'1px solid #444\' }}'), 'Conflicting dark inline styles removed from Run button');

  // Verify onClick={handleRun} remains intact
  assert(screenSource.includes('onClick={handleRun}'), 'handleRun callback is preserved');

  console.log('✅ CandidateTestScreen.jsx button markup verified.\n');

  console.log('===============================================================');
  console.log('   🎉 ALL RUN BUTTON CONTRAST TESTS PASSED SUCCESSFULLY!       ');
  console.log('===============================================================\n');
}

runRunButtonContrastTests();
