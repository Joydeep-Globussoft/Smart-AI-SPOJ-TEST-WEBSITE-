const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const Candidate = require('../../models/Candidate');
const MalpracticeLog = require('../../models/MalpracticeLog');

async function measure() {
  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri);

  const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'supersecretjwtkeyglobussoft2026';
  const token = jwt.sign({ id: '6ab10e7659c63c45af110b81', role: 'SUPER_ADMIN', type: 'admin' }, secret, { expiresIn: '1h' });

  const agg = await MalpracticeLog.aggregate([
    { $group: { _id: { candidateId: '$candidateId', testId: '$testId' }, count: { $sum: 1 } } },
    { $sort: { count: 1 } }
  ]);

  console.log(`Found ${agg.length} candidate/test pairs with violations:\n`);

  console.log('=== BENCHMARK 1: Modal Initial Load (limit = 6) ===');
  for (const item of agg) {
    const cand = await Candidate.findById(item._id.candidateId);
    const t0 = Date.now();
    const res = await fetch(`http://localhost:5000/api/v1/tests/${item._id.testId}/candidates/${item._id.candidateId}/malpractice-logs?page=1&limit=6`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const text = await res.text();
    const time = Date.now() - t0;
    const sizeKB = (text.length / 1024).toFixed(1);
    const candName = String(cand?.name || cand?.email || item._id.candidateId);
    console.log(`Incidents: ${String(item.count).padStart(2)} | Cand: ${candName.padEnd(30)} | HTTP Time: ${String(time).padStart(5)}ms | Payload: ${String(sizeKB).padStart(8)} KB`);
  }

  // Also test 0 violations
  const zeroCand = await Candidate.findOne({ email: 'canda_bug70@globussoft.com' });
  if (zeroCand) {
    const t0 = Date.now();
    const res = await fetch(`http://localhost:5000/api/v1/tests/6ab10e7659c63c45af110b82/candidates/${zeroCand._id}/malpractice-logs?page=1&limit=6`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const text = await res.text();
    const time = Date.now() - t0;
    const sizeKB = (text.length / 1024).toFixed(1);
    console.log(`Incidents:  0 | Cand: ${zeroCand.email.padEnd(30)} | HTTP Time: ${String(time).padStart(5)}ms | Payload: ${String(sizeKB).padStart(8)} KB`);
  }

  console.log('\n=== BENCHMARK 2: Unpaginated / Full Payload (limit = all) ===');
  for (const item of agg) {
    const cand = await Candidate.findById(item._id.candidateId);
    const t0 = Date.now();
    const res = await fetch(`http://localhost:5000/api/v1/tests/${item._id.testId}/candidates/${item._id.candidateId}/malpractice-logs?limit=all`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const text = await res.text();
    const time = Date.now() - t0;
    const sizeKB = (text.length / 1024).toFixed(1);
    const candName = String(cand?.name || cand?.email || item._id.candidateId);
    console.log(`Incidents: ${String(item.count).padStart(2)} | Cand: ${candName.padEnd(30)} | HTTP Time: ${String(time).padStart(5)}ms | Payload: ${String(sizeKB).padStart(8)} KB`);
  }

  await mongoose.disconnect();
}

measure().catch(console.error);
