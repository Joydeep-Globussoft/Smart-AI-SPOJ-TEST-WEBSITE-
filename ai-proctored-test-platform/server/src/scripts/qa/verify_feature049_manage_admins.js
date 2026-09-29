const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sRGBtoLinear(c) {
  c = c / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function getLuminance(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return 0.2126 * sRGBtoLinear(r) + 0.7152 * sRGBtoLinear(g) + 0.0722 * sRGBtoLinear(b);
}
function getContrast(hex1, hex2) {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return ((lighter + 0.05) / (darker + 0.05));
}

(async () => {
  console.log('=== FEATURE-049 LIVE BROWSER & CONSOLE VERIFICATION ===');

  // Print WCAG Contrast Audit
  console.log('\n--- WCAG 2.1 CONTRAST RATIO AUDIT ---');
  const auditPairs = [
    { name: 'Header Title Navy (#0D1829) on White Card (#FFFFFF)', c1: '#0D1829', c2: '#FFFFFF' },
    { name: 'Header Title Navy (#0D1829) on Canvas (#EEF2FF)', c1: '#0D1829', c2: '#EEF2FF' },
    { name: 'Indigo-600 (#4F46E5) on White Card (#FFFFFF)', c1: '#4F46E5', c2: '#FFFFFF' },
    { name: 'Indigo-600 (#4F46E5) on Canvas (#EEF2FF)', c1: '#4F46E5', c2: '#EEF2FF' },
    { name: 'Indigo-600 (#4F46E5) on Subcard (#F8FAFC)', c1: '#4F46E5', c2: '#F8FAFC' },
    { name: 'White Text (#FFFFFF) on Indigo-600 (#4F46E5) Button', c1: '#FFFFFF', c2: '#4F46E5' },
    { name: 'Label Text (#5B6B8A) on White Card (#FFFFFF)', c1: '#5B6B8A', c2: '#FFFFFF' },
    { name: 'Label Text (#5B6B8A) on Canvas (#EEF2FF)', c1: '#5B6B8A', c2: '#EEF2FF' },
    { name: '[Dark] White (#F8FAFC) on Dark Card (#131B2E)', c1: '#F8FAFC', c2: '#131B2E' },
    { name: '[Dark] Indigo-400 (#818CF8) on Dark Card (#131B2E)', c1: '#818CF8', c2: '#131B2E' },
  ];
  auditPairs.forEach(p => {
    const ratio = getContrast(p.c1, p.c2);
    const aa = ratio >= 4.5 ? 'PASS (AA)' : (ratio >= 3.0 ? 'PASS (Large AA)' : 'FAIL');
    const aaa = ratio >= 7.0 ? 'PASS (AAA)' : (ratio >= 4.5 ? 'PASS (Large AAA)' : 'FAIL');
    console.log(`  * ${p.name}: ${ratio.toFixed(2)}:1 [${aa} | ${aaa}]`);
  });

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

    // Verify computed styles in Light Mode
    const lightColors = await page.evaluate(() => {
      const appLayout = document.querySelector('.app-layout');
      const mainContent = document.querySelector('.main-content');
      const headerCard = document.querySelector('.card');
      const subCard = document.querySelector('.card [style*="gridTemplateColumns"] > div');
      return {
        appLayoutBg: window.getComputedStyle(appLayout).backgroundColor,
        mainContentBg: window.getComputedStyle(mainContent).backgroundColor,
        headerCardBg: window.getComputedStyle(headerCard).backgroundColor,
        subCardBg: subCard ? window.getComputedStyle(subCard).backgroundColor : null
      };
    });
    console.log('  - Computed Light Mode Styles:', lightColors);

    // Screenshot Light Theme Full Page
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\feature049_manage_admins_light.png',
      fullPage: false
    });
    console.log('📸 Captured: feature049_manage_admins_light.png');

    // Open Create Modal in Light Theme
    console.log('[3/5] Opening Create Admin Modal (Light Theme)...');
    await page.click('#create-admin-btn');
    await new Promise(r => setTimeout(r, 500));

    const lightModalBg = await page.evaluate(() => {
      const modal = document.querySelector('.modal-container');
      return modal ? window.getComputedStyle(modal).backgroundColor : null;
    });
    console.log('  - Light Modal Container BG:', lightModalBg);

    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\feature049_modal_light.png',
      fullPage: false
    });
    console.log('📸 Captured: feature049_modal_light.png');

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

    const darkColors = await page.evaluate(() => {
      const appLayout = document.querySelector('.app-layout');
      const mainContent = document.querySelector('.main-content');
      const headerCard = document.querySelector('.card');
      const subCard = document.querySelector('.card [style*="gridTemplateColumns"] > div');
      return {
        appLayoutBg: window.getComputedStyle(appLayout).backgroundColor,
        mainContentBg: window.getComputedStyle(mainContent).backgroundColor,
        headerCardBg: window.getComputedStyle(headerCard).backgroundColor,
        subCardBg: subCard ? window.getComputedStyle(subCard).backgroundColor : null
      };
    });
    console.log('  - Computed Dark Mode Styles:', darkColors);

    // Screenshot Dark Theme Full Page
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\feature049_manage_admins_dark.png',
      fullPage: false
    });
    console.log('📸 Captured: feature049_manage_admins_dark.png');

    // Open Create Modal in Dark Theme
    console.log('[5/5] Opening Create Admin Modal (Dark Theme)...');
    await page.click('#create-admin-btn');
    await new Promise(r => setTimeout(r, 500));

    const darkModalBg = await page.evaluate(() => {
      const modal = document.querySelector('.modal-container');
      return modal ? window.getComputedStyle(modal).backgroundColor : null;
    });
    console.log('  - Dark Modal Container BG:', darkModalBg);

    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\feature049_modal_dark.png',
      fullPage: false
    });
    console.log('📸 Captured: feature049_modal_dark.png');

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
