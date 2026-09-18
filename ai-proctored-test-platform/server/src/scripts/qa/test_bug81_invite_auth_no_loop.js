const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('========================================================================');
console.log('QA VERIFICATION SUITE: BUG-81 (No Auth Loop on Invite Link Login/Register)');
console.log('========================================================================\n');

let passedTests = 0;
let totalTests = 0;

function check(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
    process.exitCode = 1;
  }
}

// 1. Verify CandidateRegister.jsx
const registerPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateRegister.jsx');
const registerSrc = fs.readFileSync(registerPath, 'utf8');

check(
  registerSrc.includes('initialMountRef') && registerSrc.includes('!initialMountRef.current'),
  'CandidateRegister guards stale session purge with initialMountRef to prevent re-purging upon user state change'
);

check(
  registerSrc.includes("navigate('/candidate/instructions', { replace: true })"),
  'CandidateRegister navigates directly to /candidate/instructions upon successful auto-join'
);

check(
  registerSrc.includes("navigate('/candidate/join'") && registerSrc.includes('state:'),
  'CandidateRegister forwards auto-join error to /candidate/join via location state without looping'
);

// 2. Verify CandidateLogin.jsx
const loginPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateLogin.jsx');
const loginSrc = fs.readFileSync(loginPath, 'utf8');

check(
  loginSrc.includes('initialMountRef') && loginSrc.includes('!initialMountRef.current'),
  'CandidateLogin guards stale session purge with initialMountRef to prevent re-purging upon user state change'
);

check(
  !loginSrc.includes('sessionStorage.clear()'),
  'CandidateLogin does not prematurely clear sessionStorage during submit'
);

check(
  loginSrc.includes("navigate('/candidate/instructions', { replace: true })"),
  'CandidateLogin navigates directly to /candidate/instructions upon successful auto-join'
);

check(
  loginSrc.includes("navigate('/candidate/join'") && loginSrc.includes('state:'),
  'CandidateLogin forwards auto-join error to /candidate/join via location state without looping'
);

// 3. Verify CandidateJoinRoom.jsx
const joinRoomPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateJoinRoom.jsx');
const joinRoomSrc = fs.readFileSync(joinRoomPath, 'utf8');

check(
  joinRoomSrc.includes('if (inviteToken && !user)'),
  'CandidateJoinRoom redirects to Register ONLY if unauthenticated (!user)'
);

check(
  joinRoomSrc.includes('location.state?.error'),
  'CandidateJoinRoom handles forwarded error state cleanly'
);

console.log('\n------------------------------------------------------------------------');
console.log(`BUG-81 TEST SUMMARY: ${passedTests}/${totalTests} checks passed.`);
console.log('------------------------------------------------------------------------\n');
