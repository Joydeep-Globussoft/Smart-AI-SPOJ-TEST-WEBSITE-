// Section 8.2 — Candidate collection (exact field names/types as specified)
// Note: TTL index on expiresAt — MongoDB auto-deletes document when expiresAt is reached
const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  fatherName: { type: String, trim: true, default: '' },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: { type: String, trim: true, default: '' },
  qualification: { type: String, trim: true, default: '' },
  stream: { type: String, trim: true, default: '' },
  address: { type: String, trim: true, default: '' },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  // TTL index: index: { expires: 0 } means expire exactly AT expiresAt timestamp (Section 8.2 note)
  expiresAt: { type: Date, index: { expires: 0 } },
  isDisqualified: { type: Boolean, default: false },
  lateJoinRequestedAt: { type: Date, default: null },
  lateJoinRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null },
  manualJoinOverride: { type: Boolean, default: false },
});

// Section 8.3 — required indexes
// email unique index and expiresAt TTL index are defined inline above per Mongoose convention

module.exports = mongoose.model('Candidate', candidateSchema);
