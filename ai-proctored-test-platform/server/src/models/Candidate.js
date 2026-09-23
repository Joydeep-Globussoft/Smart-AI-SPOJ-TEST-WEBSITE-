// Section 8.2 — Candidate collection (exact field names/types as specified)
// Note: TTL index on expiresAt — MongoDB auto-deletes document when expiresAt is reached
const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  fatherName: { type: String, trim: true, default: '' },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true, default: '' },
  qualification: { type: String, trim: true, default: '' },
  stream: { type: String, trim: true, default: '' },
  instituteName: { type: String, trim: true, default: '' },
  address: { type: String, trim: true, default: '' },
  passwordHash: { type: String, required: false }, // FEATURE-031: Password removed, retained for backwards compatibility
  createdAt: { type: Date, default: Date.now },
  // Account expiration timestamp — login check enforces 401 after this time (FR-1.2)
  expiresAt: { type: Date },
  isDisqualified: { type: Boolean, default: false },
  lateJoinRequestedAt: { type: Date, default: null },
  lateJoinRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null },
  manualJoinOverride: { type: Boolean, default: false },
});

// Section 8.3 — required indexes
// email unique index defined inline above per Mongoose convention

module.exports = mongoose.model('Candidate', candidateSchema);
