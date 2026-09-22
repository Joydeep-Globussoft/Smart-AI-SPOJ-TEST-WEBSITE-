const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });
const shortlistService = require('../../services/shortlistService');

async function cleanupR15() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const testId = new mongoose.Types.ObjectId('6aabd937edab0338e84ab899');
  console.log('[Cleanup] Starting orphaned record cleanup for test r15...');

  // 1. Find all candidate IDs appearing in rooms, submissions, and evaluation results for test r15
  const rooms = await db.collection('rooms').find({ testId }).toArray();
  const submissions = await db.collection('submissions').find({ testId }).toArray();
  const evals = await db.collection('evaluationresults').find({ testId }).toArray();

  const allCids = new Set();
  rooms.forEach(r => (r.joinedCandidates || []).forEach(j => {
    if (j.candidateId) allCids.add(j.candidateId.toString());
  }));
  submissions.forEach(s => {
    if (s.candidateId) allCids.add(s.candidateId.toString());
  });
  evals.forEach(e => {
    if (e.candidateId) allCids.add(e.candidateId.toString());
  });

  console.log(`[Cleanup] Found ${allCids.size} candidate IDs in test r15 data`);

  const deletedCids = [];
  for (const cidStr of allCids) {
    const cand = await db.collection('candidates').findOne({ _id: new mongoose.Types.ObjectId(cidStr) });
    if (!cand) {
      deletedCids.push(new mongoose.Types.ObjectId(cidStr));
      console.log(`[Cleanup] Candidate ID ${cidStr} has NO Candidate document (deleted/purged)`);
    } else {
      console.log(`[Cleanup] Candidate ID ${cidStr} is VALID: ${cand.name} (${cand.email})`);
    }
  }

  if (deletedCids.length > 0) {
    // Remove from rooms joinedCandidates
    const roomRes = await db.collection('rooms').updateMany(
      { testId },
      { $pull: { joinedCandidates: { candidateId: { $in: deletedCids } } } }
    );
    console.log(`[Cleanup] Cleaned room joinedCandidates: modified ${roomRes.modifiedCount}`);

    // Remove orphaned submissions
    const subRes = await db.collection('submissions').deleteMany({
      testId,
      candidateId: { $in: deletedCids }
    });
    console.log(`[Cleanup] Deleted ${subRes.deletedCount} orphaned submissions`);

    // Remove orphaned evaluation results
    const evalRes = await db.collection('evaluationresults').deleteMany({
      testId,
      candidateId: { $in: deletedCids }
    });
    console.log(`[Cleanup] Deleted ${evalRes.deletedCount} orphaned evaluation results`);
  }

  // Regenerate shortlist for r15
  const newShortlist = await shortlistService.regenerate(testId.toString());
  console.log(`[Cleanup] Shortlist regenerated for r15. Candidates count: ${newShortlist.candidates.length}`);
  console.log('[Cleanup] Shortlist candidates:', newShortlist.candidates.map(c => ({ name: c.name, email: c.email, score: c.score })));

  console.log('[Cleanup] Complete.');
  process.exit(0);
}

cleanupR15().catch(err => {
  console.error('[Cleanup] Error:', err);
  process.exit(1);
});
