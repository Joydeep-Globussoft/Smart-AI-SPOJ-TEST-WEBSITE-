// test_bug113_admin_dropdown_theme.js
// Automated verification for BUG-113: Admin Profile Dropdown theme contrast & styling

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GLOBAL_CSS_FILE = path.join(__dirname, '../../../../client/src/styles/global.css');
const NAVBAR_FILE = path.join(__dirname, '../../../../client/src/shared/AdminNavbar.jsx');
const ARTIFACTS_DIR = 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d';

async function runStaticVerification() {
  console.log('=== [1/2] STATIC CODE VERIFICATION: global.css & AdminNavbar.jsx ===');
  const css = fs.readFileSync(GLOBAL_CSS_FILE, 'utf8');
  const navbar = fs.readFileSync(NAVBAR_FILE, 'utf8');

  // Check 1: Dropdown menu container styling
  if (!css.includes('.admin-avatar-dropdown-menu') || !navbar.includes('admin-avatar-dropdown-menu')) {
    throw new Error('.admin-avatar-dropdown-menu class must be defined in global.css and used in AdminNavbar.jsx');
  }
  console.log('  ✅ .admin-avatar-dropdown-menu container class configured in CSS and JSX');

  // Check 2: High-specificity dropdown menu item styling
  if (!css.includes('.navbar-nav .dropdown-menu-item') || !css.includes('color: var(--color-text) !important')) {
    throw new Error('.navbar-nav .dropdown-menu-item must explicitly set color: var(--color-text) !important');
  }
  console.log('  ✅ .navbar-nav .dropdown-menu-item explicitly sets color: var(--color-text) !important');

  // Check 3: Logout button styling
  if (!css.includes('.navbar-nav .dropdown-menu-item.logout-btn') || !css.includes('#DC2626')) {
    throw new Error('Logout button must be styled with red text in CSS');
  }
  console.log('  ✅ Logout button has high-specificity red danger styling');

  // Check 4: Scoped navbar nav links
  if (!css.includes('.navbar-nav > a') && !css.includes('.navbar-nav > button')) {
    throw new Error('Top-level navbar links must be scoped using child selector (>) to prevent cascading into dropdown');
  }
  console.log('  ✅ Navbar top-level link selectors scoped with child selector (>)');
}

async function runBrowserVerification() {
  console.log('\n=== [2/2] PUPPETEER BROWSER VERIFICATION (LIGHT & DARK MODES, MULTI-PAGE) ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Login as Super Admin
    console.log('  - Logging in as Super Admin on localhost:5173...');
    await page.goto('http://localhost:5173/admin/login', { waitUntil: 'networkidle2' });
    await page.type('input[type="email"]', 'superadmin@globussoft.in');
    await page.type('input[type="password"]', 'GlobusAdmin2026!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    const pagesToTest = [
      { name: 'Question Bank', url: 'http://localhost:5173/admin/question-bank' },
      { name: 'Tests Management', url: 'http://localhost:5173/admin/tests' },
      { name: 'Dashboard', url: 'http://localhost:5173/admin/dashboard' }
    ];

    for (const p of pagesToTest) {
      console.log(`\n  --- Testing on ${p.name} (${p.url}) ---`);
      await page.goto(p.url, { waitUntil: 'networkidle2' });
      await new Promise(r => setTimeout(r, 600));

      // 1. Ensure Light Mode
      const isDarkInit = await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark');
      if (isDarkInit) {
        await page.click('#admin-theme-toggle-btn');
        await new Promise(r => setTimeout(r, 400));
      }

      // Open Dropdown in Light Mode
      const avatarBtn = await page.$('button[aria-label="User account menu"]');
      await avatarBtn.click();
      await page.waitForSelector('.admin-avatar-dropdown-menu', { timeout: 3000 });
      await new Promise(r => setTimeout(r, 200));

      // Inspect computed styles in Light Mode
      const lightStyles = await page.evaluate(() => {
        const dd = document.querySelector('.admin-avatar-dropdown-menu');
        const items = Array.from(dd.querySelectorAll('.dropdown-menu-item'));
        return {
          bg: window.getComputedStyle(dd).backgroundColor,
          items: items.map(item => ({
            text: item.innerText.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\s+/g, ' ').trim(),
            color: window.getComputedStyle(item).color,
            visibleText: item.querySelector('span:last-child') ? item.querySelector('span:last-child').innerText : ''
          }))
        };
      });

      console.log(`    Light Mode Dropdown Background: ${lightStyles.bg} (Expected: rgb(255, 255, 255))`);
      if (lightStyles.bg !== 'rgb(255, 255, 255)') {
        throw new Error(`Light mode dropdown background is ${lightStyles.bg}, expected solid rgb(255, 255, 255)`);
      }

      for (const item of lightStyles.items) {
        console.log(`    Item: "${item.visibleText}" -> Text Color: ${item.color}`);
        if (item.visibleText === 'Logout') {
          if (item.color !== 'rgb(220, 38, 38)') {
            throw new Error(`Logout button color expected rgb(220, 38, 38), got ${item.color}`);
          }
        } else {
          // Profile, Settings, Help should be dark navy text (#1A2B3C -> rgb(26, 43, 60))
          if (item.color !== 'rgb(26, 43, 60)') {
            throw new Error(`Item "${item.visibleText}" color expected rgb(26, 43, 60), got ${item.color}`);
          }
        }
      }

      if (p.name === 'Question Bank') {
        const lightShot = path.join(ARTIFACTS_DIR, 'bug113_dropdown_verified_light.png');
        await page.screenshot({ path: lightShot, fullPage: false });
        console.log(`    📸 Saved verified light screenshot: ${lightShot}`);
      }

      // Close dropdown by clicking outside (e.g. on body/navbar)
      await page.click('.navbar-brand');
      await new Promise(r => setTimeout(r, 200));
      let isClosed = await page.evaluate(() => !document.querySelector('.admin-avatar-dropdown-menu'));
      console.log(`    Dropdown closed on outside click: ${isClosed}`);
      if (!isClosed) throw new Error('Dropdown did not close on outside click');

      // 2. Toggle to Dark Mode
      await page.click('#admin-theme-toggle-btn');
      await new Promise(r => setTimeout(r, 400));

      // Open Dropdown in Dark Mode
      const avatarBtnDark = await page.$('button[aria-label="User account menu"]');
      await avatarBtnDark.click();
      await page.waitForSelector('.admin-avatar-dropdown-menu', { timeout: 3000 });
      await new Promise(r => setTimeout(r, 200));

      const darkStyles = await page.evaluate(() => {
        const dd = document.querySelector('.admin-avatar-dropdown-menu');
        const items = Array.from(dd.querySelectorAll('.dropdown-menu-item'));
        return {
          bg: window.getComputedStyle(dd).backgroundColor,
          items: items.map(item => ({
            text: item.innerText.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\s+/g, ' ').trim(),
            color: window.getComputedStyle(item).color,
            visibleText: item.querySelector('span:last-child') ? item.querySelector('span:last-child').innerText : ''
          }))
        };
      });

      console.log(`    Dark Mode Dropdown Background: ${darkStyles.bg} (Expected: rgb(19, 27, 46))`);
      if (darkStyles.bg !== 'rgb(19, 27, 46)') {
        throw new Error(`Dark mode dropdown background is ${darkStyles.bg}, expected rgb(19, 27, 46)`);
      }

      for (const item of darkStyles.items) {
        console.log(`    Item: "${item.visibleText}" -> Text Color: ${item.color}`);
        if (item.visibleText === 'Logout') {
          if (item.color !== 'rgb(220, 38, 38)') {
            throw new Error(`Logout button color in dark mode expected rgb(220, 38, 38), got ${item.color}`);
          }
        } else {
          // Profile, Settings, Help should be light text (#e2e8f0 -> rgb(226, 232, 240))
          if (item.color !== 'rgb(226, 232, 240)') {
            throw new Error(`Item "${item.visibleText}" color in dark mode expected rgb(226, 232, 240), got ${item.color}`);
          }
        }
      }

      if (p.name === 'Question Bank') {
        const darkShot = path.join(ARTIFACTS_DIR, 'bug113_dropdown_verified_dark.png');
        await page.screenshot({ path: darkShot, fullPage: false });
        console.log(`    📸 Saved verified dark screenshot: ${darkShot}`);
      }

      await page.click('.navbar-brand');
      await new Promise(r => setTimeout(r, 200));
    }

    console.log('\n  ✅ All static and browser checks passed successfully across pages and themes!');
  } finally {
    await browser.close();
  }
}

async function main() {
  try {
    await runStaticVerification();
    await runBrowserVerification();
    console.log('\n🎉 ALL BUG-113 VERIFICATION CHECKS PASSED (100% SUCCESS)!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ QA VERIFICATION FAILED:', err);
    process.exit(1);
  }
}

main();
