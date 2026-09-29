const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  console.log('--- STARTING BLAST RADIUS & CRASH VERIFICATION SUITE (BUG-115) ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const errors = [];
  page.on('pageerror', (err) => {
    errors.push(err.message);
    console.error('[PageError]:', err.message);
  });

  const checkPageForCrash = async (url, pageName) => {
    console.log(`\nNavigating to ${pageName} (${url})...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));
    
    // Check for error boundary text
    const errorBoundary = await page.evaluate(() => {
      const h1 = document.querySelector('h1, h2, div');
      const bodyText = document.body.innerText;
      if (bodyText.includes('Something went wrong') || bodyText.includes('is not defined')) {
        return bodyText;
      }
      return null;
    });

    if (errorBoundary) {
      console.error(`❌ CRASH DETECTED ON ${pageName}:\n${errorBoundary}`);
      return false;
    } else {
      console.log(`✅ ${pageName} loaded cleanly with NO Error Boundary.`);
      return true;
    }
  };

  try {
    // 1. Admin Login
    console.log('Logging into Admin Panel...');
    await page.goto('http://localhost:5173/admin/login', { waitUntil: 'networkidle2' });
    await page.type('input[type="email"], input[name="email"]', 'superadmin@globussoft.in');
    await page.type('input[type="password"], input[name="password"]', 'GlobusAdmin2026!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));

    // 2. Check Admin Tests (/admin/tests)
    const adminTestsOk = await checkPageForCrash('http://localhost:5173/admin/tests', 'Admin Tests (/admin/tests)');

    // 3. Check Admin Dashboard (/admin/dashboard)
    const adminDashOk = await checkPageForCrash('http://localhost:5173/admin/dashboard', 'Admin Dashboard (/admin/dashboard)');

    // 4. Check Admin Question Bank (/admin/questions)
    const adminQBankOk = await checkPageForCrash('http://localhost:5173/admin/questions', 'Admin Question Bank (/admin/questions)');

    // 5. Check Admin Manage Admins (/admin/manage-admins)
    const adminManageOk = await checkPageForCrash('http://localhost:5173/admin/manage-admins', 'Admin Manage Admins (/admin/manage-admins)');

    // 6. Check Candidate Register (/candidate/register)
    const candRegOk = await checkPageForCrash('http://localhost:5173/candidate/register', 'Candidate Register (/candidate/register)');

    // 7. Check Candidate Login (/candidate/login)
    const candLogOk = await checkPageForCrash('http://localhost:5173/candidate/login', 'Candidate Login (/candidate/login)');

    // 8. Capture proof screenshot of /admin/tests to verify BUG-114 filter bar intact
    await page.goto('http://localhost:5173/admin/tests', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\bug115_admin_tests_healthy.png',
      fullPage: false
    });

    console.log('\n--- VERIFICATION SUMMARY ---');
    console.log(`Admin Tests: ${adminTestsOk ? 'PASS' : 'FAIL'}`);
    console.log(`Admin Dashboard: ${adminDashOk ? 'PASS' : 'FAIL'}`);
    console.log(`Admin Question Bank: ${adminQBankOk ? 'PASS' : 'FAIL'}`);
    console.log(`Admin Manage Admins: ${adminManageOk ? 'PASS' : 'FAIL'}`);
    console.log(`Candidate Register: ${candRegOk ? 'PASS' : 'FAIL'}`);
    console.log(`Candidate Login: ${candLogOk ? 'PASS' : 'FAIL'}`);
    console.log(`Total Uncaught Page Errors: ${errors.length}`);

  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    await browser.close();
  }
})();
