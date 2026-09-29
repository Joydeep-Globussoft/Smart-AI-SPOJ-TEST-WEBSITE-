const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function verifyFeature047FilterBar() {
  console.log('--- Launching Browser for FEATURE-047 Filter Bar Verification ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    defaultViewport: { width: 1600, height: 1000 },
  });

  try {
    const page = await browser.newPage();

    // 1. Admin Login
    await page.goto('http://localhost:5173/admin/login', { waitUntil: 'networkidle0' });
    await page.type('input[type="email"], input[name="email"]', 'superadmin@globussoft.in');
    await page.type('input[type="password"], input[name="password"]', 'GlobusAdmin2026!');
    await page.click('button[type="submit"]');

    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));

    // 2. Navigate to Tests page
    await page.goto('http://localhost:5173/admin/tests', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2000));

    const artifactsDir = 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d';
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    // Force Light theme first if currently in dark
    const isDarkInitial = await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark');
    if (isDarkInitial) {
      const toggle = await page.$('#admin-theme-toggle-btn');
      if (toggle) await toggle.click();
      await new Promise(r => setTimeout(r, 1000));
    }

    // Capture Light Mode In-Context Screenshot
    const lightContextPath = path.join(artifactsDir, 'feature047_filterbar_light_context.png');
    await page.screenshot({ path: lightContextPath, fullPage: false });
    console.log('Saved Light mode in-context screenshot:', lightContextPath);

    // Open Sort menu in Light mode
    const sortBtnLight = await page.$('button[title^="Sort tests"]');
    if (sortBtnLight) {
      await sortBtnLight.click();
      await new Promise(r => setTimeout(r, 600));
      const lightSortOpenPath = path.join(artifactsDir, 'feature047_filterbar_light_sort_open.png');
      await page.screenshot({ path: lightSortOpenPath, fullPage: false });
      console.log('Saved Light mode sort open screenshot:', lightSortOpenPath);
      // Close sort menu
      await sortBtnLight.click();
      await new Promise(r => setTimeout(r, 400));
    }

    // Toggle to Dark Mode
    const themeBtn = await page.$('#admin-theme-toggle-btn');
    if (themeBtn) {
      await themeBtn.click();
      await new Promise(r => setTimeout(r, 1000));
    }

    // Capture Dark Mode In-Context Screenshot (sitting directly above Test Management table)
    const darkContextPath = path.join(artifactsDir, 'feature047_filterbar_dark_context.png');
    await page.screenshot({ path: darkContextPath, fullPage: false });
    console.log('Saved Dark mode in-context screenshot:', darkContextPath);

    // Open Sort menu in Dark mode
    const sortBtnDark = await page.$('button[title^="Sort tests"]');
    if (sortBtnDark) {
      await sortBtnDark.click();
      await new Promise(r => setTimeout(r, 600));
      const darkSortOpenPath = path.join(artifactsDir, 'feature047_filterbar_dark_sort_open.png');
      await page.screenshot({ path: darkSortOpenPath, fullPage: false });
      console.log('Saved Dark mode sort open screenshot:', darkSortOpenPath);
    }

    console.log('--- Visual QA Screenshots Captured Successfully ---');

  } catch (err) {
    console.error('Visual QA failed:', err);
  } finally {
    await browser.close();
  }
}

verifyFeature047FilterBar();
