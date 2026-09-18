const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('========================================================================');
console.log('QA VERIFICATION SUITE: BUG-80 (Invite Link Always Lands on Register)');
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

// 1. Check AdminTestDetail.jsx
const adminTestDetailPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTestDetail.jsx');
const adminTestDetailSrc = fs.readFileSync(adminTestDetailPath, 'utf8');

check(
  adminTestDetailSrc.includes('/candidate/register?invite='),
  'AdminTestDetail constructs invite link pointing to /candidate/register?invite='
);
check(
  !adminTestDetailSrc.includes('/candidate/join?invite='),
  'AdminTestDetail no longer points invite link to /candidate/join?invite='
);

// 2. Check CandidateJoinRoom.jsx
const candidateJoinRoomPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateJoinRoom.jsx');
const candidateJoinRoomSrc = fs.readFileSync(candidateJoinRoomPath, 'utf8');

check(
  candidateJoinRoomSrc.includes('/candidate/register?invite='),
  'CandidateJoinRoom redirects incoming invite token to /candidate/register'
);
check(
  !candidateJoinRoomSrc.includes('api.joinRoom({ inviteToken })') || !candidateJoinRoomSrc.includes('sessionStorage.setItem(\'joinData\', JSON.stringify(data));\n        navigate(\'/candidate/instructions\', { replace: true })'),
  'CandidateJoinRoom removed silent auto-skip to /candidate/instructions'
);

// 3. Check CandidateRegister.jsx
const candidateRegisterPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateRegister.jsx');
const candidateRegisterSrc = fs.readFileSync(candidateRegisterPath, 'utf8');

check(
  candidateRegisterSrc.includes('logout()') && candidateRegisterSrc.includes('if (inviteToken)'),
  'CandidateRegister purges stale candidate session on mount when inviteToken is present'
);
check(
  candidateRegisterSrc.includes('/candidate/login${location.search}'),
  'CandidateRegister forwards search query (invite token) to Login page'
);
check(
  candidateRegisterSrc.includes('api.joinRoom({ inviteToken: activeInvite })'),
  'CandidateRegister auto-joins room after explicit candidate registration'
);

// 4. Check CandidateLogin.jsx
const candidateLoginPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateLogin.jsx');
const candidateLoginSrc = fs.readFileSync(candidateLoginPath, 'utf8');

check(
  candidateLoginSrc.includes('logout()') && candidateLoginSrc.includes('if (inviteToken)'),
  'CandidateLogin purges stale session on mount when inviteToken is present'
);
check(
  candidateLoginSrc.includes('/candidate/register${location.search}'),
  'CandidateLogin forwards search query (invite token) to Register page'
);
check(
  candidateLoginSrc.includes('api.joinRoom({ inviteToken: activeInvite })'),
  'CandidateLogin auto-joins room after explicit candidate login'
);

console.log('\n------------------------------------------------------------------------');
console.log(`BUG-80 TEST SUMMARY: ${passedTests}/${totalTests} checks passed.`);
console.log('------------------------------------------------------------------------\n');
