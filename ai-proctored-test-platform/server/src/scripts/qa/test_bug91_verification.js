const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const Candidate = require('../../models/Candidate');
const MalpracticeLog = require('../../models/MalpracticeLog');
const Test = require('../../models/Test');

let passed = 0;
let total = 0;

function assert(condition, name) {
  total++;
  if (condition) {
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  ✕ [FAIL] ${name}`);
  }
}

async function run() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: BUG-91 Candidate Inspection & Evidence Load Speed');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);

  const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'supersecretjwtkeyglobussoft2026';
  const token = jwt.sign({ id: '6ab10e7659c63c45af110b81', role: 'SUPER_ADMIN', type: 'admin' }, secret, { expiresIn: '1h' });

  const og = await Candidate.findOne({ email: 'og@g.com' });
  assert(Boolean(og), '1.1: Candidate "Og" exists in database');

  const testId = '6ab10e7659c63c45af110b82';

  // 1. Initial Modal Load Test (page 1, limit 6)
  console.log('\n--- TEST 1: Candidate Og Modal Initial Load (page 1, limit 6) ---');
  const t0 = Date.now();
  const res1 = await fetch(`http://localhost:5000/api/v1/tests/${testId}/candidates/${og._id}/malpractice-logs?page=1&limit=6`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const t1 = Date.now() - t0;
  const data1 = await res1.json();
  const payloadSizeKB = (JSON.stringify(data1).length / 1024).toFixed(1);

  assert(res1.status === 200, `1.2: Modal initial load returns 200 OK (${t1}ms)`);
  assert(data1.malpracticeLogs.length === 6, `1.3: Exactly 6 incidents returned on page 1 (got ${data1.malpracticeLogs.length})`);
  assert(data1.totalCount === 31, `1.4: Total count accurately reported as 31 incidents (got ${data1.totalCount})`);
  assert(data1.hasMore === true, '1.5: hasMore is true for pagination');
  assert(data1.page === 1, '1.6: Page metadata reports page 1');
  assert(data1.malpracticeLogs.some((l) => Boolean(l.proofScreenshotUrl)), '1.7: Proof screenshot URLs are present for evidence review');
  assert(parseFloat(payloadSizeKB) < 500, `1.8: Payload size drastically reduced to ${payloadSizeKB} KB (down from 3,245 KB)`);

  // 2. Load More Incidents Test (page 2, limit 6)
  console.log('\n--- TEST 2: Candidate Og "Load More" Pagination (page 2, limit 6) ---');
  const t2 = Date.now();
  const res2 = await fetch(`http://localhost:5000/api/v1/tests/${testId}/candidates/${og._id}/malpractice-logs?page=2&limit=6`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const t3 = Date.now() - t2;
  const data2 = await res2.json();

  assert(res2.status === 200, `2.1: Page 2 load returns 200 OK (${t3}ms)`);
  assert(data2.malpracticeLogs.length === 6, `2.2: Exactly 6 incidents returned on page 2`);
  assert(data2.hasMore === true, '2.3: hasMore is true for further pagination');
  assert(data2.page === 2, '2.4: Page metadata reports page 2');
  
  // Verify disjoint IDs between page 1 and page 2
  const p1Ids = new Set(data1.malpracticeLogs.map((l) => String(l._id)));
  const hasOverlap = data2.malpracticeLogs.some((l) => p1Ids.has(String(l._id)));
  assert(!hasOverlap, '2.5: Page 1 and Page 2 incident sets are mutually disjoint (no duplicates)');

  // 3. Zero-Violation Candidate Test
  console.log('\n--- TEST 3: Zero-Violation Candidate ("Clean Record") ---');
  const zeroCand = await Candidate.findOne({ email: 'canda_bug70@globussoft.com' });
  const t4 = Date.now();
  const resZero = await fetch(`http://localhost:5000/api/v1/tests/${testId}/candidates/${zeroCand._id}/malpractice-logs?page=1&limit=6`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const t5 = Date.now() - t4;
  const dataZero = await resZero.json();

  assert(resZero.status === 200, '3.1: Zero-violation candidate query returns 200');
  assert(dataZero.malpracticeLogs.length === 0, '3.2: 0 malpractice logs returned');
  assert(dataZero.totalCount === 0, '3.3: totalCount is 0');
  assert(dataZero.hasMore === false, '3.4: hasMore is false');
  assert(t5 < 100, `3.5: Instant response time for clean record: ${t5}ms`);

  // 4. Backward Compatibility Test (Default without params)
  console.log('\n--- TEST 4: Backward Compatibility with Existing Consumers ---');
  const resDefault = await fetch(`http://localhost:5000/api/v1/tests/${testId}/candidates/${og._id}/malpractice-logs`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const dataDefault = await resDefault.json();
  assert(resDefault.status === 200, '4.1: Unparameterized call returns 200');
  assert(Array.isArray(dataDefault.malpracticeLogs), '4.2: malpracticeLogs is an array');
  assert(dataDefault.malpracticeLogs.length > 0, '4.3: malpracticeLogs contains records');
  assert(dataDefault.totalCount === 31, '4.4: totalCount is included in payload');

  // 5. Check Compound Index in MongoDB
  console.log('\n--- TEST 5: Database Indexes Verification ---');
  const indexes = await MalpracticeLog.collection.indexes();
  const hasCompoundIndex = indexes.some((idx) => idx.name === 'testId_1_candidateId_1_detectedAt_-1' || (idx.key.testId === 1 && idx.key.candidateId === 1 && idx.key.detectedAt === -1));
  assert(hasCompoundIndex, '5.1: testId_1_candidateId_1_detectedAt_-1 compound index exists in MongoDB');

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passed}/${total} verification tests passed!`);
  console.log('========================================================================\n');

  await mongoose.disconnect();
}

run().catch(console.error);
