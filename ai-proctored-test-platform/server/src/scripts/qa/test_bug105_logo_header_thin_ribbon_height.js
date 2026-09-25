/**
 * QA Test Suite for BUG-105:
 * FEATURE-042 IMPLEMENTED WRONG — BAR HEIGHT GREW, ONLY WIDTH SHOULD HAVE CHANGED
 * 
 * Requirements:
 * 1. Dark logo bar is THIN, matching the original small box height (52px desktop / 48px mobile),
 *    while stretching full width edge-to-edge with matching rounded top corners.
 * 2. Logo image inside is 32px desktop / 28px mobile.
 * 3. Content below the bar (headings, subtitles, form fields) remains in original vertical position/spacing.
 * 4. Applied across all candidate-facing & auth card pages:
 *    - CandidateRegister.jsx
 *    - CandidateLogin.jsx
 *    - CandidateJoinRoom.jsx
 *    - CandidateTestComplete.jsx
 *    - AdminLogin.jsx
 * 5. Non-regression: AdminNavbar and candidate test screen remains unaffected.
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
console.log('🧪 QA TEST SUITE: BUG-105 THIN LOGO HEADER RIBBON HEIGHT');
console.log('======================================================\n');

const globalCssPath = path.join(__dirname, '../../../../client/src/styles/global.css');
const registerPath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateRegister.jsx');
const loginPath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateLogin.jsx');
const joinRoomPath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateJoinRoom.jsx');
const completePath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateTestComplete.jsx');
const adminLoginPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminLogin.jsx');
const adminNavbarPath = path.join(__dirname, '../../../../client/src/shared/AdminNavbar.jsx');

const globalCssContent = fs.readFileSync(globalCssPath, 'utf8');
const registerContent = fs.readFileSync(registerPath, 'utf8');
const loginContent = fs.readFileSync(loginPath, 'utf8');
const joinRoomContent = fs.readFileSync(joinRoomPath, 'utf8');
const completeContent = fs.readFileSync(completePath, 'utf8');
const adminLoginContent = fs.readFileSync(adminLoginPath, 'utf8');
const adminNavbarContent = fs.readFileSync(adminNavbarPath, 'utf8');

// 1. global.css .auth-card & .auth-logo ribbon height definitions
runTest('.auth-card is styled with overflow: hidden and 0 top padding', () => {
  assert(globalCssContent.includes('.auth-card {'), 'Must define .auth-card');
  assert(globalCssContent.includes('padding: 0 40px 36px 40px;'), '.auth-card padding must be flush on top');
  assert(globalCssContent.includes('overflow: hidden;'), '.auth-card must have overflow: hidden');
  assert(globalCssContent.includes('border-radius: var(--radius-xl);'), '.auth-card must have rounded border-radius');
  assert(globalCssContent.includes('max-width: 440px;'), '.auth-card width maintained at compact max-width');
});

runTest('.auth-logo is styled with fixed 52px height (thin ribbon) and top rounded corners', () => {
  assert(globalCssContent.includes('.auth-logo {'), 'Must define .auth-logo');
  assert(globalCssContent.includes('background: #1A2B3C;'), '.auth-logo must have dark #1A2B3C ribbon background');
  assert(globalCssContent.includes('height: 52px;'), '.auth-logo must have fixed 52px thin ribbon height');
  assert(globalCssContent.includes('margin: 0 -40px 18px -40px;'), '.auth-logo must have negative margin spanning card width');
  assert(globalCssContent.includes('border-top-left-radius: var(--radius-xl);'), '.auth-logo must round top-left corner');
  assert(globalCssContent.includes('border-top-right-radius: var(--radius-xl);'), '.auth-logo must round top-right corner');
});

runTest('.auth-logo img has max-height 32px for crisp thin ribbon presentation', () => {
  assert(globalCssContent.includes('.auth-logo img {'), 'Must define .auth-logo img');
  assert(globalCssContent.includes('height: 32px;'), 'Image height must be 32px');
  assert(globalCssContent.includes('max-height: 32px;'), 'Image max-height must be 32px');
  assert(globalCssContent.includes('background: transparent;'), 'Image background must be transparent');
  assert(globalCssContent.includes('box-shadow: none;'), 'Image must have box-shadow: none');
});

runTest('Mobile responsive styles adapt .auth-logo height to 48px and img to 28px', () => {
  assert(globalCssContent.includes('.auth-card { padding: 0 20px 28px 20px; }'), 'Mobile .auth-card padding');
  assert(globalCssContent.includes('.auth-logo { margin: 0 -20px 16px -20px; height: 48px; }'), 'Mobile .auth-logo height 48px');
  assert(globalCssContent.includes('.auth-logo img { height: 28px; max-height: 28px; }'), 'Mobile .auth-logo img height 28px');
});

// 2. Candidate & Auth Pages Card & Logo Verification
runTest('CandidateRegister.jsx renders .auth-card with 32px logo in ribbon', () => {
  assert(registerContent.includes('className="auth-card"'), 'CandidateRegister has .auth-card');
  assert(registerContent.includes('className="auth-logo"'), 'CandidateRegister has .auth-logo');
  assert(registerContent.includes('height: 32'), 'CandidateRegister logo has 32px height');
});

runTest('CandidateLogin.jsx renders .auth-card with 32px logo in ribbon', () => {
  assert(loginContent.includes('className="auth-card"'), 'CandidateLogin has .auth-card');
  assert(loginContent.includes('className="auth-logo"'), 'CandidateLogin has .auth-logo');
  assert(loginContent.includes('height: 32'), 'CandidateLogin logo has 32px height');
});

runTest('CandidateJoinRoom.jsx renders .auth-card with 32px logo in ribbon', () => {
  assert(joinRoomContent.includes('className="auth-card"'), 'CandidateJoinRoom has .auth-card');
  assert(joinRoomContent.includes('className="auth-logo"'), 'CandidateJoinRoom has .auth-logo');
  assert(joinRoomContent.includes('height: 32'), 'CandidateJoinRoom logo has 32px height');
});

runTest('CandidateTestComplete.jsx renders thin full-width dark ribbon with height: 52 and 32px logo', () => {
  assert(completeContent.includes('background: \'#1A2B3C\''), 'CandidateTestComplete has #1A2B3C ribbon');
  assert(completeContent.includes('margin: \'0 -40px 20px -40px\''), 'CandidateTestComplete ribbon spans full card width');
  assert(completeContent.includes('height: 52'), 'CandidateTestComplete ribbon has height: 52');
  assert(completeContent.includes('borderTopLeftRadius: 24'), 'CandidateTestComplete matches 24px top-left radius');
  assert(completeContent.includes('borderTopRightRadius: 24'), 'CandidateTestComplete matches 24px top-right radius');
  assert(completeContent.includes('height: 32'), 'CandidateTestComplete logo has 32px height');
});

runTest('AdminLogin.jsx renders .auth-card with 32px logo in ribbon', () => {
  assert(adminLoginContent.includes('className="auth-card"'), 'AdminLogin has .auth-card');
  assert(adminLoginContent.includes('className="auth-logo"'), 'AdminLogin has .auth-logo');
  assert(adminLoginContent.includes('height: 32'), 'AdminLogin logo has 32px height');
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
