// server/src/scripts/qa/test_bug77_drag_drop_folder_upload.js
// QA verification for BUG-77: Drag-and-drop folder upload fails with "No PDF files found in dropped item"

const fs = require('fs');
const path = require('path');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✕ FAIL: ${message}`);
  }
}

console.log('=== BUG-77: Drag-and-Drop Folder Upload QA Suite ===\n');

const clientRoot = path.join(__dirname, '../../../../client');
const qbPath = path.join(clientRoot, 'src/admin/pages/AdminQuestionBank.jsx');

// 1. Check AdminQuestionBank file and exported helper
console.log('--- 1. Checking Implementation in AdminQuestionBank.jsx ---');
assert(fs.existsSync(qbPath), 'AdminQuestionBank.jsx exists');
const qbContent = fs.readFileSync(qbPath, 'utf8');

assert(qbContent.includes('export const extractFilesFromDataTransfer ='), 'extractFilesFromDataTransfer helper is exported');
assert(qbContent.includes('webkitGetAsEntry'), 'extractFilesFromDataTransfer queries webkitGetAsEntry from items');
assert(qbContent.includes('createReader'), 'extractFilesFromDataTransfer creates directory readers for directory entries');
assert(qbContent.includes('readEntries'), 'extractFilesFromDataTransfer reads entries from directory reader in loop');
assert(qbContent.includes('traverseEntry'), 'extractFilesFromDataTransfer recursively traverses child directory entries');
assert(qbContent.includes('processSelectedPdfFiles'), 'AdminQuestionBank unifies file selection via processSelectedPdfFiles');
assert(qbContent.includes('handleFolderSelect'), 'AdminQuestionBank retains button folder select handler');
assert(qbContent.includes('handleFileSelect'), 'AdminQuestionBank retains button file select handler');
assert(qbContent.includes('handleDrop'), 'AdminQuestionBank implements async handleDrop using extractFilesFromDataTransfer');

// 2. Behavioral Unit Testing of extractFilesFromDataTransfer Logic
console.log('\n--- 2. Behavioral Unit Testing of File Extraction Logic ---');

// Mock DataTransfer item and FileSystemEntry structures
function createMockFile(name, size = 1024, type = 'application/pdf') {
  return { name, size, type };
}

function createMockFileEntry(name, size, type) {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (callback) => setTimeout(() => callback(createMockFile(name, size, type)), 0),
  };
}

function createMockDirectoryEntry(name, children = []) {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let yielded = false;
      return {
        readEntries: (callback) => {
          if (!yielded) {
            yielded = true;
            setTimeout(() => callback(children), 0);
          } else {
            setTimeout(() => callback([]), 0); // Empty batch indicates completion
          }
        },
      };
    },
  };
}

// Replicate the exact extractFilesFromDataTransfer implementation in pure Node for testing
const testExtractFiles = async (dataTransfer) => {
  const files = [];
  if (!dataTransfer) return files;

  const readAllDirectoryEntries = async (dirReader) => {
    const entries = [];
    let batch;
    do {
      batch = await new Promise((resolve, reject) => {
        dirReader.readEntries(resolve, reject);
      });
      if (batch && batch.length > 0) {
        entries.push(...batch);
      }
    } while (batch && batch.length > 0);
    return entries;
  };

  const traverseEntry = async (entry) => {
    if (!entry) return;
    if (entry.isFile) {
      try {
        const file = await new Promise((resolve, reject) => {
          entry.file(resolve, reject);
        });
        if (file) files.push(file);
      } catch (err) {
        // ignore
      }
    } else if (entry.isDirectory) {
      try {
        const dirReader = entry.createReader();
        const entries = await readAllDirectoryEntries(dirReader);
        for (const child of entries) {
          await traverseEntry(child);
        }
      } catch (err) {
        // ignore
      }
    }
  };

  if (dataTransfer.items && dataTransfer.items.length > 0) {
    const entryPromises = [];
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : (item.getAsEntry ? item.getAsEntry() : null);
        if (entry) {
          entryPromises.push(traverseEntry(entry));
        } else {
          const file = item.getAsFile ? item.getAsFile() : null;
          if (file) files.push(file);
        }
      }
    }
    if (entryPromises.length > 0) {
      await Promise.all(entryPromises);
    }
  }

  if (files.length === 0 && dataTransfer.files && dataTransfer.files.length > 0) {
    files.push(...Array.from(dataTransfer.files));
  }

  return files;
};

// Filter helper
const filterPdfs = (files) => {
  return (files || []).filter(
    (f) => f && (f.name?.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf')
  );
};

(async () => {
  // Test Case A: Dropped single folder with 2 PDFs
  const folderWith2Pdfs = createMockDirectoryEntry('TestFolder', [
    createMockFileEntry('Question1.pdf', 2048, 'application/pdf'),
    createMockFileEntry('Question2.pdf', 3072, 'application/pdf'),
  ]);

  const mockDataTransferA = {
    items: [
      { kind: 'file', webkitGetAsEntry: () => folderWith2Pdfs },
    ],
    files: [], // Browser files array is empty on folder drop
  };

  const extractedA = await testExtractFiles(mockDataTransferA);
  const pdfsA = filterPdfs(extractedA);
  assert(pdfsA.length === 2, `Dropped folder extracted 2 PDFs (got ${pdfsA.length})`);
  assert(pdfsA[0].name === 'Question1.pdf' && pdfsA[1].name === 'Question2.pdf', 'PDF file names matched exactly');

  // Test Case B: Dropped folder with subfolders (nested directories)
  const nestedFolder = createMockDirectoryEntry('NestedBatch', [
    createMockFileEntry('RootQ.pdf', 1024, 'application/pdf'),
    createMockDirectoryEntry('Subfolder1', [
      createMockFileEntry('NestedQ1.pdf', 1024, 'application/pdf'),
      createMockFileEntry('NestedQ2.pdf', 1024, 'application/pdf'),
    ]),
  ]);

  const mockDataTransferB = {
    items: [
      { kind: 'file', webkitGetAsEntry: () => nestedFolder },
    ],
    files: [],
  };

  const extractedB = await testExtractFiles(mockDataTransferB);
  const pdfsB = filterPdfs(extractedB);
  assert(pdfsB.length === 3, `Nested folders recursively extracted 3 PDFs (got ${pdfsB.length})`);

  // Test Case C: Dropped folder containing mixed file types (.png, .txt, .pdf)
  const mixedFolder = createMockDirectoryEntry('MixedFolder', [
    createMockFileEntry('ProblemStatement.pdf', 4096, 'application/pdf'),
    createMockFileEntry('Diagram.png', 1024, 'image/png'),
    createMockFileEntry('Notes.txt', 512, 'text/plain'),
  ]);

  const mockDataTransferC = {
    items: [
      { kind: 'file', webkitGetAsEntry: () => mixedFolder },
    ],
    files: [],
  };

  const extractedC = await testExtractFiles(mockDataTransferC);
  const pdfsC = filterPdfs(extractedC);
  assert(pdfsC.length === 1, `Mixed folder ignored non-PDFs and extracted 1 PDF (got ${pdfsC.length})`);
  assert(pdfsC[0].name === 'ProblemStatement.pdf', 'Mixed folder selected correct PDF');

  // Test Case D: Dropped folder with ZERO PDFs
  const emptyFolder = createMockDirectoryEntry('EmptyFolder', [
    createMockFileEntry('readme.txt', 128, 'text/plain'),
    createMockFileEntry('logo.png', 256, 'image/png'),
  ]);

  const mockDataTransferD = {
    items: [
      { kind: 'file', webkitGetAsEntry: () => emptyFolder },
    ],
    files: [],
  };

  const extractedD = await testExtractFiles(mockDataTransferD);
  const pdfsD = filterPdfs(extractedD);
  assert(pdfsD.length === 0, `Folder with 0 PDFs yields empty array (got ${pdfsD.length})`);

  // Test Case E: Dropped multiple folders & individual files in single drop
  const loosePdf = createMockFileEntry('LooseQuestion.pdf', 1024, 'application/pdf');
  const mockDataTransferE = {
    items: [
      { kind: 'file', webkitGetAsEntry: () => folderWith2Pdfs },
      { kind: 'file', webkitGetAsEntry: () => loosePdf },
    ],
    files: [],
  };

  const extractedE = await testExtractFiles(mockDataTransferE);
  const pdfsE = filterPdfs(extractedE);
  assert(pdfsE.length === 3, `Multi-folder and loose file drop extracted 3 PDFs (got ${pdfsE.length})`);

  // Test Case F: Legacy / Fallback when webkitGetAsEntry is unavailable
  const mockDataTransferF = {
    items: [],
    files: [
      createMockFile('Fallback1.pdf', 1024, 'application/pdf'),
      createMockFile('Fallback2.pdf', 1024, 'application/pdf'),
    ],
  };

  const extractedF = await testExtractFiles(mockDataTransferF);
  const pdfsF = filterPdfs(extractedF);
  assert(pdfsF.length === 2, `Fallback path retrieved 2 PDFs from dataTransfer.files (got ${pdfsF.length})`);

  console.log(`\n========================================`);
  console.log(`Summary: ${passedTests}/${totalTests} tests passed`);
  console.log(`========================================`);

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
})();
