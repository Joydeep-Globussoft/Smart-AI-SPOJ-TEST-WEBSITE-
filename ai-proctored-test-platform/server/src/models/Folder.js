// Section 8.2 — Folder collection (FEATURE-013)
// Primary Question Bank container and Question Set Pool
const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    testType: {
      type: String,
      enum: ['SPOJ', 'REACT', 'JAVASCRIPT', 'AI_TEST'],
      required: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
  },
  { timestamps: true }
);

folderSchema.index({ testType: 1, createdAt: -1 });

module.exports = mongoose.model('Folder', folderSchema);
