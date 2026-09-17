// Section 8.2 — Test collection (exact field names/types as specified)
const mongoose = require('mongoose');

const testSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    testType: {
      type: String,
      enum: ['SPOJ', 'REACT', 'JAVASCRIPT', 'AI_TEST'],
      required: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    questionSetId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestionSet', default: null }, // Single Question Set
    folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null, index: true }, // FEATURE-013: Folder as Question Set Pool
    questionSetPoolId: { type: String, default: null, index: true }, // Backward compatibility alias to folderId
    durationMinutes: { type: Number, required: true },
    totalQuestions: { type: Number, required: true, default: 5 },
    passingCriteria: { type: Number, required: true }, // e.g., 2.5 (out of totalQuestions)
    instructions: { type: String, required: true }, // rich text shown before test start
    startTestWindowMinutes: { type: Number, required: true, default: 10 }, // room ID/pass validity window
    supportedLanguages: [
      {
        type: String,
        enum: ['python', 'java', 'cpp', 'c', 'javascript', 'react'],
      },
    ],
    // set post-exam by admin; null = not yet set (Section 8.2)
    malpracticeDisqualifyThreshold: { type: Number, default: null },
    status: {
      type: String,
      enum: ['DRAFT', 'SCHEDULED', 'LIVE', 'ENDED'],
      default: 'DRAFT',
    },
    // Lifecycle timestamps
    liveStartedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Test', testSchema);
