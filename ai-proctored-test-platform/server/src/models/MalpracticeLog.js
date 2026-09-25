// Section 8.2 — MalpracticeLog collection (exact field names/types as specified)
const mongoose = require('mongoose');

const malpracticeLogSchema = new mongoose.Schema({
  candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
  violationType: {
    type: String,
    enum: ['PHONE_DETECTED', 'MULTIPLE_FACES', 'NO_FACE_15MIN', 'TAB_SWITCH', 'FULLSCREEN_EXIT', 'CAMERA_DISCONNECTED', 'OTHER'],
    required: true,
  },
  // Cloudinary URL (webcam or screen capture depending on violationType)
  proofScreenshotUrl: { type: String },
  detectedAt: { type: Date, default: Date.now },
  disconnectAt: { type: Date },
  reconnectAt: { type: Date, default: null },
  durationSeconds: { type: Number, default: null },
  resolved: { type: Boolean, default: false },
  adminReviewed: { type: Boolean, default: false },
  adminAction: { type: String, enum: ['NONE', 'WARNED', 'DISQUALIFIED'], default: 'NONE' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reviewedAt: { type: Date },
});

// Section 8.3 — required compound index
malpracticeLogSchema.index({ testId: 1, roomId: 1, candidateId: 1 });
// BUG-91 — compound index for fast candidate malpractice log retrieval and sorted timeline
malpracticeLogSchema.index({ testId: 1, candidateId: 1, detectedAt: -1 });

module.exports = mongoose.model('MalpracticeLog', malpracticeLogSchema);
