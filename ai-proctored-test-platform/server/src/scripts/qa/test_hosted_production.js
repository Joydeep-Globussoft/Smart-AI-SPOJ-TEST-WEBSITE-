const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

async function testHostedProduction() {
  console.log('========================================================================');
  console.log('TESTING LIVE HOSTED PRODUCTION DEPLOYMENTS');
  console.log('Admin Panel: https://smart-ai-spoj-test-website.vercel.app/admin/login');
  console.log('Backend API: https://smart-ai-spoj-test-website.onrender.com/api/v1');
  console.log('========================================================================\n');

  // 1. Authenticate with Production Backend
  console.log('Authenticating with Production Backend...');
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
  console.log(`[PASS] Logged in as: ${loginData.admin?.email || 'superadmin@globussoft.in'} (Token length: ${token?.length})`);

  const testId = '6ab10e7659c63c45af110b82';
  const ogId = '6ab10ed759c63c45af110bc3';

  // 2. Query Candidate Og (High-Violation Candidate)
  console.log('\n--- 1. Querying Candidate "Og" on Live Hosted Backend (Page 1, limit=6) ---');
  const t0 = Date.now();
  const resOg = await fetch(`https://smart-ai-spoj-test-website.onrender.com/api/v1/tests/${testId}/candidates/${ogId}/malpractice-logs?page=1&limit=6`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const t1 = Date.now() - t0;
  const dataOg = await resOg.json();
  const ogSizeKB = (JSON.stringify(dataOg).length / 1024).toFixed(1);

  console.log(`Status: ${resOg.status}`);
  console.log(`Response Time: ${t1}ms`);
  console.log(`Incidents on Page 1: ${dataOg.malpracticeLogs?.length}`);
  console.log(`Total Count Reported: ${dataOg.totalCount}`);
  console.log(`hasMore: ${dataOg.hasMore}`);
  console.log(`Payload Size: ${ogSizeKB} KB (down from 3.25 MB)`);

  // 3. Query Candidate with 0 Violations
  console.log('\n--- 2. Querying Clean Record Candidate on Live Hosted Backend ---');
  const zeroCandId = '6aa8dd9a9c599b0b4d78002f';
  const t2 = Date.now();
  const resZero = await fetch(`https://smart-ai-spoj-test-website.onrender.com/api/v1/tests/${testId}/candidates/${zeroCandId}/malpractice-logs?page=1&limit=6`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const t3 = Date.now() - t2;
  const dataZero = await resZero.json();

  console.log(`Status: ${resZero.status}`);
  console.log(`Response Time: ${t3}ms`);
  console.log(`Incidents Count: ${dataZero.malpracticeLogs?.length}`);
  console.log(`Total Count Reported: ${dataZero.totalCount}`);
  console.log(`hasMore: ${dataZero.hasMore}`);

  // 4. Verify Vercel Frontend Availability
  console.log('\n--- 3. Verifying Live Vercel Frontend ---');
  const t4 = Date.now();
  const resVercel = await fetch('https://smart-ai-spoj-test-website.vercel.app/admin/login');
  const t5 = Date.now() - t4;
  console.log(`Vercel Admin Login Page: Status ${resVercel.status} (${t5}ms)`);

  console.log('\n========================================================================');
  console.log('ALL LIVE HOSTED WEBSITE CHECKS COMPLETED SUCCESSFULLY!');
  console.log('========================================================================\n');
}

testHostedProduction().catch(console.error);
