import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- Starting QA Test: Verify Logo Imports Across All Candidate and Admin Screens ---');

const clientSrc = path.resolve(__dirname, '../../../../client/src');

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith('.jsx') || file.endsWith('.js')) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

const allJsxFiles = getAllFiles(clientSrc);

allJsxFiles.forEach((filePath) => {
  const code = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(clientSrc, filePath);

  // Check that no file references undefined globussoftLogo
  assert(
    !code.includes('globussoftLogo'),
    `Failed: ${relativePath} contains reference to undefined globussoftLogo`
  );
});

// Specifically check CandidateInstructions.jsx
const instructionsCode = fs.readFileSync(path.join(clientSrc, 'candidate/pages/CandidateInstructions.jsx'), 'utf8');
assert(
  instructionsCode.includes("import logoLight from '../../assets/logo-light.png';"),
  'Failed: CandidateInstructions.jsx must import logoLight'
);
assert(
  instructionsCode.includes('src={logoLight}'),
  'Failed: CandidateInstructions.jsx must use logoLight in top banner'
);

console.log('✓ All JSX files verified: 0 undefined logo references');
console.log('✓ CandidateInstructions.jsx correctly imports and renders logoLight');
console.log('--- Logo Import QA PASS ---');
