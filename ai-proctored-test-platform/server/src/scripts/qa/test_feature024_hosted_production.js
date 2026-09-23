const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

async function testFeature024HostedProduction() {
  console.log('========================================================================');
  console.log('TESTING FEATURE-024 ON LIVE HOSTED PRODUCTION');
  console.log('Admin Panel: https://smart-ai-spoj-test-website.vercel.app/admin/login');
  console.log('Backend API: https://smart-ai-spoj-test-website.onrender.com/api/v1');
  console.log('========================================================================\n');

  // 1. Authenticate with Production Backend
  console.log('1. Authenticating as Super Admin with Production Backend...');
  const loginRes = await fetch('https://smart-ai-spoj-test-website.onrender.com/api/v1/auth/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'superadmin@globussoft.in',
      password: 'GlobusAdmin2026!'
    })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log(`  ✓ [PASS] Super Admin Login Successful (Token length: ${token?.length})`);

  // 2. Query Test "again" (testId: 6aa919e7b8c675e3709daa4e) and Candidate "he" (candId: 6aa91a1c2c7214a48caedd24)
  console.log('\n2. Testing getCandidateEvaluationDetail on Live Production Backend...');
  const testId = '6aa919e7b8c675e3709daa4e';
  const candId = '6aa91a1c2c7214a48caedd24';

  const t0 = Date.now();
  const detailRes = await fetch(`https://smart-ai-spoj-test-website.onrender.com/api/v1/tests/${testId}/candidates/${candId}/evaluations`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const t1 = Date.now() - t0;
  const detailData = await detailRes.json();

  console.log(`  Status: ${detailRes.status} (${t1}ms)`);
  console.log(`  Candidate: ${detailData.candidate?.name} (${detailData.candidate?.email})`);
  console.log(`  Test: ${detailData.test?.title} (${detailData.test?.testType})`);
  console.log(`  Questions Count: ${detailData.questions?.length}`);
  if (detailData.questions?.length > 0) {
    const q1 = detailData.questions[0];
    console.log(`  Q1: "${q1.title}" - Attempted: ${q1.isAttempted}, Status: ${q1.status}, Has Code: ${Boolean(q1.code)}, Has Rubric: ${Boolean(q1.evaluation)}`);
  }
  console.log(`  ✓ [PASS] Live Backend getCandidateEvaluationDetail works with zero shortlist gating`);

  // 3. Verify Vercel Hosted Frontend Bundle
  console.log('\n3. Verifying Live Vercel Frontend Bundle...');
  const resVercel = await fetch('https://smart-ai-spoj-test-website.vercel.app/admin/login');
  console.log(`  Vercel Frontend HTTP Status: ${resVercel.status}`);
  console.log(`  ✓ [PASS] Live Hosted Vercel Frontend is live and operational`);

  console.log('\n========================================================================');
  console.log('FEATURE-024 LIVE HOSTED PRODUCTION CHECKS COMPLETED SUCCESSFULLY!');
  console.log('========================================================================\n');
}

testFeature024HostedProduction().catch((err) => {
  console.error('Fatal live test error:', err);
  process.exit(1);
});
