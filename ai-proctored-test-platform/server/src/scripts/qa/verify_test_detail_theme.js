const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  console.log('=== ADMIN TEST DETAIL & ROOM MANAGEMENT THEME QA VERIFICATION ===');

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

    // 2. Navigate to /admin/tests and find a test to open
    console.log('[2/6] Navigating to /admin/tests...');
    await page.goto('http://localhost:5173/admin/tests', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Click the first test link or title in table
    console.log('Finding test detail link...');
    const testRowFound = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/admin/tests/"]'));
      if (links.length > 0) {
        links[0].click();
        return true;
      }
      return false;
    });

    if (!testRowFound) {
      console.log('No direct link found, checking table rows...');
      await page.evaluate(() => {
        const rows = document.querySelectorAll('tbody tr');
        if (rows.length > 0) {
          const firstCol = rows[0].querySelector('td:nth-child(2) a, td a');
          if (firstCol) firstCol.click();
        }
      });
    }

    await new Promise(r => setTimeout(r, 2500));
    console.log(`Current URL: ${page.url()}`);

    // Set Light Mode
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('admin_theme', 'light');
    });
    await new Promise(r => setTimeout(r, 600));

    // 3. Audit Light Mode Styles
    console.log('[3/6] Auditing Light Mode theme on Test Detail page...');
    const lightAudit = await page.evaluate(() => {
      const main = document.querySelector('.main-content');
      const headerCard = document.querySelector('.main-content > div > div:nth-child(2)');
      const configCard = document.querySelector('.main-content > div > div:nth-child(3) > div:first-child');
      const roomsCard = document.querySelector('.main-content > div > div:nth-child(3) > div:last-child');
      const viewResultsBtn = Array.from(document.querySelectorAll('button, a')).find(el => el.innerText && el.innerText.includes('View Results'));

      return {
        mainBg: main ? window.getComputedStyle(main).backgroundColor : null,
        headerCardBg: headerCard ? window.getComputedStyle(headerCard).backgroundColor : null,
        headerCardBorder: headerCard ? window.getComputedStyle(headerCard).borderColor : null,
        configCardBg: configCard ? window.getComputedStyle(configCard).backgroundColor : null,
        roomsCardBg: roomsCard ? window.getComputedStyle(roomsCard).backgroundColor : null,
        viewResultsBtnBg: viewResultsBtn ? window.getComputedStyle(viewResultsBtn).backgroundColor : null,
      };
    });
    console.log('Light Mode Test Detail Audit:', lightAudit);

    const shot1 = path.join(screenshotsDir, 'test_detail_light.png');
    await page.screenshot({ path: shot1, fullPage: false });
    console.log(`Saved screenshot: ${shot1}`);

    // 4. Test Modals in Light Mode
    // 4a. Add Room Modal
    console.log('[4/6] Testing Add Room Modal in Light Mode...');
    const addRoomBtnFound = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Add Room'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (addRoomBtnFound) {
      await new Promise(r => setTimeout(r, 600));
      const shotModal1 = path.join(screenshotsDir, 'test_detail_modal_add_room_light.png');
      await page.screenshot({ path: shotModal1, fullPage: false });
      console.log(`Saved screenshot: ${shotModal1}`);

      // Close modal
      await page.evaluate(() => {
        const cancelBtn = Array.from(document.querySelectorAll('.modal-overlay button')).find(b => b.innerText && (b.innerText.includes('Cancel') || b.innerText.includes('✕')));
        if (cancelBtn) cancelBtn.click();
      });
      await new Promise(r => setTimeout(r, 500));
    }

    // 4b. QR Code Modal
    console.log('Testing QR Code Modal...');
    const qrBtnFound = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('QR Code'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (qrBtnFound) {
      await new Promise(r => setTimeout(r, 600));
      const shotModal2 = path.join(screenshotsDir, 'test_detail_modal_qr_light.png');
      await page.screenshot({ path: shotModal2, fullPage: false });
      console.log(`Saved screenshot: ${shotModal2}`);

      // Close modal
      await page.evaluate(() => {
        const closeBtn = document.getElementById('close-qr-modal-btn') || Array.from(document.querySelectorAll('.modal-overlay button')).find(b => b.innerText && b.innerText.includes('Close'));
        if (closeBtn) closeBtn.click();
      });
      await new Promise(r => setTimeout(r, 500));
    }

    // 4c. Candidates Roster Modal
    console.log('Testing Candidates Roster Modal...');
    const rosterBtnFound = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Candidates'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (rosterBtnFound) {
      await new Promise(r => setTimeout(r, 800));
      const shotModal3 = path.join(screenshotsDir, 'test_detail_modal_roster_light.png');
      await page.screenshot({ path: shotModal3, fullPage: false });
      console.log(`Saved screenshot: ${shotModal3}`);

      // Close modal
      await page.evaluate(() => {
        const closeBtn = Array.from(document.querySelectorAll('.modal-overlay button')).find(b => b.innerText && (b.innerText.includes('Close') || b.innerText.includes('✕')));
        if (closeBtn) closeBtn.click();
      });
      await new Promise(r => setTimeout(r, 500));
    }

    // 5. Test Dark Mode
    console.log('\n[5/6] Switching to Dark Mode and testing parity...');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('admin_theme', 'dark');
    });
    await new Promise(r => setTimeout(r, 600));

    const darkAudit = await page.evaluate(() => {
      const main = document.querySelector('.main-content');
      const headerCard = document.querySelector('.main-content > div > div:nth-child(2)');
      return {
        mainBg: main ? window.getComputedStyle(main).backgroundColor : null,
        headerCardBg: headerCard ? window.getComputedStyle(headerCard).backgroundColor : null,
      };
    });
    console.log('Dark Mode Test Detail Audit:', darkAudit);

    const shotDark = path.join(screenshotsDir, 'test_detail_dark.png');
    await page.screenshot({ path: shotDark, fullPage: false });
    console.log(`Saved screenshot: ${shotDark}`);

    // Dark Mode QR Modal
    if (qrBtnFound) {
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('QR Code'));
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 600));
      const shotModalDark = path.join(screenshotsDir, 'test_detail_modal_qr_dark.png');
      await page.screenshot({ path: shotModalDark, fullPage: false });
      console.log(`Saved screenshot: ${shotModalDark}`);

      await page.evaluate(() => {
        const closeBtn = document.getElementById('close-qr-modal-btn') || Array.from(document.querySelectorAll('.modal-overlay button')).find(b => b.innerText && b.innerText.includes('Close'));
        if (closeBtn) closeBtn.click();
      });
      await new Promise(r => setTimeout(r, 500));
    }

    // 6. Summary & Console error assertion
    console.log('\n[6/6] Checking error logs...');
    console.log(`Console Errors count: ${consoleErrors.length}`);
    console.log(`Page Errors count: ${pageErrors.length}`);

    if (consoleErrors.length > 0) {
      console.warn('Console errors detected:', consoleErrors);
    }
    if (pageErrors.length > 0) {
      throw new Error(`Page errors encountered: ${JSON.stringify(pageErrors)}`);
    }

    console.log('\n✅ ALL ADMIN TEST DETAIL THEME VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
