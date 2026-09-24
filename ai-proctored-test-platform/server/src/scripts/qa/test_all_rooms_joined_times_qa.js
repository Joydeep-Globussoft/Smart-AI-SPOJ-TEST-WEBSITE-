require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const mongoose = require('mongoose');
const Candidate = require('../../models/Candidate');
const Room = require('../../models/Room');
const Test = require('../../models/Test');
const Submission = require('../../models/Submission');
const { resolveCandidateTimelines } = require('../../utils/timelineHelper');
const assert = require('assert');

async function testAllRoomsQA() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);

  const rooms = await Room.find().populate('joinedCandidates.candidateId');
  console.log(`Testing timeline resolution across ${rooms.length} rooms in DB...\n`);

  let checkedCandidates = 0;
  let distinctCount = 0;

  for (const r of rooms) {
    if (!r.joinedCandidates || r.joinedCandidates.length === 0) continue;

    for (const j of r.joinedCandidates) {
      const cand = j.candidateId;
      if (!cand) continue;
      const cid = cand._id ? cand._id.toString() : j.candidateId.toString();

      const subs = await Submission.find({ roomId: r._id, candidateId: cid });
      const testStartedAt = subs.find(s => s.candidateStartTime)?.candidateStartTime || null;
      const testEndedAt = subs.find(s => s.submittedAt)?.submittedAt || null;

      const timelines = resolveCandidateTimelines({
        roomJoinedAtRaw: j.joinedAt,
        candidateCreatedAt: cand.createdAt,
        candidateLastLoginAt: cand.lastLoginAt,
        candidateRoomJoinedAt: cand.roomJoinedAt,
        testStartedAtRaw: testStartedAt,
        testEndedAtRaw: testEndedAt,
        candidateId: cid,
        testId: r.testId,
        roomId: r._id,
      });

      checkedCandidates++;

      if (timelines.roomJoinedAt && timelines.testStartedAt) {
        const joinMs = new Date(timelines.roomJoinedAt).getTime();
        const startMs = new Date(timelines.testStartedAt).getTime();

        assert.ok(joinMs <= startMs, `roomJoinedAt (${timelines.roomJoinedAt}) must be <= testStartedAt (${timelines.testStartedAt}) for candidate ${cand.email}`);

        if (joinMs < startMs) {
          distinctCount++;
        }
      }

      if (timelines.testStartedAt && timelines.testEndedAt) {
        const startMs = new Date(timelines.testStartedAt).getTime();
        const endMs = new Date(timelines.testEndedAt).getTime();
        assert.ok(startMs <= endMs, `testStartedAt must be <= testEndedAt for candidate ${cand.email}`);
      }
    }
  }

  console.log(`✓ Audited ${checkedCandidates} candidate room records.`);
  console.log(`✓ All records satisfied roomJoinedAt <= testStartedAt <= testEndedAt.`);
  console.log(`✓ ${distinctCount} candidate attempts have distinct separate roomJoinedAt < testStartedAt.`);

  await mongoose.disconnect();
}

testAllRoomsQA().catch((err) => {
  console.error('QA Failed:', err);
  process.exit(1);
});
