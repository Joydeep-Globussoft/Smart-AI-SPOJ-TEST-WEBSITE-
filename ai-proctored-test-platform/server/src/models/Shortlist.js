// Section 8.2 — Shortlist collection (exact field names/types as specified)
const mongoose = require('mongoose');

const shortlistSchema = new mongoose.Schema({
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true, unique: true },
  passingCriteriaUsed: { type: Number }, // snapshot of the threshold at generation time
  malpracticeThresholdUsed: { type: Number },
  candidates: [
    {
      candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
      name: { type: String },
      email: { type: String },
      score: { type: Number },
      questionsCompleted: { type: Number },
      malpracticeCount: { type: Number },
      rank: { type: Number }, // rank 1 = highest score (FR-10.1: ascending rank = descending score)
    },
  ],
  totalCandidates: { type: Number, default: 0 },
  generatedAt: { type: Date },
});

module.exports = mongoose.model('Shortlist', shortlistSchema);
