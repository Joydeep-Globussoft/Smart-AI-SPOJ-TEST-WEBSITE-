// Section 8.2 — Question collection (exact field names/types as specified)
const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  questionSetId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestionSet', required: true },
  testType: {
    type: String,
    enum: ['SPOJ', 'REACT', 'JAVASCRIPT', 'AI_TEST'],
    required: true,
  },
  title: { type: String, default: '' },
  description: { type: String, default: '' }, // full problem statement / AI-test project brief
  difficulty: { type: String, enum: ['EASY', 'MEDIUM', 'HARD', null], default: null },
  inputFormat: { type: String },
  outputFormat: { type: String },
  constraints: { type: String }, // valid input range, used to catch hardcoding
  visibleTestCases: [
    {
      input: { type: String },
      expectedOutput: { type: String },
    },
  ], // shown to candidate and used for run execution & grading (FEATURE-010)
  hiddenTestCases: [
    {
      input: { type: String },
      expectedOutput: { type: String },
    },
  ], // DEPRECATED (FEATURE-010): Kept for schema backward compatibility only; defaults to []
  // AI_TEST specific fields (null/unused for other types):
  aiTestBriefFiles: [{ fileName: { type: String } }], // e.g., [{ fileName: "index.html" }, { fileName: "style.css" }]
  // FEATURE-009 PDF Import fields:
  isPdfImported: { type: Boolean, default: false },
  pdfFileName: { type: String }, // unique stored filename on server
  pdfOriginalName: { type: String }, // original uploaded filename
  pdfPageRange: {
    startPage: { type: Number, default: 1 },
    endPage: { type: Number, default: 1 },
  },
  isIncomplete: { type: Boolean, default: false }, // DEPRECATED (FEATURE-010)
  exampleParsingStatus: {
    type: String,
    enum: ['SUCCESS', 'FAILED', 'AMBIGUOUS', 'NONE'],
    default: 'NONE',
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Question', questionSchema);
