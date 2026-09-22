/**
 * QA Test Suite for FEATURE-018:
 * Split Candidate Instructions into Two-Page Flow + New Default Test Instructions Text
 *
 * Verifies:
 * 1. CreateTestModal.jsx pre-fills the new 6-item default Test Instructions text:
 *    - "1. Carefully read problem instructions, and code using the specified language."
 *    - "2. Thoroughly test your code with sample cases before submitting."
 *    - "3. Avoid plagiarism and unauthorized collaboration; maintain integrity."
 *    - "4. Manage your time wisely among questions and monitor the clock."
 *    - "5. Ensure you answer the respective Set that will be assigned to you."
 *    - "6. Submit your solutions before the deadline, and remember to follow any offline instructions provided."
 *    - Remains editable via textarea and INITIAL_FORM_STATE.
 *
 * 2. CandidateInstructions.jsx implements the two-page sequential flow:
 *    - PAGE 1: Shows Test Instructions card + Mandatory Proctoring Rules.
 *              Does NOT show header stats or Device Permissions.
 *              Includes "Next: Device Permissions & Setup" button.
 *    - PAGE 2: Shows Back button ("Back to Instructions & Rules").
 *              Shows FEATURE-017 Header card (badge, title, accent bar, 4 stat blocks).
 *              Shows Device Permissions panel & Start Test button.
 *
 * 3. Non-regression: Start Test logic, proctoring rules, media checks intact.
 */

const fs = require('fs');
const path = require('path');

const CLIENT_ROOT = path.resolve(__dirname, '../../../../client/src');

function runTests() {
  console.log('========================================================================');
  console.log('FEATURE-018: Split Instructions Flow & 6-Item Default Instructions');
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

  // --- Step 1: Verify CreateTestModal.jsx Default Instructions ---
  console.log('--- Step 1: Verify New 6-Item Default Test Instructions in CreateTestModal.jsx ---');
  const createTestModalPath = path.join(CLIENT_ROOT, 'shared/CreateTestModal.jsx');
  assert(fs.existsSync(createTestModalPath), 'CreateTestModal.jsx exists');

  const createModalCode = fs.readFileSync(createTestModalPath, 'utf8');

  assert(
    createModalCode.includes('1. Carefully read problem instructions, and code using the specified language.'),
    'Item 1: "Carefully read problem instructions, and code using the specified language." present'
  );
  assert(
    createModalCode.includes('2. Thoroughly test your code with sample cases before submitting.'),
    'Item 2: "Thoroughly test your code with sample cases before submitting." present'
  );
  assert(
    createModalCode.includes('3. Avoid plagiarism and unauthorized collaboration; maintain integrity.'),
    'Item 3: "Avoid plagiarism and unauthorized collaboration; maintain integrity." present'
  );
  assert(
    createModalCode.includes('4. Manage your time wisely among questions and monitor the clock.'),
    'Item 4: "Manage your time wisely among questions and monitor the clock." present'
  );
  assert(
    createModalCode.includes('5. Ensure you answer the respective Set that will be assigned to you.'),
    'Item 5: "Ensure you answer the respective Set that will be assigned to you." present'
  );
  assert(
    createModalCode.includes('6. Submit your solutions before the deadline, and remember to follow any offline instructions provided.'),
    'Item 6: "Submit your solutions before the deadline, and remember to follow any offline instructions provided." present'
  );
  assert(
    !createModalCode.includes('1. Maintain full-screen mode throughout the test.'),
    'Legacy 4-item default instructions successfully replaced'
  );
  assert(
    createModalCode.includes('name="instructions"') && createModalCode.includes('onChange={handleInputChange}'),
    'Test instructions textarea remains fully editable by admins'
  );

  // --- Step 2: Verify CandidateInstructions.jsx Two-Page Split ---
  console.log('\n--- Step 2: Verify CandidateInstructions.jsx Two-Page Split ---');
  const instructionsPath = path.join(CLIENT_ROOT, 'candidate/pages/CandidateInstructions.jsx');
  assert(fs.existsSync(instructionsPath), 'CandidateInstructions.jsx exists');

  const instructionsCode = fs.readFileSync(instructionsPath, 'utf8');

  assert(
    instructionsCode.includes('currentStep') && instructionsCode.includes('setCurrentStep'),
    'CandidateInstructions maintains currentStep state for two-page flow'
  );
  assert(
    instructionsCode.includes('currentStep === 1'),
    'Page 1 conditional branch exists for step 1'
  );
  assert(
    instructionsCode.includes('id="next-step-btn"'),
    'Page 1 includes "Next" button with id="next-step-btn"'
  );
  assert(
    instructionsCode.includes('id="back-step-btn"'),
    'Page 2 includes "Back" button with id="back-step-btn"'
  );

  // Step 3: Structure of Page 1 vs Page 2
  console.log('\n--- Step 3: Verify Content Segregation (Page 1 vs Page 2) ---');
  // In Page 1:
  const page1Index = instructionsCode.indexOf('currentStep === 1 ? (');
  const page2Index = instructionsCode.indexOf('/* ── PAGE 2: Permissions & Start ── */');

  const page1Content = instructionsCode.slice(page1Index, page2Index);
  const page2Content = instructionsCode.slice(page2Index);

  assert(
    page1Content.includes('Test Instructions') && page1Content.includes('Mandatory Proctoring Rules'),
    'Page 1 contains Test Instructions and Mandatory Proctoring Rules'
  );
  assert(
    !page1Content.includes('instructions-header-block') && !page1Content.includes('Device Permissions (FR-5.2)'),
    'Page 1 does NOT contain header stats or Device Permissions'
  );

  assert(
    page2Content.includes('instructions-header-block') &&
    page2Content.includes('Total Questions') &&
    page2Content.includes('Passing Criteria') &&
    page2Content.includes('Device Permissions (FR-5.2)') &&
    page2Content.includes('start-test-btn'),
    'Page 2 contains Header Stats (Option B), Device Permissions, and Start Test button'
  );

  // Step 4: Non-Regression on Proctoring and Permissions
  console.log('\n--- Step 4: Verify Non-Regression on Media & Fullscreen Lifecycle ---');
  assert(
    instructionsCode.includes('requestMediaPermissions') &&
    instructionsCode.includes('handleVideoRef') &&
    instructionsCode.includes('verifyActiveVideoStream'),
    'Device permission verification and video streaming logic preserved'
  );
  assert(
    instructionsCode.includes('handleStartTest') &&
    instructionsCode.includes('requestFullscreen') &&
    instructionsCode.includes('startAttempt'),
    'Start test attempt and fullscreen activation logic preserved'
  );

  // Step 5: Visual Design & Button Label (Follow-up)
  console.log('\n--- Step 5: Verify Page 1 Visual Polish & "Next" Button Label ---');
  assert(
    page1Content.includes('<span>Next</span>') && page1Content.includes('id="next-step-btn"'),
    'Page 1 button text is simplified to "Next"'
  );
  assert(
    page1Content.includes('color: \'#0E7C86\'') && page1Content.includes('borderRadius: 6'),
    'Test instructions use styled teal numbered badges'
  );
  assert(
    page1Content.includes('background: \'#FFF8F6\'') && page1Content.includes('border: \'1px solid #FFE4DE\''),
    'Mandatory Proctoring Rules section has subtle warning background tint'
  );
  assert(
    page1Content.includes('<svg') && page1Content.includes('stroke="#DC2626"'),
    'Mandatory Proctoring Rules use clean SVG warning/cross icon chips instead of bare characters'
  );

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();

