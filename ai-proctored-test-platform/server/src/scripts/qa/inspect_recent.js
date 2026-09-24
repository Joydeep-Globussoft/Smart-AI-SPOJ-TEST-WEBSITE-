require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const mongoose = require('mongoose');
const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Submission = require('../../models/Submission');
const Candidate = require('../../models/Candidate');

async function inspectRecentTests() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);

  const tests = await Test.find().sort({ _id: -1 }).limit(10);

  for (const t of tests) {
    console.log(`\n================================================================`);
    console.log(`TEST: "${t.title}" (${t._id}) | Status: ${t.status}`);

    const rooms = await Room.find({ testId: t._id }).populate('joinedCandidates.candidateId');

    for (const r of rooms) {
      console.log(`  ROOM: "${r.roomName}" (${r._id}) | Code: ${r.roomCode}`);
      console.log(`  joinedCandidates count: ${r.joinedCandidates?.length || 0}`);

      for (const j of r.joinedCandidates || []) {
        const cand = j.candidateId;
        const cid = cand?._id || j.candidateId;
        const subs = await Submission.find({ testId: t._id, candidateId: cid });
        const startTimes = subs.map(s => s.candidateStartTime).filter(Boolean);
        const submitTimes = subs.map(s => s.submittedAt).filter(Boolean);

        console.log(`    - Candidate: ${cand?.name || 'Unknown'} (${cand?.email || cid})`);
        console.log(`      * candidate.createdAt:   ${cand?.createdAt ? cand.createdAt.toLocaleString() : 'null'}`);
        console.log(`      * candidate.lastLoginAt: ${cand?.lastLoginAt ? cand.lastLoginAt.toLocaleString() : 'null'}`);
        console.log(`      * candidate.roomJoinedAt:${cand?.roomJoinedAt ? cand.roomJoinedAt.toLocaleString() : 'null'}`);
        console.log(`      * room.joinedCandidates[].joinedAt: ${j.joinedAt ? j.joinedAt.toLocaleString() : 'null'}`);
        console.log(`      * candidateStartTime(s): ${startTimes.map(s => s.toLocaleString()).join(', ') || 'none'}`);
        console.log(`      * submittedAt(s):        ${submitTimes.map(s => s.toLocaleString()).join(', ') || 'none'}`);
      }
    }
  }

  await mongoose.disconnect();
}

inspectRecentTests().catch(console.error);
