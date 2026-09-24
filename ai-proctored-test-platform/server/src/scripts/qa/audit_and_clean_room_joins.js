require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const mongoose = require('mongoose');
const Room = require('../../models/Room');
const Submission = require('../../models/Submission');
const Candidate = require('../../models/Candidate');

async function auditAndCleanRoomJoins() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);

  const rooms = await Room.find();
  console.log(`Auditing ${rooms.length} rooms...`);

  let modifiedRoomsCount = 0;

  for (const r of rooms) {
    if (!r.joinedCandidates || r.joinedCandidates.length === 0) continue;

    const candEntryMap = {};
    let hasDuplicates = false;

    for (const entry of r.joinedCandidates) {
      if (!entry.candidateId) continue;
      const cid = entry.candidateId.toString();

      if (!candEntryMap[cid]) {
        candEntryMap[cid] = entry;
      } else {
        hasDuplicates = true;
        // Keep the earliest joinedAt
        const existingTime = new Date(candEntryMap[cid].joinedAt).getTime();
        const thisTime = new Date(entry.joinedAt).getTime();
        if (thisTime < existingTime) {
          candEntryMap[cid].joinedAt = entry.joinedAt;
        }
        if (!candEntryMap[cid].assignedQuestionSetId && entry.assignedQuestionSetId) {
          candEntryMap[cid].assignedQuestionSetId = entry.assignedQuestionSetId;
        }
        if (!candEntryMap[cid].joinIndex && entry.joinIndex) {
          candEntryMap[cid].joinIndex = entry.joinIndex;
        }
      }
    }

    if (hasDuplicates) {
      const dedupedEntries = Object.values(candEntryMap);
      console.log(`Room "${r.roomName}" (${r._id}) had ${r.joinedCandidates.length} entries -> cleaned to ${dedupedEntries.length}`);
      r.joinedCandidates = dedupedEntries;
      await r.save();
      modifiedRoomsCount++;
    }
  }

  console.log(`\nCleaned duplicates across ${modifiedRoomsCount} rooms.`);
  await mongoose.disconnect();
}

auditAndCleanRoomJoins().catch(console.error);
