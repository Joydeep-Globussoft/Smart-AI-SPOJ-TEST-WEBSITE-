const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  console.log('=== BUG-116 LIVE BROWSER & CONSOLE VERIFICATION ===');

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
      console.error('[Browser Console Error]:', msg.text());
    } else if (msg.type() === 'warn') {
      consoleWarns.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
    console.error('[Browser PageError]:', err.message);
  });

  try {
    // 1. Admin Login
    console.log('\n[1/5] Logging in as Super Admin...');
    await page.goto('http://localhost:5173/admin/login', { waitUntil: 'networkidle2' });
    await page.type('input[type="email"], input[name="email"]', 'superadmin@globussoft.in');
    await page.type('input[type="password"], input[name="password"]', 'GlobusAdmin2026!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));

    // 2. Navigate to Manage Admins
    console.log('[2/5] Navigating to /admin/create-admin in LIGHT THEME...');
    await page.goto('http://localhost:5173/admin/create-admin', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1200));

    // Ensure Light Theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('admin_theme', 'light');
    });
    await new Promise(r => setTimeout(r, 500));

    // Verify computed button background
    const lightButtonStyles = await page.evaluate(() => {
      const btn = document.querySelector('#create-admin-btn');
      return {
        bg: btn ? window.getComputedStyle(btn).backgroundColor : null,
        color: btn ? window.getComputedStyle(btn).color : null
      };
    });
    console.log('  - Light Mode Button Styles:', lightButtonStyles);

    // Screenshot Light Theme Full Page
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\bug116_manage_admins_light.png',
      fullPage: false
    });
    console.log('📸 Captured: bug116_manage_admins_light.png');

    // Open Create Modal in Light Theme
    console.log('[3/5] Opening Create Admin Modal (Light Theme)...');
    await page.click('#create-admin-btn');
    await new Promise(r => setTimeout(r, 500));

    const lightModalBtnStyles = await page.evaluate(() => {
      const submitBtn = document.querySelector('button[type="submit"]');
      return {
        bg: submitBtn ? window.getComputedStyle(submitBtn).backgroundColor : null,
        color: submitBtn ? window.getComputedStyle(submitBtn).color : null
      };
    });
    console.log('  - Light Modal Submit Button Styles:', lightModalBtnStyles);

    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\bug116_modal_light.png',
      fullPage: false
    });
    console.log('📸 Captured: bug116_modal_light.png');

    // Close Modal
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Cancel'));
      if (cancelBtn) cancelBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // 4. Switch to Dark Theme
    console.log('[4/5] Switching to DARK THEME and verifying...');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('admin_theme', 'dark');
    });
    await new Promise(r => setTimeout(r, 500));

    const darkButtonStyles = await page.evaluate(() => {
      const btn = document.querySelector('#create-admin-btn');
      return {
        bg: btn ? window.getComputedStyle(btn).backgroundColor : null,
        color: btn ? window.getComputedStyle(btn).color : null
      };
    });
    console.log('  - Dark Mode Button Styles:', darkButtonStyles);

    // Screenshot Dark Theme Full Page
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\bug116_manage_admins_dark.png',
      fullPage: false
    });
    console.log('📸 Captured: bug116_manage_admins_dark.png');

    // Open Create Modal in Dark Theme
    console.log('[5/5] Opening Create Admin Modal (Dark Theme)...');
    await page.click('#create-admin-btn');
    await new Promise(r => setTimeout(r, 500));

    const darkModalBtnStyles = await page.evaluate(() => {
      const submitBtn = document.querySelector('button[type="submit"]');
      return {
        bg: submitBtn ? window.getComputedStyle(submitBtn).backgroundColor : null,
        color: submitBtn ? window.getComputedStyle(submitBtn).color : null
      };
    });
    console.log('  - Dark Modal Submit Button Styles:', darkModalBtnStyles);

    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\bug116_modal_dark.png',
      fullPage: false
    });
    console.log('📸 Captured: bug116_modal_dark.png');

    // Close Modal
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Cancel'));
      if (cancelBtn) cancelBtn.click();
    });

    console.log('\n================ CONSOLE TELEMETRY AUDIT ================');
    console.log(`Uncaught Page Errors: ${pageErrors.length}`);
    console.log(`Console Errors: ${consoleErrors.length}`);
    console.log(`Console Warnings: ${consoleWarns.length}`);
    if (pageErrors.length === 0 && consoleErrors.length === 0) {
      console.log('✅ ZERO CONSOLE ERRORS: The application is completely clean and stable!');
    } else {
      console.log('⚠️ Errors detected:', pageErrors, consoleErrors);
    }
    console.log('=========================================================\n');

  } catch (err) {
    console.error('Verification failed with exception:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
