/**
 * Automated QA test for FEATURE-033:
 * Replace platform logo with new light/dark variants — swap by theme in admin panel, light-only on candidate pages
 */
const fs = require('fs');
const path = require('path');

async function runFeature033Tests() {
  console.log('====================================================');
  console.log('🧪 QA TEST SUITE: FEATURE-033 LOGO SWAP & LIGHT BRANDING');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Check Asset Files Exist in client and server
  const clientLogoLight = path.resolve(__dirname, '../../../../client/src/assets/logo-light.png');
  const clientLogoDark = path.resolve(__dirname, '../../../../client/src/assets/logo-dark.png');
  const clientPublicLogoLight = path.resolve(__dirname, '../../../../client/public/logo-light.png');
  const clientPublicLogoDark = path.resolve(__dirname, '../../../../client/public/logo-dark.png');
  const serverLogoLight = path.resolve(__dirname, '../../assets/logo-light.png');
  const serverLogoDark = path.resolve(__dirname, '../../assets/logo-dark.png');

  assert(fs.existsSync(clientLogoLight) && fs.statSync(clientLogoLight).size > 1000, 'client/src/assets/logo-light.png exists and is valid');
  assert(fs.existsSync(clientLogoDark) && fs.statSync(clientLogoDark).size > 1000, 'client/src/assets/logo-dark.png exists and is valid');
  assert(fs.existsSync(clientPublicLogoLight) && fs.statSync(clientPublicLogoLight).size > 1000, 'client/public/logo-light.png exists');
  assert(fs.existsSync(clientPublicLogoDark) && fs.statSync(clientPublicLogoDark).size > 1000, 'client/public/logo-dark.png exists');
  assert(fs.existsSync(serverLogoLight) && fs.statSync(serverLogoLight).size > 1000, 'server/src/assets/logo-light.png exists');
  assert(fs.existsSync(serverLogoDark) && fs.statSync(serverLogoDark).size > 1000, 'server/src/assets/logo-dark.png exists');

  // 2. Check AdminNavbar.jsx
  const adminNavbarCode = fs.readFileSync(path.resolve(__dirname, '../../../../client/src/shared/AdminNavbar.jsx'), 'utf8');
  assert(adminNavbarCode.includes("import logoLight from '../assets/logo-light.png';"), 'AdminNavbar imports logoLight');
  assert(adminNavbarCode.includes("import logoDark from '../assets/logo-dark.png';"), 'AdminNavbar imports logoDark');
  assert(adminNavbarCode.includes('src={isDark ? logoDark : logoLight}'), 'AdminNavbar dynamically swaps logo based on isDark');

  // 3. Check AdminLogin.jsx
  const adminLoginCode = fs.readFileSync(path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLogin.jsx'), 'utf8');
  assert(adminLoginCode.includes("import logoLight from '../../assets/logo-light.png';"), 'AdminLogin imports logoLight');
  assert(adminLoginCode.includes("import logoDark from '../../assets/logo-dark.png';"), 'AdminLogin imports logoDark');
  assert(adminLoginCode.includes('src={isDark ? logoDark : logoLight}'), 'AdminLogin dynamically swaps logo based on isDark');

  // 4. Candidate Pages: All must use ONLY logoLight
  const candidatePages = [
    { file: 'CandidateRegister.jsx', name: 'Candidate Register' },
    { file: 'CandidateLogin.jsx', name: 'Candidate Login' },
    { file: 'CandidateJoinRoom.jsx', name: 'Candidate Join Room' },
    { file: 'CandidateTestScreen.jsx', name: 'Candidate Test Screen' },
    { file: 'CandidateAITestScreen.jsx', name: 'Candidate AI Test Screen' },
    { file: 'CandidateTestComplete.jsx', name: 'Candidate Test Complete' }
  ];

  for (const page of candidatePages) {
    const code = fs.readFileSync(path.resolve(__dirname, `../../../../client/src/candidate/pages/${page.file}`), 'utf8');
    assert(code.includes("import logoLight from '../../assets/logo-light.png';"), `${page.name} imports logoLight`);
    assert(!code.includes("import logoDark"), `${page.name} does NOT import logoDark (light-only)`);
    assert(code.includes('src={logoLight}'), `${page.name} renders src={logoLight}`);
  }

  // 5. PDF Letterhead in evaluationController.js
  const evalCode = fs.readFileSync(path.resolve(__dirname, '../../controllers/evaluationController.js'), 'utf8');
  assert(evalCode.includes("logo-light.png"), 'evaluationController uses logo-light.png for PDF generation');

  console.log(`\n====================================================`);
  console.log(`📊 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runFeature033Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
