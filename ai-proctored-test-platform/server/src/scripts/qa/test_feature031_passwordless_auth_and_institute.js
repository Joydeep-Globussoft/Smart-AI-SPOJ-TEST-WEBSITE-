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
  console.log('QA VERIFICATION SUITE: FEATURE-031 (Passwordless Auth & Institute Name)');
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

    // ── TEST 1: Register candidate without password and with instituteName ──
    console.log('\n--- 1. Candidate registration without password and with instituteName ---');
    const fullCandidateData = {
      name: `Passwordless Candidate ${timestamp}`,
      fatherName: 'Robert Sr.',
      email: `passwordless_${timestamp}@globussoft.com`,
      phone: '+91 9123456780',
      qualification: 'B.Tech',
      stream: 'Computer Science & Engineering',
      instituteName: 'National Institute of Technology',
      address: 'Bangalore, Karnataka, India',
    };

    const mock1 = createMockReqRes(fullCandidateData);
    let nextCalled = false;
    await candidateRegister(mock1.req, mock1.res, (err) => {
      if (err) console.error(err);
      nextCalled = true;
    });

    assert(!nextCalled && (mock1.getStatus() === 200 || mock1.getStatus() === 201), 'Status 200/201 on passwordless candidate registration');
    const reg1 = mock1.getData();
    assert(reg1 && reg1.candidate, 'Response includes candidate object');
    assert(reg1.candidate.name === fullCandidateData.name, 'Candidate name matches');
    assert(reg1.candidate.instituteName === 'National Institute of Technology', 'Candidate instituteName matches in response');
    assert(reg1.candidate.qualification === 'B.Tech', 'Candidate qualification matches');
    assert(reg1.candidate.stream === 'Computer Science & Engineering', 'Candidate stream matches');
    assert(!!reg1.token && !!reg1.refreshToken, 'Access and refresh tokens generated');

    const dbCandidate1 = await Candidate.findById(reg1.candidate.id);
    assert(dbCandidate1 !== null, 'Candidate persisted in MongoDB');
    assert(dbCandidate1.instituteName === 'National Institute of Technology', 'instituteName persisted in MongoDB');
    assert(!dbCandidate1.passwordHash, 'passwordHash is undefined/empty for new registrations');
    createdCandidateIds.push(dbCandidate1._id);

    // ── TEST 2: Register candidate with minimal fields (no password) ──
    console.log('\n--- 2. Candidate registration with minimal mandatory fields ---');
    const minData = {
      name: `Minimal Candidate ${timestamp}`,
      email: `min_candidate_${timestamp}@globussoft.com`,
    };

    const mock2 = createMockReqRes(minData);
    await candidateRegister(mock2.req, mock2.res, () => {});
    assert(mock2.getStatus() === 200 || mock2.getStatus() === 201, 'Status 200/201 on minimal registration');
    const reg2 = mock2.getData();
    assert(reg2.candidate.instituteName === '', 'instituteName defaults to empty string');
    assert(reg2.candidate.address === '', 'address defaults to empty string');
    const dbCandidate2 = await Candidate.findById(reg2.candidate.id);
    createdCandidateIds.push(dbCandidate2._id);

    // ── TEST 3: Validation failure on missing email or name ──
    console.log('\n--- 3. Validation failures on registration ---');
    const mock3a = createMockReqRes({ name: 'No Email Candidate' });
    await candidateRegister(mock3a.req, mock3a.res, () => {});
    assert(mock3a.getStatus() === 400, 'Status 400 when email is missing');

    const mock3b = createMockReqRes({ email: 'noname@globussoft.com' });
    await candidateRegister(mock3b.req, mock3b.res, () => {});
    assert(mock3b.getStatus() === 400, 'Status 400 when name is missing');

    // ── TEST 4: Passwordless login with valid email ──
    console.log('\n--- 4. Passwordless login with registered email ---');
    const mock4 = createMockReqRes({ email: fullCandidateData.email });
    await candidateLogin(mock4.req, mock4.res, () => {});
    assert(mock4.getStatus() === 200, 'Status 200 on passwordless login');
    const log4 = mock4.getData();
    assert(log4.candidate && log4.candidate.email === fullCandidateData.email.toLowerCase(), 'Login returns candidate data');
    assert(log4.candidate.instituteName === 'National Institute of Technology', 'Login candidate includes instituteName');
    assert(!!log4.token && !!log4.refreshToken, 'Login returns JWT tokens');

    // ── TEST 5: Passwordless login with non-existent email ──
    console.log('\n--- 5. Passwordless login with non-existent email ---');
    const mock5 = createMockReqRes({ email: `nonexistent_${timestamp}@globussoft.com` });
    await candidateLogin(mock5.req, mock5.res, () => {});
    assert(mock5.getStatus() === 401, 'Status 401 on non-existent email login');
    assert(mock5.getData().error === 'No account found with this email. Please create an account.', 'Accurate error message on non-existent account');

    // ── TEST 6: Passwordless login with blank email ──
    console.log('\n--- 6. Passwordless login with blank email ---');
    const mock6 = createMockReqRes({ email: '   ' });
    await candidateLogin(mock6.req, mock6.res, () => {});
    assert(mock6.getStatus() === 400, 'Status 400 on empty email');

    // ── TEST 7: Upsert re-registration on existing email ──
    console.log('\n--- 7. Re-registration upsert on existing email ---');
    const updatedData = {
      name: `Updated Name ${timestamp}`,
      fatherName: 'Updated Father Name',
      email: fullCandidateData.email, // Same email
      phone: '+91 9999999999',
      qualification: 'M.Tech',
      stream: 'AI & Data Science',
      instituteName: 'Indian Institute of Science (IISc)',
      address: 'Bengaluru Center, Karnataka',
    };

    const mock7 = createMockReqRes(updatedData);
    await candidateRegister(mock7.req, mock7.res, () => {});
    assert(mock7.getStatus() === 200 || mock7.getStatus() === 201, 'Status 200/201 on re-registration upsert');
    const reg7 = mock7.getData();
    assert(reg7.candidate.id.toString() === dbCandidate1._id.toString(), 'Re-registration preserves the same candidate ID (upsert)');
    assert(reg7.candidate.name === updatedData.name, 'Name was updated on upsert');
    assert(reg7.candidate.instituteName === 'Indian Institute of Science (IISc)', 'instituteName updated on upsert');
    assert(reg7.candidate.qualification === 'M.Tech', 'qualification updated on upsert');
    assert(reg7.candidate.stream === 'AI & Data Science', 'stream updated on upsert');

    // Verify DB reflection
    const dbCandidate1Updated = await Candidate.findById(dbCandidate1._id);
    assert(dbCandidate1Updated.name === updatedData.name, 'DB reflects updated name');
    assert(dbCandidate1Updated.instituteName === 'Indian Institute of Science (IISc)', 'DB reflects updated instituteName');

    // ── TEST 8: Backwards compatibility with legacy candidates who had passwordHash ──
    console.log('\n--- 8. Legacy candidate with passwordHash logging in passwordless ---');
    const legacyHash = await bcrypt.hash('LegacySecretPassword123!', 10);
    const legacyCandidate = await Candidate.create({
      name: `Legacy Candidate ${timestamp}`,
      email: `legacy_${timestamp}@globussoft.com`,
      passwordHash: legacyHash,
      qualification: 'BCA',
      stream: 'IT',
      instituteName: 'Legacy University',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });
    createdCandidateIds.push(legacyCandidate._id);

    const mock8 = createMockReqRes({ email: `legacy_${timestamp}@globussoft.com` });
    await candidateLogin(mock8.req, mock8.res, () => {});
    assert(mock8.getStatus() === 200, 'Legacy candidate with passwordHash successfully logs in with email only');
    assert(mock8.getData().candidate.instituteName === 'Legacy University', 'Legacy candidate instituteName preserved');

    // ── TEST 9: Email case-insensitivity in register and login ──
    console.log('\n--- 9. Email case-insensitivity ---');
    const mixedEmail = `MixedCase_${timestamp}@GlobusSoft.COM`;
    const mock9a = createMockReqRes({ name: 'Case Candidate', email: mixedEmail });
    await candidateRegister(mock9a.req, mock9a.res, () => {});
    assert(mock9a.getStatus() === 200 || mock9a.getStatus() === 201, 'Registration normalizes mixed-case email');
    const reg9 = mock9a.getData();
    assert(reg9.candidate.email === mixedEmail.toLowerCase(), 'Saved email is lowercased');
    createdCandidateIds.push(reg9.candidate.id);

    const mock9b = createMockReqRes({ email: `MIXEDCASE_${timestamp}@GLOBUSSOFT.com` });
    await candidateLogin(mock9b.req, mock9b.res, () => {});
    assert(mock9b.getStatus() === 200, 'Login with uppercase variant succeeds');

    // ── TEST 10: Frontend inspection — No password inputs, Institute Name present ──
    console.log('\n--- 10. Frontend code verification ---');
    const registerPath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateRegister.jsx');
    const registerContent = fs.readFileSync(registerPath, 'utf8');
    assert(!registerContent.includes('PasswordInput'), 'CandidateRegister.jsx does not import or use PasswordInput');
    assert(!registerContent.includes('type="password"'), 'CandidateRegister.jsx has no password input type');
    assert(registerContent.includes('htmlFor="instituteName"'), 'CandidateRegister.jsx has Institute Name label');
    assert(registerContent.includes('id="instituteName"'), 'CandidateRegister.jsx has instituteName input field');

    // Verify ordering: Institute Name is above Address
    const instituteIdx = registerContent.indexOf('id="instituteName"');
    const addressIdx = registerContent.indexOf('id="address"');
    assert(instituteIdx !== -1 && addressIdx !== -1 && instituteIdx < addressIdx, 'Institute Name is placed above Address in CandidateRegister.jsx');

    const loginPath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateLogin.jsx');
    const loginContent = fs.readFileSync(loginPath, 'utf8');
    assert(!loginContent.includes('PasswordInput'), 'CandidateLogin.jsx does not import or use PasswordInput');
    assert(!loginContent.includes('type="password"'), 'CandidateLogin.jsx has no password input type');
    assert(loginContent.includes('id="email"'), 'CandidateLogin.jsx has email input');

  } catch (err) {
    console.error('Test execution error:', err);
    process.exitCode = 1;
  } finally {
    // Cleanup created test documents
    if (createdCandidateIds.length > 0) {
      await Candidate.deleteMany({ _id: { $in: createdCandidateIds } });
    }
    await mongoose.disconnect();
    console.log(`\n========================================================================`);
    console.log(`TEST RESULTS: ${passedTests}/${totalTests} Passed`);
    console.log(`========================================================================\n`);
  }
}

runTests();
