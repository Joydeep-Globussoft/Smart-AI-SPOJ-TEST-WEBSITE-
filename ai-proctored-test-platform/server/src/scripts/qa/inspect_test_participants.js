const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });
const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Candidate = require('../../models/Candidate');
const Submission = require('../../models/Submission');

async function inspectDb() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const tests = await Test.find().sort({ createdAt: -1 }).lean();
  console.log(`Total tests in DB: ${tests.length}\n`);

  for (const t of tests) {
    const rooms = await Room.find({ testId: t._id }).lean();
    const subs = await Submission.find({ testId: t._id }).lean();

    const rawJoinedIds = [];
    rooms.forEach(r => {
      (r.joinedCandidates || []).forEach(j => {
        const cid = (j.candidateId?._id || j.candidateId)?.toString();
        if (cid) rawJoinedIds.push(cid);
      });
    });

    const rawSubIds = [];
    subs.forEach(s => {
      const cid = (s.candidateId?._id || s.candidateId)?.toString();
      if (cid) rawSubIds.push(cid);
    });

    const distinctRawIds = Array.from(new Set([...rawJoinedIds, ...rawSubIds]));
    const validCandidates = await Candidate.find({ _id: { $in: distinctRawIds } }).lean();

    if (t.title.toLowerCase().includes('r15') || t.title.toLowerCase().includes('sample') || validCandidates.length > 0) {
      console.log(`Test: "${t.title}" (ID: ${t._id}, Status: ${t.status})`);
      console.log(`  Rooms (${rooms.length}): ${rooms.map(r => `${r.roomName} (${r.roomCode})`).join(', ')}`);
      console.log(`  Raw joined candidates: ${rawJoinedIds.length}`);
      console.log(`  Raw submission candidates: ${rawSubIds.length}`);
      console.log(`  Distinct raw IDs: ${distinctRawIds.length}`);
      console.log(`  Valid Real Candidates in DB: ${validCandidates.length} -> [${validCandidates.map(c => `${c.name} (${c.email})`).join(', ')}]`);
      console.log('----------------------------------------------------');
    }
  }

  await mongoose.disconnect();
}

inspectDb().catch(console.error);
