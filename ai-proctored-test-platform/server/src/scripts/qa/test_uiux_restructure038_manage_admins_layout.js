// test_uiux_restructure038_manage_admins_layout.js
// Automated verification for UI/UX RESTRUCTURE-038: Redesign Manage Admins Page Layout for Better Workflow and Information Hierarchy

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ADMIN_PAGE_FILE = path.join(__dirname, '../../../../client/src/admin/pages/AdminCreateAdmin.jsx');
const ARTIFACTS_DIR = 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d';

async function runStaticVerification() {
  console.log('=== [1/2] STATIC CODE VERIFICATION: AdminCreateAdmin.jsx ===');
  const code = fs.readFileSync(ADMIN_PAGE_FILE, 'utf8');

  // Check 1: Header components
  if (!code.includes('Admin Account Management') || !code.includes('Super Admin Only') || !code.includes('Logged in as:')) {
    throw new Error('Header elements missing in AdminCreateAdmin.jsx');
  }
  console.log('  ✅ Page header contains title, badge, and logged in user');

  // Check 2: Active Admins section is above Role Based Permissions
  const activeAdminsPos = code.indexOf('Active Admins');
  const rolePermissionsPos = code.indexOf('Role Based Permissions');
  if (activeAdminsPos === -1 || rolePermissionsPos === -1 || activeAdminsPos >= rolePermissionsPos) {
    throw new Error(`Active Admins (pos ${activeAdminsPos}) must appear BEFORE Role Based Permissions (pos ${rolePermissionsPos})`);
  }
  console.log('  ✅ Active Admins section is positioned above Role Based Permissions');

  // Check 3: Header button in Active Admins
  if (!code.includes('id="create-admin-btn"') && !code.includes('+ Create Admin Account')) {
    throw new Error('Active Admins header must include "+ Create Admin Account" button');
  }
  console.log('  ✅ Active Admins header contains "+ Create Admin Account" button');

  // Check 4: Modal state for create admin form
  if (!code.includes('isCreateModalOpen') || !code.includes('setIsCreateModalOpen')) {
    throw new Error('Admin creation form must be controlled by isCreateModalOpen modal state');
  }
  console.log('  ✅ Create Admin Account form is enclosed in a modal (isCreateModalOpen)');

  // Check 5: 2-column layout for Role Based Permissions
  if (!code.includes('SUPER_ADMIN') || !code.includes('Full Platform Control') || !code.includes('ADMIN') || (!code.includes('Test Operations & Proctoring') && !code.includes('Test Operations &amp; Proctoring')) || !code.includes('gridTemplateColumns')) {
    throw new Error('Role Based Permissions must feature a 2-column grid layout for SUPER_ADMIN and ADMIN');
  }
  console.log('  ✅ Role Based Permissions has 2-column grid layout with SUPER_ADMIN and ADMIN');

  // Check 6: Preserved critical regressions
  if (!code.includes('useScrollRestoration') || !code.includes('LoadingDots') || !code.includes('isCurrentUser') || !code.includes('handleOpenEdit') || !code.includes('handleConfirmDeactivate') || !code.includes('handleConfirmDelete')) {
    throw new Error('Preserved functionality missing (scroll restoration, loading dots, edit/deactivate/delete)');
  }
  console.log('  ✅ Preserved all regression fixes and admin actions (scroll restoration, loading dots, edit, deactivate, delete)');
}

async function runBrowserVerification() {
  console.log('\n=== [2/2] PUPPETEER BROWSER VERIFICATION ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Login as superadmin
    console.log('  - Logging in as Super Admin on localhost:5173...');
    await page.goto('http://localhost:5173/admin/login', { waitUntil: 'networkidle2' });
    await page.type('input[type="email"]', 'superadmin@globussoft.in');
    await page.type('input[type="password"]', 'GlobusAdmin2026!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // Navigate to manage admins (/admin/create-admin)
    console.log('  - Navigating to /admin/create-admin...');
    await page.goto('http://localhost:5173/admin/create-admin', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#create-admin-btn', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 600));

    // Check modal is NOT open initially
    let modalCount = await page.$$eval('.modal-backdrop', (els) => els.length);
    console.log(`  - Initial modal backdrop count: ${modalCount} (Expected: 0)`);
    if (modalCount !== 0) throw new Error('Create admin modal should NOT be open by default');

    // Take screenshot of default view (Dark mode)
    const darkPath = path.join(ARTIFACTS_DIR, 'uiux038_manage_admins_default_view.png');
    await page.screenshot({ path: darkPath, fullPage: true });
    console.log(`  📸 Saved default view screenshot: ${darkPath}`);

    // Click "+ Create Admin Account" button
    console.log('  - Clicking "+ Create Admin Account" button...');
    await page.click('#create-admin-btn');
    await page.waitForSelector('.modal-backdrop', { timeout: 5000 });

    modalCount = await page.$$eval('.modal-backdrop', (els) => els.length);
    console.log(`  - Modal backdrop count after click: ${modalCount} (Expected: 1)`);
    if (modalCount !== 1) throw new Error('Create admin modal failed to open');

    const modalTitle = await page.$eval('.modal-title', (el) => el.innerText);
    console.log(`  - Modal title: "${modalTitle}"`);
    if (!modalTitle.includes('Create Admin Account')) {
      throw new Error(`Unexpected modal title: ${modalTitle}`);
    }

    // Take screenshot of modal open
    const modalPath = path.join(ARTIFACTS_DIR, 'uiux038_manage_admins_modal_open.png');
    await page.screenshot({ path: modalPath, fullPage: false });
    console.log(`  📸 Saved modal open screenshot: ${modalPath}`);

    // Click Cancel button inside modal
    console.log('  - Clicking Cancel button to close modal...');
    const buttons = await page.$$('.modal-footer button');
    for (const btn of buttons) {
      const text = await page.evaluate((el) => el.innerText, btn);
      if (text.includes('Cancel')) {
        await btn.click();
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
    modalCount = await page.$$eval('.modal-backdrop', (els) => els.length);
    console.log(`  - Modal backdrop count after Cancel: ${modalCount} (Expected: 0)`);
    if (modalCount !== 0) throw new Error('Modal did not close on Cancel');

    // Switch theme to Light Mode if toggle available, and take screenshot
    try {
      const themeToggle = await page.$('#theme-toggle, [data-testid="theme-toggle"], button[title*="theme" i], button[title*="mode" i]');
      if (themeToggle) {
        await themeToggle.click();
        await new Promise((r) => setTimeout(r, 500));
        const lightPath = path.join(ARTIFACTS_DIR, 'uiux038_manage_admins_light_view.png');
        await page.screenshot({ path: lightPath, fullPage: true });
        console.log(`  📸 Saved light view screenshot: ${lightPath}`);
      }
    } catch (e) {
      console.log('  ℹ️ Theme toggle interaction: ' + e.message);
    }

    console.log('  ✅ Browser verification passed successfully!');
  } finally {
    await browser.close();
  }
}

async function main() {
  try {
    await runStaticVerification();
    await runBrowserVerification();
    console.log('\n🎉 ALL UI/UX RESTRUCTURE-038 CHECKS PASSED!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ QA VERIFICATION FAILED:', err);
    process.exit(1);
  }
}

main();
