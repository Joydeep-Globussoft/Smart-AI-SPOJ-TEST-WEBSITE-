require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const mongoose = require('mongoose');
const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Submission = require('../../models/Submission');
const Candidate = require('../../models/Candidate');

async function inspectAllRooms() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('No MONGO_URI in .env');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const tests = await Test.find().sort({ createdAt: -1 });
  console.log(`Found ${tests.length} tests.\n`);

  for (const t of tests) {
    console.log(`================================================================`);
    console.log(`TEST: "${t.title}" (${t._id}) | Status: ${t.status} | Created: ${t.createdAt}`);
    console.log(`================================================================`);

    const rooms = await Room.find({ testId: t._id }).populate('joinedCandidates.candidateId');
    console.log(`Rooms count: ${rooms.length}`);

    for (const r of rooms) {
      console.log(`\n  ROOM: "${r.roomName}" (${r._id}) | Code: ${r.roomCode}`);
      console.log(`  joinedCandidates count: ${r.joinedCandidates?.length || 0}`);

      for (const j of r.joinedCandidates || []) {
        const cand = j.candidateId;
        const cid = cand?._id || j.candidateId;
        const subs = await Submission.find({ testId: t._id, candidateId: cid }).sort({ candidateStartTime: 1 });
        const earliestStart = subs.find(s => s.candidateStartTime)?.candidateStartTime || null;
        const latestEnd = subs.find(s => s.submittedAt)?.submittedAt || null;

        console.log(`    - Candidate: ${cand?.name || 'Unknown'} (${cand?.email || cid})`);
        console.log(`      * candidate.createdAt:   ${cand?.createdAt ? cand.createdAt.toISOString() : 'null'}`);
        console.log(`      * candidate.lastLoginAt: ${cand?.lastLoginAt ? cand.lastLoginAt.toISOString() : 'null'}`);
        console.log(`      * candidate.roomJoinedAt:${cand?.roomJoinedAt ? cand.roomJoinedAt.toISOString() : 'null'}`);
        console.log(`      * room.joinedAt:         ${j.joinedAt ? j.joinedAt.toISOString() : 'null'}`);
        console.log(`      * testStartTime:         ${earliestStart ? earliestStart.toISOString() : 'null'}`);
        console.log(`      * testEndTime:           ${latestEnd ? latestEnd.toISOString() : 'null'}`);
        if (j.joinedAt && earliestStart && j.joinedAt.getTime() === earliestStart.getTime()) {
          console.log(`      ⚠️ WARNING: room.joinedAt is EXACTLY EQUAL to testStartTime!`);
        } else if (j.joinedAt && earliestStart && j.joinedAt.getTime() > earliestStart.getTime()) {
          console.log(`      ❌ ERROR: room.joinedAt is AFTER testStartTime!`);
        } else if (j.joinedAt && earliestStart) {
          const diffSec = Math.round((earliestStart.getTime() - j.joinedAt.getTime()) / 1000);
          console.log(`      ✅ DISTINCT: room.joinedAt is ${diffSec}s BEFORE testStartTime.`);
        }
      }
    }
  }

  await mongoose.disconnect();
  console.log('\nFinished inspection.');
}

inspectAllRooms().catch((err) => {
  console.error(err);
  process.exit(1);
});
