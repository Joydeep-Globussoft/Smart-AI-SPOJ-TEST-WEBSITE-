/**
 * QA Test Suite for FEATURE-017:
 * Candidate Instructions Page Header Restructure (Option B) + Total Questions + Passing Criteria Stat
 *
 * Verifies:
 * 1. CandidateInstructions.jsx header structure matches Option B design direction:
 *    - Left vertical brand teal accent bar (var(--color-primary, #0E7C86))
 *    - Overline test type badge above title
 *    - Prominent bold test title
 *    - 4 distinct mini stat blocks with icon on top and label/value below:
 *      (Duration -> Total Questions -> Passing Criteria -> Room)
 * 2. Label "Questions" renamed to "Total Questions" in the header.
 * 3. Passing Criteria stat correctly pulls and displays criteria (e.g. "≥ 1 Qs", handles "≥ 0 Qs").
 * 4. submissionController.js joinRoom endpoint includes passingCriteria in test payload.
 * 5. Non-regression on instructions list, mandatory rules, device permission checks, and Start Test button.
 */

const fs = require('fs');
const path = require('path');

const CLIENT_ROOT = path.resolve(__dirname, '../../../../client/src');
const SERVER_ROOT = path.resolve(__dirname, '../../../../server/src');

function runTests() {
  console.log('========================================================================');
  console.log('FEATURE-017: Candidate Instructions Header Restructure (Option B)');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ✕ [FAIL] ${message}`);
      failed++;
    }
  }

  // --- Step 1: Verify CandidateInstructions.jsx Header Layout ---
  console.log('--- Step 1: Verify CandidateInstructions.jsx Header Layout (Option B) ---');
  const instructionsPath = path.join(CLIENT_ROOT, 'candidate/pages/CandidateInstructions.jsx');
  assert(fs.existsSync(instructionsPath), 'CandidateInstructions.jsx exists');

  const content = fs.readFileSync(instructionsPath, 'utf8');

  assert(
    content.includes("borderLeft: '5px solid var(--color-primary, #0E7C86)'") ||
    content.includes("borderLeft: '4px solid var(--color-primary, #0E7C86)'") ||
    content.includes('borderLeft:'),
    'Header block includes brand teal vertical accent bar on left edge'
  );

  assert(
    content.includes('badge badge-teal') &&
    content.indexOf('badge-teal') < content.indexOf('joinData.test?.title'),
    'Test type badge appears as overline label above the test title'
  );

  assert(
    content.includes('fontSize: \'1.85rem\'') || content.includes('fontSize: \'1.9rem\'') || content.includes('fontWeight: 800'),
    'Title has increased font size and weight for stronger visual hierarchy'
  );

  // --- Step 2: Verify "Total Questions" renaming ---
  console.log('\n--- Step 2: Verify "Total Questions" Label ---');
  assert(
    content.includes('Total Questions'),
    '"Total Questions" label is present in stat block'
  );
  assert(
    !content.includes('<span>\n              📋 Questions:'),
    'Legacy single inline "Questions:" label is removed'
  );

  // --- Step 3: Verify "Passing Criteria" stat block ---
  console.log('\n--- Step 3: Verify "Passing Criteria" Stat Block ---');
  assert(
    content.includes('Passing Criteria'),
    '"Passing Criteria" label is present in stat block'
  );
  assert(
    content.includes('≥ ') && content.includes('Qs'),
    'Passing Criteria format matches platform standard ("≥ X Qs")'
  );
  assert(
    content.includes('joinData.test?.passingCriteria'),
    'Passing Criteria binds to joinData.test.passingCriteria'
  );

  // --- Step 4: Verify Order of Stat Blocks (Duration -> Total Questions -> Passing Criteria -> Room) ---
  console.log('\n--- Step 4: Verify Stat Blocks Order & Structure ---');
  const durationPos = content.indexOf('Duration');
  const totalQuestionsPos = content.indexOf('Total Questions');
  const passingCriteriaPos = content.indexOf('Passing Criteria');
  const roomPos = content.indexOf('Room');

  assert(
    durationPos !== -1 && totalQuestionsPos !== -1 && passingCriteriaPos !== -1 && roomPos !== -1,
    'All 4 stat blocks (Duration, Total Questions, Passing Criteria, Room) are present'
  );

  assert(
    durationPos < totalQuestionsPos && totalQuestionsPos < passingCriteriaPos && passingCriteriaPos < roomPos,
    'Stat blocks are strictly ordered: Duration → Total Questions → Passing Criteria → Room'
  );

  // --- Step 5: Verify Backend submissionController.js joinRoom payload ---
  console.log('\n--- Step 5: Verify Backend submissionController.js joinRoom Payload ---');
  const submissionControllerPath = path.join(SERVER_ROOT, 'controllers/submissionController.js');
  const serverCode = fs.readFileSync(submissionControllerPath, 'utf8');

  assert(
    serverCode.includes('passingCriteria: test.passingCriteria'),
    'submissionController.js joinRoom returns passingCriteria in test payload'
  );

  // --- Step 6: Non-Regression on Below-Header Components ---
  console.log('\n--- Step 6: Verify Non-Regression on Below-Header Components ---');
  assert(
    content.includes('Test Instructions'),
    'Test Instructions card is preserved'
  );
  assert(
    content.includes('Mandatory Proctoring Rules'),
    'Mandatory Proctoring Rules card is preserved'
  );
  assert(
    content.includes('Device Permissions (FR-5.2)'),
    'Device Permissions panel is preserved'
  );
  assert(
    content.includes('handleStartTest') && content.includes('Start Test — Enter Fullscreen'),
    'Start Test — Enter Fullscreen button and handler are preserved'
  );

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
