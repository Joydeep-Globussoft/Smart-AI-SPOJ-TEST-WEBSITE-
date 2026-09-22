const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });
const shortlistService = require('../../services/shortlistService');
const { getLiveCandidates } = require('../../controllers/roomController');

async function auditAndCleanAllTests() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  console.log('===============================================================');
  console.log('PLATFORM-WIDE TEST AUDIT & SHORTLIST SYNCHRONIZATION');
  console.log('===============================================================');

  const tests = await db.collection('tests').find({}).toArray();
  console.log('Total tests found in database:', tests.length);

  // 1. Find all candidate IDs that are referenced across all collections
  const [rooms, submissions, evals, shortlists] = await Promise.all([
    db.collection('rooms').find({}).toArray(),
    db.collection('submissions').find({}).toArray(),
    db.collection('evaluationresults').find({}).toArray(),
    db.collection('shortlists').find({}).toArray(),
  ]);

  const allReferencedCandidateIds = new Set();
  rooms.forEach((r) =>
    (r.joinedCandidates || []).forEach((j) => {
      if (j.candidateId) allReferencedCandidateIds.add(j.candidateId.toString());
    })
  );
  submissions.forEach((s) => {
    if (s.candidateId) allReferencedCandidateIds.add(s.candidateId.toString());
  });
  evals.forEach((e) => {
    if (e.candidateId) allReferencedCandidateIds.add(e.candidateId.toString());
  });
  shortlists.forEach((sl) =>
    (sl.candidates || []).forEach((c) => {
      if (c.candidateId) allReferencedCandidateIds.add(c.candidateId.toString());
    })
  );

  console.log(`Total distinct candidate IDs referenced in database: ${allReferencedCandidateIds.size}`);

  const purgedCids = [];
  const validCids = [];
  for (const cid of allReferencedCandidateIds) {
    const exists = await db.collection('candidates').findOne({ _id: new mongoose.Types.ObjectId(cid) });
    if (!exists) {
      purgedCids.push(new mongoose.Types.ObjectId(cid));
    } else {
      validCids.push(cid);
    }
  }

  console.log(`Valid candidate accounts in DB: ${validCids.length}`);
  console.log(`Purged/deleted candidate accounts in DB: ${purgedCids.length}`);

  if (purgedCids.length > 0) {
    console.log('\n--- Purging dangling candidate references across all tests ---');
    const roomClean = await db.collection('rooms').updateMany(
      {},
      { $pull: { joinedCandidates: { candidateId: { $in: purgedCids } } } }
    );
    console.log(`Rooms modified (removed orphaned joinedCandidates): ${roomClean.modifiedCount}`);

    const subClean = await db.collection('submissions').deleteMany({
      candidateId: { $in: purgedCids },
    });
    console.log(`Submissions deleted (removed orphaned submissions): ${subClean.deletedCount}`);

    const evalClean = await db.collection('evaluationresults').deleteMany({
      candidateId: { $in: purgedCids },
    });
    console.log(`Evaluation results deleted (removed orphaned evaluations): ${evalClean.deletedCount}`);
  }

  // 2. Synchronize and verify EVERY test in the database
  console.log('\n--- Synchronizing & Regenerating Shortlist for ALL Tests ---');
  let mismatchCount = 0;
  let syncedCount = 0;

  for (const t of tests) {
    const testId = t._id.toString();
    try {
      // Regenerate shortlist with strict validation
      const sl = await shortlistService.regenerate(testId);

      // Verify Live Candidates (Test Summary) vs Shortlist
      let liveData = null;
      await getLiveCandidates(
        { params: { testId }, app: { get: () => ({ emit: () => {} }) } },
        {
          json: (data) => {
            liveData = data;
          },
        },
        () => {}
      );

      const liveCount = Object.keys(liveData?.candidates || {}).length;
      const slCount = sl.candidates.length;
      const totalRoster = sl.totalCandidates;

      if (slCount > liveCount || slCount > totalRoster) {
        console.error(
          `❌ [MISMATCH] Test [${t.title}] (${testId}): Live Roster = ${liveCount}, Shortlist = ${slCount}, Total = ${totalRoster}`
        );
        mismatchCount++;
      } else {
        console.log(
          `✅ [SYNCED] Test [${t.title}]: Live Roster = ${liveCount}, Shortlist = ${slCount}, Total = ${totalRoster}`
        );
        syncedCount++;
      }
    } catch (e) {
      console.error(`❌ [ERROR] Test [${t.title}] (${testId}):`, e.message);
      mismatchCount++;
    }
  }

  console.log('\n===============================================================');
  console.log(`PLATFORM-WIDE SYNC FINISHED: ${syncedCount} tests synced, ${mismatchCount} mismatches`);
  console.log('===============================================================');

  if (mismatchCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

auditAndCleanAllTests().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
