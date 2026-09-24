const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });
const Folder = require('../../models/Folder');
const QuestionSet = require('../../models/QuestionSet');

async function checkIndexes() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const folderIndexes = await Folder.collection.indexes();
  console.log('\n--- Folder Indexes ---');
  console.log(JSON.stringify(folderIndexes, null, 2));

  const qsIndexes = await QuestionSet.collection.indexes();
  console.log('\n--- QuestionSet Indexes ---');
  console.log(JSON.stringify(qsIndexes, null, 2));

  const allFolders = await Folder.find().lean();
  console.log(`\nTotal Folders in DB: ${allFolders.length}`);
  const missingCreatedAt = allFolders.filter(f => !f.createdAt);
  const missingCreatedBy = allFolders.filter(f => !f.createdBy);
  console.log(`Folders missing createdAt: ${missingCreatedAt.length}`);
  console.log(`Folders missing createdBy: ${missingCreatedBy.length}`);

  if (allFolders.length > 0) {
    console.log('\nSample Folder Doc:');
    console.log(JSON.stringify(allFolders[0], null, 2));
  }

  await mongoose.disconnect();
}

checkIndexes().catch(console.error);
