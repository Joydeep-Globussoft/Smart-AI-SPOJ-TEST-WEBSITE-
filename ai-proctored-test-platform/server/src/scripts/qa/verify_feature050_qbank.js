const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  console.log('=== FEATURE-050 QUESTION BANK BROWSER & CONSOLE VERIFICATION ===');

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
    console.log('\n[1/6] Logging in as Super Admin...');
    await page.goto('http://localhost:5173/admin/login', { waitUntil: 'networkidle2' });
    await page.type('input[type="email"], input[name="email"]', 'superadmin@globussoft.in');
    await page.type('input[type="password"], input[name="password"]', 'GlobusAdmin2026!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));

    // 2. Navigate to Question Bank (Light Theme)
    console.log('[2/6] Navigating to /admin/question-bank in LIGHT THEME...');
    await page.goto('http://localhost:5173/admin/question-bank', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Ensure Light Theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('admin_theme', 'light');
    });
    await new Promise(r => setTimeout(r, 800));

    // Screenshot Light Theme State 1 (Folder Overview)
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\feature050_qbank_light_folder.png',
      fullPage: false
    });
    console.log('📸 Captured: feature050_qbank_light_folder.png');

    // Click into a folder that has question sets if needed, then click into a question set
    console.log('[3/6] Navigating into Question Set Detail (State 2)...');
    const setClickResult = await page.evaluate(() => {
      // Find a set card in the right pane
      const setCards = document.querySelectorAll('div[style*="cursor: pointer"]');
      for (const card of setCards) {
        if (card.innerText.includes('Questions') || card.innerText.includes('Set') || card.innerText.includes('Problem')) {
          card.click();
          return { clicked: true, text: card.innerText.slice(0, 40) };
        }
      }
      return { clicked: false };
    });
    console.log('  - Set click result:', setClickResult);
    await new Promise(r => setTimeout(r, 1500));

    // Screenshot Light Theme State 2 (Set Detail)
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\feature050_qbank_light_set_detail.png',
      fullPage: false
    });
    console.log('📸 Captured: feature050_qbank_light_set_detail.png');

    // Open Modal in Light Theme (e.g. + Add Question modal or Edit Set)
    console.log('[4/6] Opening Modal in Light Theme...');
    await page.evaluate(() => {
      const addQBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Add Question') || b.innerText.includes('Edit Set') || b.innerText.includes('New Folder'));
      if (addQBtn) addQBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\feature050_qbank_light_modal.png',
      fullPage: false
    });
    console.log('📸 Captured: feature050_qbank_light_modal.png');

    // Close Modal
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Cancel') || b.innerText.includes('Close') || b.innerText === '✕');
      if (cancelBtn) cancelBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // 5. Switch to Dark Theme
    console.log('[5/6] Switching to DARK THEME...');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('admin_theme', 'dark');
    });
    await new Promise(r => setTimeout(r, 800));

    // Screenshot Dark Theme State 2 (Set Detail)
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\feature050_qbank_dark_set_detail.png',
      fullPage: false
    });
    console.log('📸 Captured: feature050_qbank_dark_set_detail.png');

    // Return to folder overview
    await page.evaluate(() => {
      const backBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Back') || b.innerText.includes('←'));
      if (backBtn) backBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // Screenshot Dark Theme State 1 (Folder Overview)
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\feature050_qbank_dark_folder.png',
      fullPage: false
    });
    console.log('📸 Captured: feature050_qbank_dark_folder.png');

    // Open Modal in Dark Theme
    console.log('[6/6] Opening Modal in Dark Theme...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('New Folder') || b.innerText.includes('Upload PDFs'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\feature050_qbank_dark_modal.png',
      fullPage: false
    });
    console.log('📸 Captured: feature050_qbank_dark_modal.png');

    // Close Modal
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Cancel') || b.innerText.includes('Close') || b.innerText === '✕');
      if (cancelBtn) cancelBtn.click();
    });

    console.log('\n================ CONSOLE TELEMETRY AUDIT ================');
    console.log(`Uncaught Page Errors: ${pageErrors.length}`);
    console.log(`Console Errors: ${consoleErrors.length}`);
    console.log(`Console Warnings: ${consoleWarns.length}`);
    if (pageErrors.length === 0 && consoleErrors.length === 0) {
      console.log('✅ ZERO CONSOLE ERRORS: The Question Bank is completely clean and stable!');
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
