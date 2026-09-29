const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  console.log('=== FEATURE-050 LIVE HOSTED VERCEL VERIFICATION ===');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });

  const consoleErrors = [];
  const consoleWarns = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.error('[Hosted Console Error]:', msg.text());
    } else if (msg.type() === 'warn') {
      consoleWarns.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
    console.error('[Hosted PageError]:', err.message);
  });

  try {
    // 1. Admin Login on Live Hosted Vercel
    console.log('\n[1/3] Logging in as Super Admin on Vercel...');
    await page.goto('https://smart-ai-spoj-test-website.vercel.app/admin/login', { waitUntil: 'networkidle2' });
    await page.type('input[type="email"], input[name="email"]', 'superadmin@globussoft.in');
    await page.type('input[type="password"], input[name="password"]', 'GlobusAdmin2026!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    // 2. Navigate to Question Bank
    console.log('[2/3] Navigating to /admin/question-bank on Vercel...');
    await page.goto('https://smart-ai-spoj-test-website.vercel.app/admin/question-bank', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    // Ensure Light Theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('admin_theme', 'light');
    });
    await new Promise(r => setTimeout(r, 1000));

    // Screenshot Live Hosted Light Theme
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\feature050_live_vercel_light.png',
      fullPage: false
    });
    console.log('📸 Captured: feature050_live_vercel_light.png');

    // 3. Switch to Dark Theme
    console.log('[3/3] Switching to Dark Theme on Vercel...');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('admin_theme', 'dark');
    });
    await new Promise(r => setTimeout(r, 1000));

    // Screenshot Live Hosted Dark Theme
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\feature050_live_vercel_dark.png',
      fullPage: false
    });
    console.log('📸 Captured: feature050_live_vercel_dark.png');

    console.log('\n================ HOSTED VERCEL TELEMETRY AUDIT ================');
    console.log(`Uncaught Page Errors: ${pageErrors.length}`);
    console.log(`Console Errors: ${consoleErrors.length}`);
    console.log(`Console Warnings: ${consoleWarns.length}`);
    if (pageErrors.length === 0 && consoleErrors.length === 0) {
      console.log('✅ ZERO CONSOLE ERRORS on Live Vercel Deployment!');
    } else {
      console.log('⚠️ Errors on Live Vercel:', pageErrors, consoleErrors);
    }
    console.log('===============================================================\n');

  } catch (err) {
    console.error('Hosted verification encountered an exception:', err);
  } finally {
    await browser.close();
  }
})();
