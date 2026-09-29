const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  console.log('=== FEATURE-050 QUESTION BANK ALL MODALS THEME VERIFICATION ===');

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

  try {
    // 1. Admin Login
    console.log('\n[1/7] Logging in as Super Admin...');
    await page.goto('http://localhost:5173/admin/login', { waitUntil: 'networkidle2' });
    await page.type('input[type="email"], input[name="email"]', 'superadmin@globussoft.in');
    await page.type('input[type="password"], input[name="password"]', 'GlobusAdmin2026!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));

    // 2. Navigate to Question Bank
    console.log('[2/7] Navigating to /admin/question-bank...');
    await page.goto('http://localhost:5173/admin/question-bank', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Ensure Light Theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('admin_theme', 'light');
    });
    await new Promise(r => setTimeout(r, 600));

    // 3. Open Modal 1: Create Question Set
    console.log('[3/7] Opening "Create Question Set" modal (Light)...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('New Question Set') || b.innerText.includes('New Set') || b.innerText.includes('+ Question Set'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\feature050_modal_create_set_light.png',
      fullPage: false
    });
    console.log('📸 Captured: feature050_modal_create_set_light.png');

    // Close Modal 1
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Cancel' || b.innerText === '✕');
      if (cancelBtn) cancelBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // 4. Open Modal 2: Create New Folder
    console.log('[4/7] Opening "Create New Folder" modal (Light)...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('New Folder') || b.innerText.includes('+ Folder'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\feature050_modal_create_folder_light.png',
      fullPage: false
    });
    console.log('📸 Captured: feature050_modal_create_folder_light.png');

    // Close Modal 2
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Cancel' || b.innerText === '✕');
      if (cancelBtn) cancelBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // 5. Open Modal 3: Bulk Upload PDFs to Folder
    console.log('[5/7] Opening "Bulk Upload PDFs to Folder" modal (Light)...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Upload PDFs') || b.innerText.includes('Bulk Upload'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\feature050_modal_bulk_upload_light.png',
      fullPage: false
    });
    console.log('📸 Captured: feature050_modal_bulk_upload_light.png');

    // Close Modal 3
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Cancel' || b.innerText === '✕');
      if (cancelBtn) cancelBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // 6. Dark Mode: Bulk Upload Modal
    console.log('[6/7] Switching to Dark Theme and opening "Bulk Upload PDFs to Folder" modal...');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('admin_theme', 'dark');
    });
    await new Promise(r => setTimeout(r, 600));

    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Upload PDFs') || b.innerText.includes('Bulk Upload'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\feature050_modal_bulk_upload_dark.png',
      fullPage: false
    });
    console.log('📸 Captured: feature050_modal_bulk_upload_dark.png');

    // 7. Console Audit
    console.log('\n[7/7] Console Audit Summary:');
    console.log(`  - Console Errors: ${consoleErrors.length}`);
    console.log(`  - Page Errors: ${pageErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log('  Details:', consoleErrors);
    }

  } catch (err) {
    console.error('Test execution failed:', err);
  } finally {
    await browser.close();
    console.log('\n=== VERIFICATION COMPLETE ===\n');
  }
})();
