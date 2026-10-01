const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\43e23410-b2a1-48a7-b8fb-6f4e93f2bc89';

if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function parseRgb(colorStr) {
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return [255, 255, 255];
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
}

function calculateContrast(rgb1, rgb2) {
  const lum1 = getLuminance(...rgb1);
  const lum2 = getLuminance(...rgb2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

async function setTheme(page, targetTheme) {
  await page.evaluate((theme) => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, targetTheme);
  await new Promise((r) => setTimeout(r, 400));
}

(async () => {
  console.log('🚀 Running Multi-Language BUG-119 Browser Test...');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  const targets = [
    {
      expectedLang: 'PYTHON',
      url: `${BASE_URL}/admin/tests/6aba358a9ea7e48af40d5dfa/live?candidateId=6ab9fd838e01174372e83740`
    },
    {
      expectedLang: 'JAVASCRIPT',
      url: `${BASE_URL}/admin/tests/6ab35eaec1c57ba5a052f2cf/live?candidateId=6ab35fbac1c57ba5a052f34d`
    },
    {
      expectedLang: 'AI_TEST',
      url: `${BASE_URL}/admin/tests/6abb9c23b65f95f9a9178998/live?candidateId=6abb9c68b65f95f9a91789fc`
    }
  ];

  const results = [];

  try {
    // 1. Admin Login
    console.log(`\n🔑 1. Logging in at ${BASE_URL}/admin/login...`);
    await page.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle2' });
    await page.type('input[type="email"], input[name="email"]', 'superadmin@globussoft.in');
    await page.type('input[type="password"], input[name="password"]', 'GlobusAdmin2026!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));

    for (const target of targets) {
      console.log(`\n🔍 Loading ${target.expectedLang} candidate: ${target.url}...`);
      await page.goto(target.url, { waitUntil: 'networkidle2' });
      await new Promise(r => setTimeout(r, 2000));

      console.log('Opening evaluation details...');
      const viewResultBtn = await page.$('.modal-footer button.btn-primary');
      if (viewResultBtn) await viewResultBtn.click();

      await page.waitForSelector('.modal-body table tbody tr button.btn-primary', { timeout: 10000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 1500));

      console.log('Opening submission report...');
      const inspectBtn = await page.$('.modal-body table tbody tr button.btn-primary');
      if (inspectBtn) await inspectBtn.click();
      await page.waitForSelector('#inspect-code-modal', { timeout: 6000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 1500));

      // Test Light and Dark Themes
      for (const theme of ['light', 'dark']) {
        await setTheme(page, theme);
        await new Promise(r => setTimeout(r, 500));

        const badgeData = await page.evaluate(() => {
          const header = document.querySelector('#inspect-code-modal .modal-header');
          if (!header) return null;

          const title = header.querySelector('.modal-title')?.innerText || '';
          const spans = Array.from(header.querySelectorAll('span'));
          const badge = spans.find(s => s.classList.contains('badge'));
          const score = spans.find(s => s.innerText.includes('Score:'));

          if (!badge) return null;
          const bcs = window.getComputedStyle(badge);
          const scs = score ? window.getComputedStyle(score) : null;

          return {
            title,
            badgeText: badge.innerText.trim(),
            badgeBg: bcs.backgroundColor,
            badgeColor: bcs.color,
            badgeFontWeight: bcs.fontWeight,
            badgeBorder: bcs.border,
            scoreText: score ? score.innerText.trim() : null,
            scoreBg: scs ? scs.backgroundColor : null,
            scoreColor: scs ? scs.color : null
          };
        });

        if (badgeData) {
          const textRgb = parseRgb(badgeData.badgeColor);
          const bgRgb = parseRgb(badgeData.badgeBg);
          const contrast = calculateContrast(textRgb, bgRgb);
          const langClean = badgeData.badgeText.toLowerCase().replace(/[^a-z0-9]/g, '_');

          const screenshotName = `bug119_${langClean}_submission_report_${theme}.png`;
          const screenshotPath = path.join(ARTIFACT_DIR, screenshotName);
          await page.screenshot({ path: screenshotPath });

          console.log(`✨ [${theme.toUpperCase()}] Header: "${badgeData.title}"`);
          console.log(`   Language Badge: "${badgeData.badgeText}" | Text: ${badgeData.badgeColor} | Bg: ${badgeData.badgeBg} | Contrast: ${contrast.toFixed(2)}:1`);
          console.log(`   Score Pill: "${badgeData.scoreText}" | Pill Text: ${badgeData.scoreColor} | Pill Bg: ${badgeData.scoreBg}`);
          console.log(`📸 Saved screenshot: ${screenshotName}`);

          results.push({
            language: badgeData.badgeText,
            theme,
            textColor: badgeData.badgeColor,
            bgColor: badgeData.badgeBg,
            contrastRatio: `${contrast.toFixed(2)}:1`,
            wcagStatus: contrast >= 7.0 ? 'PASS (AAA)' : contrast >= 4.5 ? 'PASS (AA)' : 'FAIL',
            scorePillIntact: Boolean(badgeData.scoreText && badgeData.scoreText.includes('Score:')),
            screenshot: screenshotName
          });
        }
      }

      // Close inspect modal
      const closeInspect = await page.$('#inspect-code-modal .modal-header button');
      if (closeInspect) await closeInspect.click();
      await new Promise(r => setTimeout(r, 600));

      // Close evaluation modal
      const closeEval = await page.$('.modal-header button[title="Close Modal"]');
      if (closeEval) await closeEval.click();
      await new Promise(r => setTimeout(r, 600));
    }

    console.log('\n📊 FINAL CONTRAST & ACCESSIBILITY AUDIT TABLE:');
    console.table(results);

    console.log(`\n🔍 Total Console Errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log('Console Errors:', consoleErrors);
    } else {
      console.log('✅ ZERO console errors detected.');
    }

  } catch (err) {
    console.error('Error during execution:', err);
  } finally {
    await browser.close();
    console.log('\n🏁 BUG-119 Verification Finished.');
  }
})();
