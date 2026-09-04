// Section 8.2 — Submission collection (exact field names/types as specified)
const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  code: { type: String }, // final submitted code (or file map JSON for AI Test)
  // for AI Test: { "index.html": "...", "style.css": "..." }
  filesJson: { type: Object, default: null },
  language: { type: String },
  // ASSUMPTION: Store draft/autosaved code per-language per-question so switching language preserves each language's progress
  savedCodeByLanguage: {
    type: Map,
    of: String,
    default: {},
  },
  // AI Test only: every chat message and AI reply (FR-6.2)
  promptLog: [
    {
      role: { type: String, enum: ['candidate', 'ai'] },
      message: { type: String },
      timestamp: { type: Date },
    },
  ],
  visibleTestCasesPassed: { type: Number, default: 0 },
  visibleTestCasesTotal: { type: Number, default: 0 },
  hiddenTestCasesPassed: { type: Number, default: 0 },
  hiddenTestCasesTotal: { type: Number, default: 0 },
  isAttempted: { type: Boolean, default: false },
  attemptedAt: { type: Date },
  candidateStartTime: { type: Date }, // individual timer start (FR-5.1)
  candidateEndTime: { type: Date },
  submittedAt: { type: Date },
  status: {
    type: String,
    enum: ['IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED_TIME_UP', 'AUTO_SUBMITTED_DISQUALIFIED'],
    default: 'IN_PROGRESS',
  },
});

// Section 8.3 — required compound index
submissionSchema.index({ candidateId: 1, testId: 1, questionId: 1 });

module.exports = mongoose.model('Submission', submissionSchema);
