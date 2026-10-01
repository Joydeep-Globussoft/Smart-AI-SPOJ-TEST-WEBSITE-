const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\43e23410-b2a1-48a7-b8fb-6f4e93f2bc89';

if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('theme', t);
    document.documentElement.setAttribute('data-theme', t);
    document.body.setAttribute('data-theme', t);
  }, theme);
  await new Promise(r => setTimeout(r, 400));
}

async function runTest() {
  console.log('--- STARTING BUG-120 LIVE SEARCH ICONS THEME ACCENT COLOR VERIFICATION ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(err.toString());
  });

  try {
    // 1. Admin Login
    console.log('Logging in as superadmin...');
    await page.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle2' });
    await page.type('input[type="email"], input[name="email"]', 'superadmin@globussoft.in');
    await page.type('input[type="password"], input[name="password"]', 'GlobusAdmin2026!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    console.log('Logged in successfully, current url:', page.url());

    const checkIconStyle = async (selector) => {
      return await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return { error: `Element not found: ${sel}` };
        const svg = el.tagName.toLowerCase() === 'svg' ? el : el.querySelector('svg');
        if (!svg) return { error: `SVG not found in ${sel}` };
        const cs = window.getComputedStyle(svg);
        const parentCs = window.getComputedStyle(svg.parentElement);
        return {
          stroke: cs.stroke,
          color: cs.color,
          display: cs.display,
          parentBg: parentCs.backgroundColor,
          parentBorder: parentCs.border,
          tagName: svg.tagName
        };
      }, selector);
    };

    // --- 1. TEST MANAGEMENT (AdminTests) ---
    console.log('\n--- 1. Testing AdminTests ---');
    await page.goto(`${BASE_URL}/admin/tests`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[placeholder="Search by test title or pool..."]', { timeout: 8000 });

    await setTheme(page, 'light');
    const testsLight = await checkIconStyle('div:has(> input[placeholder="Search by test title or pool..."]) svg');
    console.log('AdminTests (Light) Search Icon:', testsLight);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'bug120_01_admintests_light.png') });

    await setTheme(page, 'dark');
    const testsDark = await checkIconStyle('div:has(> input[placeholder="Search by test title or pool..."]) svg');
    console.log('AdminTests (Dark) Search Icon:', testsDark);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'bug120_01_admintests_dark.png') });

    // --- 2. QUESTION BANK (AdminQuestionBank) ---
    console.log('\n--- 2. Testing AdminQuestionBank ---');
    await page.goto(`${BASE_URL}/admin/question-bank`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[placeholder="Search folders..."]', { timeout: 8000 });

    await setTheme(page, 'light');
    const qbLight = await checkIconStyle('div:has(> input[placeholder="Search folders..."]) svg');
    console.log('QuestionBank (Light) Search Icon:', qbLight);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'bug120_02_questionbank_light.png') });

    await setTheme(page, 'dark');
    const qbDark = await checkIconStyle('div:has(> input[placeholder="Search folders..."]) svg');
    console.log('QuestionBank (Dark) Search Icon:', qbDark);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'bug120_02_questionbank_dark.png') });

    // --- 3. CANDIDATES MODAL (AdminTestDetail) ---
    console.log('\n--- 3. Testing Candidates Modal ---');
    await page.goto(`${BASE_URL}/admin/tests/6aba358a9ea7e48af40d5dfa`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    const candidatesBtn = await page.$('button[id^="view-room-candidates-btn-"]');
    if (candidatesBtn) {
      await candidatesBtn.click();
      await page.waitForSelector('input[placeholder="Search candidate name..."]', { timeout: 6000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 600));

      await setTheme(page, 'light');
      const candLight = await checkIconStyle('div:has(> input[placeholder="Search candidate name..."]) svg');
      console.log('Candidates Modal (Light) Search Icon:', candLight);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'bug120_03_candidates_modal_light.png') });

      await setTheme(page, 'dark');
      const candDark = await checkIconStyle('div:has(> input[placeholder="Search candidate name..."]) svg');
      console.log('Candidates Modal (Dark) Search Icon:', candDark);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'bug120_03_candidates_modal_dark.png') });
    }

    // --- 4. ADMIN LIVE DASHBOARD (Search Input & Modal Title Icon) ---
    console.log('\n--- 4. Testing AdminLiveDashboard ---');
    await page.goto(`${BASE_URL}/admin/tests/6aba358a9ea7e48af40d5dfa/live?candidateId=6ab9fd838e01174372e83740`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[placeholder="Search candidate..."]', { timeout: 8000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1000));

    await setTheme(page, 'light');
    const liveLight = await checkIconStyle('div:has(> input[placeholder="Search candidate..."]) svg');
    console.log('LiveDashboard (Light) Search Icon:', liveLight);
    const modalTitleLight = await checkIconStyle('h3.modal-title svg, #candidate-inspection-modal svg');
    console.log('Inspection Modal Title (Light) Search Icon:', modalTitleLight);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'bug120_04_livedashboard_light.png') });

    await setTheme(page, 'dark');
    const liveDark = await checkIconStyle('div:has(> input[placeholder="Search candidate..."]) svg');
    console.log('LiveDashboard (Dark) Search Icon:', liveDark);
    const modalTitleDark = await checkIconStyle('h3.modal-title svg, #candidate-inspection-modal svg');
    console.log('Inspection Modal Title (Dark) Search Icon:', modalTitleDark);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'bug120_04_livedashboard_dark.png') });

    // --- 5. ADMIN RESULTS ---
    console.log('\n--- 5. Testing AdminResults ---');
    await page.goto(`${BASE_URL}/admin/tests/6aba358a9ea7e48af40d5dfa/results`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[placeholder*="Search candidate in shortlist"]', { timeout: 8000 }).catch(() => {});

    await setTheme(page, 'light');
    const resultsLight = await checkIconStyle('div:has(> input[placeholder*="Search candidate in shortlist"]) svg');
    console.log('AdminResults (Light) Search Icon:', resultsLight);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'bug120_05_results_light.png') });

    await setTheme(page, 'dark');
    const resultsDark = await checkIconStyle('div:has(> input[placeholder*="Search candidate in shortlist"]) svg');
    console.log('AdminResults (Dark) Search Icon:', resultsDark);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'bug120_05_results_dark.png') });

    console.log('\n--- VERIFICATION SUMMARY ---');
    console.log('Total Console Errors:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.log('Console Errors:', consoleErrors);
    }

  } catch (err) {
    console.error('Test failed with error:', err);
  } finally {
    await browser.close();
    console.log('--- BUG-120 TEST COMPLETED ---');
  }
}

runTest();
