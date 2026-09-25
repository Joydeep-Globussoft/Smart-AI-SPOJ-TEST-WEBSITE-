/**
 * QA Test Suite for BUG-107:
 * LOGO BAR — REMOVE WHITE EDGE GAPS + INCREASE LOGO SIZE
 * 
 * Requirements:
 * 1. .auth-card preserves 40px top padding (white space above bar) on desktop and 28px 20px on mobile.
 * 2. .auth-logo uses margin-left: -50px, margin-right: -50px and width: calc(100% + 100px) on desktop
 *    (and -30px / calc(100% + 60px) on mobile) to ensure zero subpixel white line/gap at card edges.
 * 3. .auth-logo has straight edges (border-radius: 0) and height: 60px (desktop) / 52px (mobile).
 * 4. .auth-logo img is enlarged to height: 42px; max-height: 42px (desktop) and 36px (mobile)
 *    so it is visually prominent and comfortably fit.
 * 5. Content below the bar remains in original vertical position/spacing.
 * 6. Verified across all candidate card pages and admin login.
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
console.log('🧪 QA TEST SUITE: BUG-107 EDGE FLUSH & ENLARGED LOGO');
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
runTest('.auth-card preserves 40px top/side/bottom padding with overflow: hidden', () => {
  assert(globalCssContent.includes('.auth-card {'), 'Must define .auth-card');
  assert(globalCssContent.includes('padding: 40px;'), '.auth-card must have 40px padding');
  assert(globalCssContent.includes('overflow: hidden;'), '.auth-card must have overflow: hidden');
  assert(globalCssContent.includes('border-radius: var(--radius-xl);'), '.auth-card must have rounded border-radius');
  assert(globalCssContent.includes('max-width: 440px;'), '.auth-card must have 440px max-width');
});

runTest('.auth-logo has expanded negative margins (-50px) and calc width to eliminate edge gaps', () => {
  assert(globalCssContent.includes('.auth-logo {'), 'Must define .auth-logo');
  assert(globalCssContent.includes('background: #1A2B3C;'), '.auth-logo must have dark #1A2B3C ribbon background');
  assert(globalCssContent.includes('margin-left: -50px;'), '.auth-logo must have margin-left: -50px');
  assert(globalCssContent.includes('margin-right: -50px;'), '.auth-logo must have margin-right: -50px');
  assert(globalCssContent.includes('width: calc(100% + 100px);'), '.auth-logo must have width: calc(100% + 100px)');
  assert(globalCssContent.includes('height: 60px;'), '.auth-logo height increased to 60px to comfortably fit enlarged logo');
  assert(globalCssContent.includes('border-radius: 0;'), '.auth-logo must have straight 0px border-radius');
});

runTest('.auth-logo img is enlarged to 42px height (desktop) with transparent background', () => {
  assert(globalCssContent.includes('.auth-logo img {'), 'Must define .auth-logo img');
  assert(globalCssContent.includes('height: 42px;'), 'Image height must be 42px');
  assert(globalCssContent.includes('max-height: 42px;'), 'Image max-height must be 42px');
  assert(globalCssContent.includes('background: transparent;'), 'Image background must be transparent');
});

runTest('Mobile responsive styles adapt .auth-card padding to 28px 20px, .auth-logo to 52px height, and img to 36px', () => {
  assert(globalCssContent.includes('.auth-card { padding: 28px 20px; }'), 'Mobile .auth-card padding');
  assert(globalCssContent.includes('margin-left: -30px; margin-right: -30px;'), 'Mobile .auth-logo negative margin');
  assert(globalCssContent.includes('width: calc(100% + 60px); height: 52px;'), 'Mobile .auth-logo width & height');
  assert(globalCssContent.includes('.auth-logo img { height: 36px; max-height: 36px; }'), 'Mobile .auth-logo img height 36px');
});

// 2. Candidate & Auth Pages Verification
runTest('CandidateRegister.jsx renders .auth-card with .auth-logo and CSS-managed logo sizing', () => {
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
