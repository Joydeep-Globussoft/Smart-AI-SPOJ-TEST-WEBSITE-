const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  console.log('=== ADMIN DASHBOARD THEME QA VERIFICATION ===');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });

  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.error('[Browser Console Error]:', msg.text());
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
    console.error('[Browser PageError]:', err.message);
  });

  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  try {
    // 1. Admin Login
    console.log('\n[1/5] Logging in as Super Admin on localhost:5173...');
    await page.goto('http://localhost:5173/admin/login', { waitUntil: 'networkidle2' });
    await page.type('input[type="email"], input[name="email"]', 'superadmin@globussoft.in');
    await page.type('input[type="password"], input[name="password"]', 'GlobusAdmin2026!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));

    // 2. Navigate to /admin/dashboard
    console.log('[2/5] Navigating to /admin/dashboard...');
    await page.goto('http://localhost:5173/admin/dashboard', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Ensure Light Theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('admin_theme', 'light');
    });
    await new Promise(r => setTimeout(r, 600));

    // Check light theme canvas styling
    const lightCanvasEval = await page.evaluate(() => {
      const mainContent = document.querySelector('.main-content') || document.querySelector('.app-layout');
      const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Create New Test'));
      const welcomeCard = document.querySelector('.admin-welcome-card');
      const statCards = document.querySelectorAll('.stat-card');

      return {
        mainBg: mainContent ? window.getComputedStyle(mainContent).backgroundColor : null,
        createBtnBg: createBtn ? window.getComputedStyle(createBtn).backgroundColor : null,
        welcomeCardBg: welcomeCard ? window.getComputedStyle(welcomeCard).backgroundColor : null,
        statCardsCount: statCards.length,
      };
    });
    console.log('Light Mode Style Audit:', lightCanvasEval);

    const shot1 = path.join(screenshotsDir, 'dashboard_light.png');
    await page.screenshot({ path: shot1, fullPage: false });
    console.log(`Saved screenshot: ${shot1}`);

    // 3. Open "Create New Test" Modal in Light Mode
    console.log('[3/5] Opening "Create New Test" Modal in Light Mode...');
    await page.evaluate(() => {
      const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Create New Test'));
      if (createBtn) createBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    const shot2 = path.join(screenshotsDir, 'dashboard_modal_light.png');
    await page.screenshot({ path: shot2, fullPage: false });
    console.log(`Saved screenshot: ${shot2}`);

    // Close Modal
    await page.evaluate(() => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText === 'Cancel' || b.innerText === '✕');
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // 4. Switch to Dark Mode
    console.log('[4/5] Switching to Dark Theme...');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('admin_theme', 'dark');
    });
    await new Promise(r => setTimeout(r, 600));

    const shot3 = path.join(screenshotsDir, 'dashboard_dark.png');
    await page.screenshot({ path: shot3, fullPage: false });
    console.log(`Saved screenshot: ${shot3}`);

    // 5. Open "Create New Test" Modal in Dark Mode
    console.log('[5/5] Opening "Create New Test" Modal in Dark Mode...');
    await page.evaluate(() => {
      const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Create New Test'));
      if (createBtn) createBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    const shot4 = path.join(screenshotsDir, 'dashboard_modal_dark.png');
    await page.screenshot({ path: shot4, fullPage: false });
    console.log(`Saved screenshot: ${shot4}`);

    // Close Modal
    await page.evaluate(() => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText === 'Cancel' || b.innerText === '✕');
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 400));

    console.log('\n--- VERIFICATION AUDIT SUMMARY ---');
    console.log('Console Errors:', consoleErrors.length);
    console.log('Page Errors:', pageErrors.length);

    if (consoleErrors.length === 0 && pageErrors.length === 0) {
      console.log('SUCCESS: Admin Dashboard rendered with 0 errors in both Light and Dark themes!');
    } else {
      console.error('FAIL: Detected runtime errors during verification.');
    }

  } catch (err) {
    console.error('QA script failed with error:', err);
  } finally {
    await browser.close();
  }
})();
