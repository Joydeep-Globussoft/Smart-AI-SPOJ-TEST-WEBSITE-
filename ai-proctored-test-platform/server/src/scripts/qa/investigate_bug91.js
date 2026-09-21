const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const Candidate = require('../../models/Candidate');
const Admin = require('../../models/Admin');
const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Submission = require('../../models/Submission');
const MalpracticeLog = require('../../models/MalpracticeLog');

async function check() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-proctoring';
  console.log('Connecting to MongoDB:', uri);
  await mongoose.connect(uri);

  const og = await Candidate.findOne({ email: 'og@g.com' });
  console.log('Candidate Og:', og ? { id: og._id, name: og.name, email: og.email } : 'Not found');

  if (og) {
    const t0 = Date.now();
    const logs = await MalpracticeLog.find({ candidateId: og._id })
      .populate('reviewedBy', 'name email')
      .sort({ detectedAt: -1 });
    const queryTime = Date.now() - t0;
    console.log(`\nDB Query execution time: ${queryTime}ms for ${logs.length} logs`);

    let totalChars = 0;
    let base64Count = 0;
    let urlCount = 0;
    let nullCount = 0;

    logs.forEach((log, i) => {
      const u = log.proofScreenshotUrl;
      if (!u) {
        nullCount++;
      } else if (u.startsWith('data:') || u.length > 500) {
        base64Count++;
        totalChars += u.length;
      } else {
        urlCount++;
        totalChars += u.length;
      }
    });

    console.log(`Logs breakdown:`);
    console.log(`- Base64 images: ${base64Count}`);
    console.log(`- HTTP/Cloudinary URLs: ${urlCount}`);
    console.log(`- Null/None: ${nullCount}`);
    console.log(`- Total screenshot string length: ${totalChars} chars (~${(totalChars / (1024 * 1024)).toFixed(2)} MB in raw JSON)`);

    // Measure serialization time
    const t1 = Date.now();
    const jsonStr = JSON.stringify({ malpracticeLogs: logs });
    const jsonTime = Date.now() - t1;
    console.log(`JSON.stringify time: ${jsonTime}ms, full response payload size: ${(jsonStr.length / (1024 * 1024)).toFixed(2)} MB`);
  }

  // Also check other candidates with violations to compare low vs high count
  console.log('\n--- Checking violation counts across all candidates ---');
  const candidatesWithLogs = await MalpracticeLog.aggregate([
    { $group: { _id: '$candidateId', count: { $sum: 1 }, testId: { $first: '$testId' } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  for (const item of candidatesWithLogs) {
    const cand = await Candidate.findById(item._id);
    const tStart = Date.now();
    const cLogs = await MalpracticeLog.find({ candidateId: item._id })
      .populate('reviewedBy', 'name email')
      .sort({ detectedAt: -1 });
    const elapsed = Date.now() - tStart;
    const jsonSize = JSON.stringify({ malpracticeLogs: cLogs }).length;
    console.log(`Candidate ${cand?.email || item._id} (${cLogs.length} logs): DB query = ${elapsed}ms, Payload = ${(jsonSize / (1024 * 1024)).toFixed(2)} MB`);
  }

  await mongoose.disconnect();
}

check().catch(console.error);
