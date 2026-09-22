const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const Candidate = require('../../models/Candidate');
const { candidateRegister, candidateLogin } = require('../../controllers/authController');

function createMockReqRes(body = {}) {
  const req = { body };
  let statusCode = 200;
  let responseData = null;

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      responseData = data;
      return res;
    },
  };

  return { req, res, getStatus: () => statusCode, getData: () => responseData };
}

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: FEATURE-020 (Candidate Register Restructuring)');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  const createdCandidateIds = [];

  try {
    const timestamp = Date.now();

    // ── TEST 1: Register candidate with all new fields populated ──
    console.log('\n--- 1. Candidate registration with all fields ---');
    const fullCandidateData = {
      name: `Full Register Candidate ${timestamp}`,
      fatherName: 'John Doe Sr.',
      email: `full_candidate_${timestamp}@globussoft.com`,
      phone: '+91 9876543210',
      qualification: 'B.Tech',
      stream: 'Computer Science',
      address: 'Bangalore, Karnataka, India',
      password: 'StrongPassword123!',
    };

    const mock1 = createMockReqRes(fullCandidateData);
    let nextCalled = false;
    await candidateRegister(mock1.req, mock1.res, (err) => {
      if (err) console.error(err);
      nextCalled = true;
    });

    assert(!nextCalled && mock1.getStatus() === 201, 'Status 201 on full candidate registration');
    const registered1 = mock1.getData();
    assert(registered1 && registered1.candidate, 'Response includes candidate object');
    assert(registered1.candidate.name === fullCandidateData.name, 'Candidate name matches');
    assert(registered1.candidate.fatherName === fullCandidateData.fatherName, 'Candidate fatherName matches in response');
    assert(registered1.candidate.email === fullCandidateData.email.toLowerCase(), 'Candidate email matches');
    assert(registered1.candidate.phone === fullCandidateData.phone, 'Candidate phone matches');
    assert(registered1.candidate.qualification === fullCandidateData.qualification, 'Candidate qualification matches');
    assert(registered1.candidate.stream === fullCandidateData.stream, 'Candidate stream matches');
    assert(registered1.candidate.address === fullCandidateData.address, 'Candidate address matches');
    assert(!!registered1.token && !!registered1.refreshToken, 'Access and refresh tokens generated');

    // Verify persisted in DB
    const dbCandidate1 = await Candidate.findById(registered1.candidate.id);
    assert(dbCandidate1 !== null, 'Candidate document persisted in MongoDB');
    assert(dbCandidate1.fatherName === 'John Doe Sr.', 'fatherName persisted in MongoDB');
    assert(dbCandidate1.qualification === 'B.Tech', 'qualification persisted in MongoDB');
    assert(dbCandidate1.stream === 'Computer Science', 'stream persisted in MongoDB');
    assert(dbCandidate1.address === 'Bangalore, Karnataka, India', 'address persisted in MongoDB');
    createdCandidateIds.push(dbCandidate1._id);

    // ── TEST 2: Register candidate with only mandatory fields (optional fields blank/omitted) ──
    console.log('\n--- 2. Candidate registration with only mandatory fields (optional blank) ---');
    const minimalCandidateData = {
      name: `Minimal Candidate ${timestamp}`,
      email: `minimal_candidate_${timestamp}@globussoft.com`,
      password: 'StrongPassword123!',
    };

    const mock2 = createMockReqRes(minimalCandidateData);
    await candidateRegister(mock2.req, mock2.res, (err) => {
      if (err) console.error(err);
    });

    assert(mock2.getStatus() === 201, 'Status 201 on minimal candidate registration (optional fields omitted)');
    const registered2 = mock2.getData();
    assert(registered2.candidate.fatherName === '', 'fatherName defaults to empty string');
    assert(registered2.candidate.phone === '', 'phone defaults to empty string');
    assert(registered2.candidate.qualification === '', 'qualification defaults to empty string');
    assert(registered2.candidate.stream === '', 'stream defaults to empty string');
    assert(registered2.candidate.address === '', 'address defaults to empty string');
    createdCandidateIds.push(registered2.candidate.id);

    // ── TEST 3: Validation enforcement ──
    console.log('\n--- 3. Validation enforcement ---');
    // Missing email
    const mockNoEmail = createMockReqRes({ name: 'No Email', password: 'password123' });
    await candidateRegister(mockNoEmail.req, mockNoEmail.res, () => {});
    assert(mockNoEmail.getStatus() === 400, 'Status 400 when mandatory email is missing');

    // Missing password
    const mockNoPass = createMockReqRes({ name: 'No Pass', email: `nopass_${timestamp}@globussoft.com` });
    await candidateRegister(mockNoPass.req, mockNoPass.res, () => {});
    assert(mockNoPass.getStatus() === 400, 'Status 400 when mandatory password is missing');

    // Password length < 6
    const mockShortPass = createMockReqRes({ name: 'Short', email: `short_${timestamp}@globussoft.com`, password: '123' });
    await candidateRegister(mockShortPass.req, mockShortPass.res, () => {});
    assert(mockShortPass.getStatus() === 400, 'Status 400 when password is < 6 characters');

    // Duplicate email
    const mockDup = createMockReqRes(fullCandidateData);
    await candidateRegister(mockDup.req, mockDup.res, () => {});
    assert(mockDup.getStatus() === 409, 'Status 409 when email already exists');

    // ── TEST 4: Login returns full candidate model ──
    console.log('\n--- 4. Candidate login returns new profile fields ---');
    const mockLogin = createMockReqRes({
      email: fullCandidateData.email,
      password: fullCandidateData.password,
    });
    await candidateLogin(mockLogin.req, mockLogin.res, () => {});
    assert(mockLogin.getStatus() === 200, 'Status 200 on candidate login');
    const loginData = mockLogin.getData();
    assert(loginData.candidate.fatherName === 'John Doe Sr.', 'Login returns candidate fatherName');
    assert(loginData.candidate.qualification === 'B.Tech', 'Login returns candidate qualification');
    assert(loginData.candidate.stream === 'Computer Science', 'Login returns candidate stream');
    assert(loginData.candidate.address === 'Bangalore, Karnataka, India', 'Login returns candidate address');

    // ── TEST 5: Frontend File Inspection for FEATURE-020 requirements ──
    console.log('\n--- 5. Frontend CandidateRegister.jsx Inspection ---');
    const candidateRegisterPath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateRegister.jsx');
    const fileContent = fs.readFileSync(candidateRegisterPath, 'utf8');

    // Requirement 1: Field ordering
    const nameIdx = fileContent.indexOf('htmlFor="name"');
    const fatherNameIdx = fileContent.indexOf('htmlFor="fatherName"');
    const emailIdx = fileContent.indexOf('htmlFor="email"');
    const phoneIdx = fileContent.indexOf('htmlFor="phone"');
    const qualIdx = fileContent.indexOf('htmlFor="qualification"');
    const streamIdx = fileContent.indexOf('htmlFor="stream"');
    const addressIdx = fileContent.indexOf('htmlFor="address"');
    const passIdx = fileContent.indexOf('htmlFor="password"');

    assert(
      nameIdx !== -1 &&
      fatherNameIdx > nameIdx &&
      emailIdx > fatherNameIdx &&
      phoneIdx > emailIdx &&
      qualIdx > phoneIdx &&
      streamIdx > qualIdx &&
      addressIdx > streamIdx &&
      passIdx > addressIdx,
      'Exact field order verified: Full Name -> Father\'s Name -> Email -> Phone -> Qualification -> Stream -> Address -> Password'
    );

    // Requirement 2: Confirm Password removed entirely
    assert(!fileContent.includes('confirmPassword') && !fileContent.includes('Confirm Password'), 'Confirm Password field and logic completely removed');

    // Requirement 3: No (optional) or (required) text in labels
    assert(!fileContent.includes('(optional)'), 'No "(optional)" labels present in form');
    assert(!fileContent.includes('(required)'), 'No "(required)" labels present in form');

    // Requirement 4: Subtitle text cleaned up
    assert(
      fileContent.includes('<p className="auth-subtitle">Register to join the test.</p>'),
      'Subtitle is strictly "Register to join the test." (account validity sentence removed)'
    );
    assert(!fileContent.includes('Your account is valid for 3 days.</p>'), 'Validity sentence removed from subtitle');

    // Requirement 5: Warning box removed
    assert(!fileContent.includes('Use Chrome or Edge browser') && !fileContent.includes('webcam access and fullscreen mode'), 'Warning box notice completely removed');

    // Requirement 6: Side-by-side layout for Qualification + Stream
    assert(
      fileContent.includes("gridTemplateColumns: '1fr 1fr'") || fileContent.includes('grid-template-columns'),
      'Qualification and Stream are configured in a two-column grid row'
    );

  } finally {
    // Cleanup created test candidates
    if (createdCandidateIds.length > 0) {
      await Candidate.deleteMany({ _id: { $in: createdCandidateIds } });
    }
    await mongoose.disconnect();
  }

  console.log(`\n========================================================================`);
  console.log(`QA RESULTS: ${passedTests} / ${totalTests} assertions passed (${passedTests === totalTests ? 'ALL PASSED' : 'SOME FAILED'})`);
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal error running QA suite:', err);
  process.exit(1);
});
