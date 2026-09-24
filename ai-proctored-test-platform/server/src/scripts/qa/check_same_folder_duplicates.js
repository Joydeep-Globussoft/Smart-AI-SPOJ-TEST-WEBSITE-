const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });
const QuestionSet = require('../../models/QuestionSet');
const Folder = require('../../models/Folder');

async function checkSameFolderDuplicates() {
  await mongoose.connect(process.env.MONGODB_URI);
  const sets = await QuestionSet.find().lean();
  console.log(`Total question sets: ${sets.length}`);

  const folderSetMap = {};
  for (const s of sets) {
    const fId = s.folderId ? s.folderId.toString() : 'NO_FOLDER';
    if (!folderSetMap[fId]) folderSetMap[fId] = [];
    folderSetMap[fId].push(s);
  }

  let duplicatesFound = 0;
  for (const [fId, setList] of Object.entries(folderSetMap)) {
    const nameCounts = {};
    for (const s of setList) {
      nameCounts[s.name] = (nameCounts[s.name] || 0) + 1;
    }
    for (const [name, count] of Object.entries(nameCounts)) {
      if (count > 1) {
        console.log(`Duplicate found in folder ${fId}: "${name}" (${count} times)`);
        duplicatesFound++;
      }
    }
  }

  console.log(`Total same-folder duplicate names found: ${duplicatesFound}`);
  await mongoose.disconnect();
}

checkSameFolderDuplicates().catch(console.error);
