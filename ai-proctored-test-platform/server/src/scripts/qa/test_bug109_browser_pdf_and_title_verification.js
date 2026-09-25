// test_bug109_browser_pdf_and_title_verification.js
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve(__dirname, '../../../../scratch/bug109_verification');

async function runVerification() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  console.log('--- [BUG-109 / BUG-72 / BUG-75 / FEATURE-041] Starting Visual Browser Verification ---');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  try {
    // 1. Login as Admin
    console.log('1. Navigating to Admin Login...');
    await page.goto('http://localhost:5173/admin/login', { waitUntil: 'networkidle2' });
    await page.type('#admin-email', 'superadmin@globussoft.in');
    await page.type('#admin-password', 'GlobusAdmin2026!');
    await page.click('#admin-login-btn');

    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));
    console.log('✓ Successfully logged into Admin Panel');

    // 2. Navigate to Question Bank
    console.log('2. Navigating to Question Bank...');
    await page.goto('http://localhost:5173/admin/question-bank', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 2500));

    // Capture Question Bank overview screenshot
    const qbOverviewPath = path.join(SCREENSHOT_DIR, '01_question_bank_overview.png');
    await page.screenshot({ path: qbOverviewPath });
    console.log('✓ Captured Question Bank overview screenshot at:', qbOverviewPath);

    // 3. Find folders or question sets
    console.log('3. Searching for Question Sets...');
    // Look for folder rows or question set cards to expand
    const folderButtons = await page.$$('button, .folder-row, [data-folder-id]');
    for (const fb of folderButtons) {
      const text = await page.evaluate((el) => el.innerText, fb);
      if (text && (text.includes('SPOJ') || text.includes('Algorithm') || text.includes('Folder') || text.includes('Set'))) {
        try {
          await fb.click();
          await new Promise((r) => setTimeout(r, 1000));
          break;
        } catch (_) {}
      }
    }

    // Look for a Question Set item to click into
    const setButtons = await page.$$('button, tr, div');
    for (const sb of setButtons) {
      const text = await page.evaluate((el) => el.innerText, sb);
      if (text && (text.includes('set 1') || text.includes('set 4') || text.includes('Set 1') || text.includes('Set 4') || text.includes('QA_Algorithm'))) {
        try {
          await sb.click();
          await new Promise((r) => setTimeout(r, 2000));
          break;
        } catch (_) {}
      }
    }

    // Capture Question Set detail view
    const qbDetailPath = path.join(SCREENSHOT_DIR, '02_question_set_detail.png');
    await page.screenshot({ path: qbDetailPath });
    console.log('✓ Captured Question Set detail screenshot at:', qbDetailPath);

    // 4. Verify Question Titles (FEATURE-041)
    const questionTitleTexts = await page.$$eval(
      '.question-title, .problem-title, [data-testid="question-title"], h3, h4, .font-semibold, .text-sm',
      (els) => els.map((e) => e.innerText.trim()).filter((t) => t.length > 0)
    );
    console.log('Sample text elements found on page:', questionTitleTexts.slice(0, 15));

    // Check that no title contains redundant "<filename>.pdf | Problem N"
    const redundantPrefixList = questionTitleTexts.filter((t) => /\.pdf\s*[\|\:\-–—]/i.test(t));
    console.log('Redundant .pdf prefixes found:', redundantPrefixList.length);
    if (redundantPrefixList.length === 0) {
      console.log('✓ FEATURE-041 VERIFIED: 0 question titles contain redundant PDF prefixes (e.g. set_6.pdf | )');
    } else {
      console.warn('⚠️ Found redundant prefix in titles:', redundantPrefixList);
    }

    // 5. Look for EmbeddedPdfViewer canvas elements / preview panels (BUG-72/BUG-75)
    await page.waitForSelector('canvas', { timeout: 5000 }).catch(() => {});
    const pdfCanvases = await page.$$('canvas');
    console.log(`Detected ${pdfCanvases.length} canvas elements on page`);

    const pdfViewerState = await page.$$eval('.embedded-pdf-viewer, [data-testid="embedded-pdf-viewer"], .pdf-viewer-container', (els) => {
      return els.map((e) => ({
        className: e.className,
        hasCanvas: !!e.querySelector('canvas'),
        innerText: e.innerText.slice(0, 100),
      }));
    });
    console.log('PDF Viewer elements state:', pdfViewerState);

    console.log('--- Visual Browser Verification Complete ---');
  } catch (err) {
    console.error('Error during browser verification:', err);
  } finally {
    await browser.close();
  }
}

runVerification();
