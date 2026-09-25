import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- Starting QA Test: UI IMPROVEMENT-027 (Two-Line Table Headers) ---');

const testDetailFile = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTestDetail.jsx');
const content = fs.readFileSync(testDetailFile, 'utf8');

// 1. Check two-line header conversions
assert(
  content.includes('Candidate<br />Name') || content.includes('Candidate<br/>Name') || content.includes('Candidate<br />\n                          Name'),
  'Failed: Candidate Name must be rendered across two lines'
);

assert(
  content.includes('Room<br />Joined') || content.includes('Room<br/>Joined') || content.includes('Room<br />\n                          Joined'),
  'Failed: Room Joined must be rendered across two lines'
);

assert(
  content.includes('Test<br />Start') || content.includes('Test<br/>Start') || content.includes('Test<br />\n                          Start'),
  'Failed: Test Start must be rendered across two lines'
);

assert(
  content.includes('Submitted<br />At') || content.includes('Submitted<br/>At') || content.includes('Submitted<br />\n                          At'),
  'Failed: Submitted At must be rendered across two lines'
);

assert(
  content.includes('Time<br />Taken') || content.includes('Time<br/>Taken') || content.includes('Time<br />\n                          Taken'),
  'Failed: Time Taken must be rendered across two lines'
);

// 2. Check single-word headers remain unchanged
assert(content.includes('<th>Email</th>'), 'Failed: Email header should remain unchanged');
assert(content.includes('<th>Violations</th>'), 'Failed: Violations header should remain unchanged');
assert(content.includes('<th>Status</th>'), 'Failed: Status header should remain unchanged');
assert(content.includes('Questions</th>'), 'Failed: Questions header should remain unchanged');

// 3. Check minWidth optimization and vertical alignment
assert(
  content.includes("minWidth: 780"),
  'Failed: Table minWidth should be optimized to 780 for compact fit'
);
assert(
  content.includes("verticalAlign: 'bottom'"),
  'Failed: thead tr should have verticalAlign: bottom for uniform header alignment'
);

// 4. Check BUG-99 modal close logic is preserved
assert(
  content.includes('handleCloseRoomCandidatesModal'),
  'Failed: BUG-99 handleCloseRoomCandidatesModal must be preserved'
);

console.log('✓ All UI IMPROVEMENT-027 two-line header assertions passed successfully');
console.log('--- UI IMPROVEMENT-027 QA PASS ---');
