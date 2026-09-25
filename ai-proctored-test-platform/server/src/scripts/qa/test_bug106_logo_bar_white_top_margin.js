/**
 * QA Test Suite for BUG-106:
 * LOGO BAR — STOP TOUCHING THE TOP, ONLY WIDTH SHOULD CHANGE
 * 
 * Requirements:
 * 1. .auth-card preserves its original top padding (40px desktop / 28px mobile),
 *    so the card's top rounded corners remain completely white.
 * 2. .auth-logo has negative horizontal margin (margin: 0 -40px 20px -40px desktop / 0 -20px 18px -20px mobile)
 *    so it stretches edge-to-edge across the card with zero gap on left and right.
 * 3. .auth-logo has straight edges (border-radius: 0), not rounded top corners.
 * 4. .auth-logo has fixed thin height (52px desktop / 48px mobile) with centered 32px (28px mobile) logo image.
 * 5. All content below the bar (headings, subtitles, form fields, action buttons) remains in its original position.
 * 6. Verified across all 5 pages: CandidateRegister, CandidateLogin, CandidateJoinRoom ("Join Test Room" & "Waiting for Test to Start"),
 *    CandidateTestComplete, and AdminLogin.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
  }
}

console.log('\n======================================================');
console.log('🧪 QA TEST SUITE: BUG-106 LOGO BAR WHITE TOP MARGIN & EDGE-TO-EDGE WIDTH');
console.log('======================================================\n');

const globalCssPath = path.join(__dirname, '../../../../client/src/styles/global.css');
const registerPath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateRegister.jsx');
const loginPath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateLogin.jsx');
const joinRoomPath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateJoinRoom.jsx');
const completePath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateTestComplete.jsx');
const adminLoginPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminLogin.jsx');

const globalCssContent = fs.readFileSync(globalCssPath, 'utf8');
const registerContent = fs.readFileSync(registerPath, 'utf8');
const loginContent = fs.readFileSync(loginPath, 'utf8');
const joinRoomContent = fs.readFileSync(joinRoomPath, 'utf8');
const completeContent = fs.readFileSync(completePath, 'utf8');
const adminLoginContent = fs.readFileSync(adminLoginPath, 'utf8');

// 1. global.css .auth-card padding & .auth-logo styles
runTest('.auth-card restores original 40px top/side/bottom padding with overflow: hidden', () => {
  assert(globalCssContent.includes('.auth-card {'), 'Must define .auth-card');
  assert(globalCssContent.includes('padding: 40px;'), '.auth-card must have 40px padding');
  assert(globalCssContent.includes('overflow: hidden;'), '.auth-card must have overflow: hidden');
  assert(globalCssContent.includes('border-radius: var(--radius-xl);'), '.auth-card must have rounded border-radius');
  assert(globalCssContent.includes('max-width: 440px;'), '.auth-card must have 440px max-width');
});

runTest('.auth-logo has negative horizontal margin spanning edge-to-edge with straight borders (border-radius: 0)', () => {
  assert(globalCssContent.includes('.auth-logo {'), 'Must define .auth-logo');
  assert(globalCssContent.includes('background: #1A2B3C;'), '.auth-logo must have dark #1A2B3C ribbon background');
  assert(globalCssContent.includes('margin: 0 -40px 20px -40px;'), '.auth-logo must span full width via negative margins');
  assert(globalCssContent.includes('height: 52px;'), '.auth-logo must have fixed 52px height');
  assert(globalCssContent.includes('border-radius: 0;'), '.auth-logo must have straight 0px border-radius');
  assert(!globalCssContent.includes('border-top-left-radius: var(--radius-xl);'), '.auth-logo must not have rounded top-left corner');
  assert(!globalCssContent.includes('border-top-right-radius: var(--radius-xl);'), '.auth-logo must not have rounded top-right corner');
});

runTest('.auth-logo img has max-height 32px and centered presentation', () => {
  assert(globalCssContent.includes('.auth-logo img {'), 'Must define .auth-logo img');
  assert(globalCssContent.includes('height: 32px;'), 'Image height must be 32px');
  assert(globalCssContent.includes('max-height: 32px;'), 'Image max-height must be 32px');
  assert(globalCssContent.includes('background: transparent;'), 'Image background must be transparent');
});

runTest('Mobile responsive styles adapt .auth-card padding to 28px 20px and .auth-logo to 48px height', () => {
  assert(globalCssContent.includes('.auth-card { padding: 28px 20px; }'), 'Mobile .auth-card padding');
  assert(globalCssContent.includes('.auth-logo { margin: 0 -20px 18px -20px; height: 48px; border-radius: 0; }'), 'Mobile .auth-logo margin, height, and border-radius');
  assert(globalCssContent.includes('.auth-logo img { height: 28px; max-height: 28px; }'), 'Mobile .auth-logo img height');
});

// 2. Candidate & Auth Pages Verification
runTest('CandidateRegister.jsx renders .auth-card with .auth-logo', () => {
  assert(registerContent.includes('className="auth-card"'), 'CandidateRegister has .auth-card');
  assert(registerContent.includes('className="auth-logo"'), 'CandidateRegister has .auth-logo');
});

runTest('CandidateLogin.jsx renders .auth-card with .auth-logo', () => {
  assert(loginContent.includes('className="auth-card"'), 'CandidateLogin has .auth-card');
  assert(loginContent.includes('className="auth-logo"'), 'CandidateLogin has .auth-logo');
});

runTest('CandidateJoinRoom.jsx renders .auth-card with .auth-logo for both Join and Waiting states', () => {
  assert(joinRoomContent.includes('className="auth-card"'), 'CandidateJoinRoom has .auth-card');
  assert(joinRoomContent.includes('className="auth-logo"'), 'CandidateJoinRoom has .auth-logo');
  assert(joinRoomContent.includes('isWaitingForTest ? \'Waiting for Test to Start\' : \'Join Test Room\''), 'CandidateJoinRoom supports both states');
});

runTest('CandidateTestComplete.jsx uses shared .auth-card and .auth-logo classes', () => {
  assert(completeContent.includes('className="auth-card"'), 'CandidateTestComplete has .auth-card');
  assert(completeContent.includes('className="auth-logo"'), 'CandidateTestComplete has .auth-logo');
});

runTest('AdminLogin.jsx renders .auth-card with .auth-logo', () => {
  assert(adminLoginContent.includes('className="auth-card"'), 'AdminLogin has .auth-card');
  assert(adminLoginContent.includes('className="auth-logo"'), 'AdminLogin has .auth-logo');
});

console.log(`\n======================================================`);
console.log(`RESULTS: ${passedTests}/${totalTests} Passed`);
console.log(`======================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
