const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../../server/.env') });

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-proctored-test-platform';

async function sanitizeCapacities() {
  await mongoose.connect(uri);
  const Room = mongoose.model('Room', new mongoose.Schema({}, { strict: false }));

  const result = await Room.updateMany(
    { $or: [{ roomName: 'lab-1' }, { capacity: { $gt: 150 } }] },
    { $set: { capacity: 50 } }
  );
  console.log('Sanitization update result:', result);

  const lab1 = await Room.findOne({ roomName: 'lab-1' }).lean();
  console.log('Sanitized lab-1 document:', lab1 ? {
    id: lab1._id,
    roomName: lab1.roomName,
    roomCode: lab1.roomCode,
    capacity: lab1.capacity,
  } : 'Not found');

  await mongoose.disconnect();
  console.log('Database disconnected.');
}

sanitizeCapacities().catch(err => {
  console.error('Sanitization failed:', err);
  process.exit(1);
});
