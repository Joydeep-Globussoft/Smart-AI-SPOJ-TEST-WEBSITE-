// Section 8.2 — Room collection (exact field names/types as specified)
const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  roomName: { type: String, required: true }, // e.g., "Room 201"
  roomCode: { type: String, required: true, unique: true }, // auto-generated join ID
  roomPassword: { type: String, required: true }, // auto-generated
  passwordValidUntil: { type: Date, default: null }, // set when test goes LIVE (now + startTestWindowMinutes)
  capacity: { type: Number },
  status: { type: String, enum: ['ACTIVE', 'CLOSED'], default: 'ACTIVE' },
  candidateJoinCounter: { type: Number, default: 0 }, // FEATURE-012: per-room atomic counter for round-robin rotation
  joinedCandidates: [
    {
      candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
      joinedAt: { type: Date, default: Date.now },
      assignedQuestionSetId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestionSet' }, // FEATURE-012
      joinIndex: { type: Number }, // FEATURE-012
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

// Section 8.3 — required index (roomCode unique index defined inline on field)

module.exports = mongoose.model('Room', roomSchema);
