// test_bug108_yolo_health_badge_verification.js — Automated QA for BUG-108
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const assert = require('assert');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve(__dirname, '../../../../scratch/bug108_verification');

async function runVerification() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  console.log('--- [BUG-108] Starting YOLO Health Check & Admin Badge Verification ---');

  // 1. Test Backend /health endpoint
  console.log('1. Testing GET http://localhost:5000/health...');
  const healthRes = await fetch('http://localhost:5000/health');
  assert.strictEqual(healthRes.status, 200, '/health returns 200');
  const healthData = await healthRes.json();
  console.log('Health API Response:', JSON.stringify(healthData, null, 2));
  assert(healthData.services?.yolo, 'Health response includes yolo service data');
  console.log('✓ Test 1: Backend /health exposes YOLO service health status');

  // 2. Launch Browser & Login
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  try {
    console.log('2. Logging in to Admin Portal...');
    await page.goto('http://localhost:5173/admin/login', { waitUntil: 'networkidle2' });
    await page.type('#admin-email', 'superadmin@globussoft.in');
    await page.type('#admin-password', 'GlobusAdmin2026!');
    await page.click('#admin-login-btn');
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));

    // 3. Navigate to Live Dashboard of sample test
    const testId = '6a9fa1e87e5c0aacf01e1e9d';
    console.log(`3. Navigating to Live Dashboard for test ${testId}...`);
    await page.goto(`http://localhost:5173/admin/tests/${testId}/live`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 3000));

    // 4. Verify YOLO health badge in DOM
    console.log('4. Verifying #yolo-live-health-badge in DOM...');
    const badgeElement = await page.$('#yolo-live-health-badge');
    assert(badgeElement !== null, '#yolo-live-health-badge exists in Live Dashboard toolbar');

    const badgeText = await page.evaluate((el) => el.innerText.trim(), badgeElement);
    console.log('Rendered Badge Text:', badgeText);
    assert(badgeText.includes('AI Phone Detection'), 'Badge contains "AI Phone Detection" label');

    // 5. Capture visual screenshot
    const screenshotPath = path.join(SCREENSHOT_DIR, '01_live_dashboard_yolo_badge.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('✓ Captured Live Dashboard screenshot with YOLO badge at:', screenshotPath);

    console.log('--- [BUG-108] ALL QA CHECKS PASSED ---');
  } catch (err) {
    console.error('QA Test Error:', err);
  } finally {
    await browser.close();
  }
}

runVerification();
