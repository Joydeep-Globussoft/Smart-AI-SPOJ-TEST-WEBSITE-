/**
 * QA Test Suite for FEATURE-042:
 * Logo Header — Expand to Full-Width Ribbon/Bar on Candidate Pages
 * 
 * Requirements:
 * 1. On every candidate-facing page using the white card with logo (Register, Sign In, Join Room/Waiting, Test Submitted),
 *    the dark background container spans the full width of the card edge to edge.
 * 2. The bar's top corners match the card's rounded corners (top-left & top-right rounded, sides flush).
 * 3. Logo centered with clean vertical padding.
 * 4. Responsive at both desktop and mobile widths.
 * 5. Admin panel navbar/logo remains unaffected.
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
console.log('🧪 QA TEST SUITE: FEATURE-042 LOGO HEADER FULL-WIDTH RIBBON');
console.log('======================================================\n');

const globalCssPath = path.join(__dirname, '../../../../client/src/styles/global.css');
const registerPath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateRegister.jsx');
const loginPath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateLogin.jsx');
const joinRoomPath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateJoinRoom.jsx');
const completePath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateTestComplete.jsx');
const adminNavbarPath = path.join(__dirname, '../../../../client/src/shared/AdminNavbar.jsx');

const globalCssContent = fs.readFileSync(globalCssPath, 'utf8');
const registerContent = fs.readFileSync(registerPath, 'utf8');
const loginContent = fs.readFileSync(loginPath, 'utf8');
const joinRoomContent = fs.readFileSync(joinRoomPath, 'utf8');
const completeContent = fs.readFileSync(completePath, 'utf8');
const adminNavbarContent = fs.readFileSync(adminNavbarPath, 'utf8');

// 1. global.css .auth-card & .auth-logo ribbon definition
runTest('.auth-card is styled with overflow: hidden and 0 top padding', () => {
  assert(globalCssContent.includes('.auth-card {'), 'Must define .auth-card');
  assert(globalCssContent.includes('padding: 0 40px 40px 40px;'), '.auth-card padding must be flush on top');
  assert(globalCssContent.includes('overflow: hidden;'), '.auth-card must have overflow: hidden');
  assert(globalCssContent.includes('border-radius: var(--radius-xl);'), '.auth-card must have rounded border-radius');
});

runTest('.auth-logo is styled as a full-width header ribbon with matching top border-radius', () => {
  assert(globalCssContent.includes('.auth-logo {'), 'Must define .auth-logo');
  assert(globalCssContent.includes('background: #1A2B3C;'), '.auth-logo must have dark #1A2B3C ribbon background');
  assert(globalCssContent.includes('margin: 0 -40px 24px -40px;'), '.auth-logo must have negative margin spanning card width');
  assert(globalCssContent.includes('border-top-left-radius: var(--radius-xl);'), '.auth-logo must round top-left corner');
  assert(globalCssContent.includes('border-top-right-radius: var(--radius-xl);'), '.auth-logo must round top-right corner');
});

runTest('.auth-logo img is cleanly centered with transparent background and no inner box shadow', () => {
  assert(globalCssContent.includes('.auth-logo img {'), 'Must define .auth-logo img');
  assert(globalCssContent.includes('background: transparent;'), 'Image background must be transparent');
  assert(globalCssContent.includes('box-shadow: none;'), 'Image must have box-shadow: none');
});

runTest('Mobile responsive styles adapt .auth-card padding and .auth-logo margin/padding', () => {
  assert(globalCssContent.includes('.auth-card { padding: 0 20px 28px 20px; }'), 'Mobile .auth-card padding');
  assert(globalCssContent.includes('.auth-logo { margin: 0 -20px 20px -20px; padding: 14px 16px; }'), 'Mobile .auth-logo margin & padding');
});

// 2. Candidate Pages Card & Logo Verification
runTest('CandidateRegister.jsx renders .auth-card with .auth-logo ribbon', () => {
  assert(registerContent.includes('className="auth-card"'), 'CandidateRegister has .auth-card');
  assert(registerContent.includes('className="auth-logo"'), 'CandidateRegister has .auth-logo');
});

runTest('CandidateLogin.jsx renders .auth-card with .auth-logo ribbon', () => {
  assert(loginContent.includes('className="auth-card"'), 'CandidateLogin has .auth-card');
  assert(loginContent.includes('className="auth-logo"'), 'CandidateLogin has .auth-logo');
});

runTest('CandidateJoinRoom.jsx renders .auth-card with .auth-logo ribbon', () => {
  assert(joinRoomContent.includes('className="auth-card"'), 'CandidateJoinRoom has .auth-card');
  assert(joinRoomContent.includes('className="auth-logo"'), 'CandidateJoinRoom has .auth-logo');
});

runTest('CandidateTestComplete.jsx renders full-width dark ribbon with matching 24px top border-radius', () => {
  assert(completeContent.includes('background: \'#1A2B3C\''), 'CandidateTestComplete has #1A2B3C ribbon');
  assert(completeContent.includes('margin: \'0 -40px 28px -40px\''), 'CandidateTestComplete ribbon spans full card width');
  assert(completeContent.includes('borderTopLeftRadius: 24'), 'CandidateTestComplete matches 24px top-left radius');
  assert(completeContent.includes('borderTopRightRadius: 24'), 'CandidateTestComplete matches 24px top-right radius');
});

// 3. Admin Navbar Non-Regression
runTest('AdminNavbar.jsx remains untouched and independent', () => {
  assert(adminNavbarContent.includes('className="navbar-brand"'), 'AdminNavbar retains .navbar-brand');
  assert(adminNavbarContent.includes('className="navbar"'), 'AdminNavbar retains .navbar');
});

console.log(`\n======================================================`);
console.log(`RESULTS: ${passedTests}/${totalTests} Passed`);
console.log(`======================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
