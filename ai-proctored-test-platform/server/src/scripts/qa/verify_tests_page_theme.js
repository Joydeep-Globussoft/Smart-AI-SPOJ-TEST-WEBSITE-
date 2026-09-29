const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  console.log('=== TEST MANAGEMENT PAGE & CREATE TEST MODAL THEME QA VERIFICATION ===');

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
    console.log('\n[1/6] Logging in as Super Admin on localhost:5173...');
    await page.goto('http://localhost:5173/admin/login', { waitUntil: 'networkidle2' });
    await page.type('input[type="email"], input[name="email"]', 'superadmin@globussoft.in');
    await page.type('input[type="password"], input[name="password"]', 'GlobusAdmin2026!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));

    // 2. Navigate to /admin/tests
    console.log('[2/6] Navigating to /admin/tests...');
    await page.goto('http://localhost:5173/admin/tests', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Ensure Light Theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('admin_theme', 'light');
    });
    await new Promise(r => setTimeout(r, 600));

    // Check light theme canvas styling
    const lightCanvasEval = await page.evaluate(() => {
      const mainContent = document.querySelector('.main-content') || document.querySelector('.tests-page');
      const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Create New Test'));
      const filterBar = document.querySelector('.admin-filter-bar') || document.querySelector('[style*="box-shadow"], [style*="boxShadow"]');
      const table = document.querySelector('table');

      return {
        mainBg: mainContent ? window.getComputedStyle(mainContent).backgroundColor : null,
        createBtnBg: createBtn ? window.getComputedStyle(createBtn).backgroundColor : null,
        hasTable: !!table,
      };
    });
    console.log('Light Mode Style Audit:', lightCanvasEval);

    const shot1 = path.join(screenshotsDir, 'test_management_light.png');
    await page.screenshot({ path: shot1, fullPage: false });
    console.log(`Saved screenshot: ${shot1}`);

    // 3. Open More Filters in Light Mode
    console.log('[3/6] Opening "More Filters"...');
    await page.evaluate(() => {
      const moreFiltersBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('More Filters'));
      if (moreFiltersBtn) moreFiltersBtn.click();
    });
    await new Promise(r => setTimeout(r, 600));

    const shot2 = path.join(screenshotsDir, 'test_management_more_filters_light.png');
    await page.screenshot({ path: shot2, fullPage: false });
    console.log(`Saved screenshot: ${shot2}`);

    // Close More Filters
    await page.evaluate(() => {
      const moreFiltersBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Less Filters') || b.innerText.includes('More Filters'));
      if (moreFiltersBtn && moreFiltersBtn.innerText.includes('Less Filters')) moreFiltersBtn.click();
    });
    await new Promise(r => setTimeout(r, 400));

    // 4. Open "Create New Test" Modal in Light Mode
    console.log('[4/6] Opening "Create New Test" Modal in Light Mode...');
    await page.evaluate(() => {
      const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Create New Test'));
      if (createBtn) createBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    const modalEval = await page.evaluate(() => {
      const modalHeader = document.querySelector('.modal-header');
      const modalFooter = document.querySelector('.modal-footer');
      const modalContainer = document.querySelector('.modal-container');
      return {
        headerBg: modalHeader ? window.getComputedStyle(modalHeader).backgroundColor : null,
        footerBg: modalFooter ? window.getComputedStyle(modalFooter).backgroundColor : null,
        containerBg: modalContainer ? window.getComputedStyle(modalContainer).backgroundColor : null,
      };
    });
    console.log('Create Test Modal Style Audit:', modalEval);

    const shot3 = path.join(screenshotsDir, 'create_test_modal_light.png');
    await page.screenshot({ path: shot3, fullPage: false });
    console.log(`Saved screenshot: ${shot3}`);

    // Close Modal
    await page.evaluate(() => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText === 'Cancel' || b.innerText === '✕');
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // 5. Switch to Dark Mode
    console.log('[5/6] Switching to Dark Theme...');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('admin_theme', 'dark');
    });
    await new Promise(r => setTimeout(r, 600));

    const shot4 = path.join(screenshotsDir, 'test_management_dark.png');
    await page.screenshot({ path: shot4, fullPage: false });
    console.log(`Saved screenshot: ${shot4}`);

    // 6. Open "Create New Test" Modal in Dark Mode
    console.log('[6/6] Opening "Create New Test" Modal in Dark Mode...');
    await page.evaluate(() => {
      const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Create New Test'));
      if (createBtn) createBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    const shot5 = path.join(screenshotsDir, 'create_test_modal_dark.png');
    await page.screenshot({ path: shot5, fullPage: false });
    console.log(`Saved screenshot: ${shot5}`);

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
      console.log('SUCCESS: All Test Management pages and modals rendered with 0 errors in both Light and Dark themes!');
    } else {
      console.error('FAIL: Detected runtime errors during verification.');
    }

  } catch (err) {
    console.error('QA script failed with error:', err);
  } finally {
    await browser.close();
  }
})();
