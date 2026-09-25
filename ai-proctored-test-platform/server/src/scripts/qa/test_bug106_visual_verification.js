const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\218a7624-67c0-4cf9-bf77-bc409535b4c9';

async function runVisualQA() {
  console.log('\n======================================================');
  console.log('📸 VISUAL & DOM QA VERIFICATION FOR BUG-106');
  console.log('======================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();

  const screens = [
    {
      id: 'candidate_register',
      name: 'Candidate Register',
      url: 'http://localhost:5173/candidate/register',
      desktopFile: 'bug106_candidate_register_desktop.png',
      mobileFile: 'bug106_candidate_register_mobile.png'
    },
    {
      id: 'candidate_login',
      name: 'Candidate Login',
      url: 'http://localhost:5173/candidate/login',
      desktopFile: 'bug106_candidate_login_desktop.png',
      mobileFile: 'bug106_candidate_login_mobile.png'
    },
    {
      id: 'join_test_room',
      name: 'Candidate Join Room (Join Test Room State)',
      url: 'http://localhost:5173/candidate/join',
      desktopFile: 'bug106_candidate_join_room_desktop.png',
      mobileFile: 'bug106_candidate_join_room_mobile.png',
      preSetup: async (pg) => {
        await pg.evaluateOnNewDocument(() => {
          localStorage.setItem('token', 'mock-candidate-token');
          localStorage.setItem('user', JSON.stringify({
            id: 'c123',
            name: 'Joydeep',
            email: 'joydeep@globussoft.in',
            type: 'candidate',
            role: 'candidate'
          }));
          sessionStorage.removeItem('joinData');
        });
      }
    },
    {
      id: 'waiting_for_test',
      name: 'Candidate Join Room (Waiting for Test to Start State)',
      url: 'http://localhost:5173/candidate/join?token=MOCK-INVITE-TOKEN',
      desktopFile: 'bug106_waiting_for_test_desktop.png',
      mobileFile: 'bug106_waiting_for_test_mobile.png',
      preSetup: async (pg) => {
        await pg.evaluateOnNewDocument(() => {
          localStorage.setItem('token', 'mock-candidate-token');
          localStorage.setItem('user', JSON.stringify({
            id: 'c123',
            name: 'joy',
            email: 'joy@globussoft.in',
            type: 'candidate',
            role: 'candidate'
          }));
          sessionStorage.setItem('inviteToken', 'MOCK-INVITE-TOKEN');
          sessionStorage.setItem('inviteDetails', JSON.stringify({
            testTitle: 'Auto submitted',
            roomName: 'Ground floor',
            isLive: false,
            testStatus: 'DRAFT'
          }));
        });
      }
    },
    {
      id: 'test_complete',
      name: 'Candidate Test Complete (Test Submitted)',
      url: 'http://localhost:5173/candidate/complete',
      desktopFile: 'bug106_candidate_test_complete_desktop.png',
      mobileFile: 'bug106_candidate_test_complete_mobile.png',
      preSetup: async (pg) => {
        await pg.evaluateOnNewDocument(() => {
          localStorage.setItem('token', 'mock-candidate-token');
          localStorage.setItem('user', JSON.stringify({
            id: 'c123',
            name: 'joy',
            email: 'joy@globussoft.in',
            type: 'candidate',
            role: 'candidate'
          }));
        });
      }
    },
    {
      id: 'admin_login',
      name: 'Admin Sign In',
      url: 'http://localhost:5173/admin/login',
      desktopFile: 'bug106_admin_login_desktop.png',
      mobileFile: 'bug106_admin_login_mobile.png'
    }
  ];

  for (const s of screens) {
    console.log(`\n------------------------------------------------------`);
    console.log(`🔍 Evaluating: ${s.name}`);
    console.log(`------------------------------------------------------`);

    const page = await browser.newPage();
    if (s.preSetup) {
      await s.preSetup(page);
    }

    // 1. Desktop Viewport (1280x900)
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(s.url, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 600));

    const desktopMetrics = await page.evaluate(() => {
      const card = document.querySelector('.auth-card');
      const logo = document.querySelector('.auth-logo');
      const logoImg = logo ? logo.querySelector('img') : null;
      const title = document.querySelector('.auth-title') || document.querySelector('h1');
      if (!card || !logo) return null;

      const cardRect = card.getBoundingClientRect();
      const logoRect = logo.getBoundingClientRect();
      const logoImgRect = logoImg ? logoImg.getBoundingClientRect() : null;
      const titleRect = title ? title.getBoundingClientRect() : null;
      const cardStyle = window.getComputedStyle(card);
      const logoStyle = window.getComputedStyle(logo);

      return {
        cardPaddingTop: cardStyle.paddingTop,
        whiteSpaceAboveBar: Math.round(logoRect.top - cardRect.top),
        barHeight: Math.round(logoRect.height),
        barWidth: Math.round(logoRect.width),
        cardWidth: Math.round(cardRect.width),
        isFlushLeft: Math.abs(logoRect.left - cardRect.left) <= 1,
        isFlushRight: Math.abs(logoRect.right - cardRect.right) <= 1,
        barBorderRadius: logoStyle.borderRadius,
        logoImgHeight: logoImgRect ? Math.round(logoImgRect.height) : null,
        titleText: title ? title.textContent.trim() : null,
        spaceBelowBarToHeading: titleRect ? Math.round(titleRect.top - logoRect.bottom) : null
      };
    });

    console.log(`🖥️  [DESKTOP]`);
    console.log(`   - White Space Above Bar (Card Top -> Bar Top): ${desktopMetrics.whiteSpaceAboveBar}px (Card Top Padding: ${desktopMetrics.cardPaddingTop})`);
    console.log(`   - Bar Height: ${desktopMetrics.barHeight}px (Logo Img Height: ${desktopMetrics.logoImgHeight}px)`);
    console.log(`   - Bar Width: ${desktopMetrics.barWidth}px | Card Width: ${desktopMetrics.cardWidth}px`);
    console.log(`   - Flush Edges (No Gap): Left=${desktopMetrics.isFlushLeft}, Right=${desktopMetrics.isFlushRight}`);
    console.log(`   - Bar Border-Radius: ${desktopMetrics.barBorderRadius}`);
    console.log(`   - Heading Below: "${desktopMetrics.titleText}" (${desktopMetrics.spaceBelowBarToHeading}px below bar)`);

    const desktopPath = path.join(ARTIFACT_DIR, s.desktopFile);
    await page.screenshot({ path: desktopPath });
    console.log(`   📸 Saved Desktop Screenshot: ${s.desktopFile}`);

    // 2. Mobile Viewport (375x812)
    await page.setViewport({ width: 375, height: 812 });
    await new Promise(r => setTimeout(r, 400));

    const mobileMetrics = await page.evaluate(() => {
      const card = document.querySelector('.auth-card');
      const logo = document.querySelector('.auth-logo');
      const logoImg = logo ? logo.querySelector('img') : null;
      const title = document.querySelector('.auth-title') || document.querySelector('h1');
      if (!card || !logo) return null;

      const cardRect = card.getBoundingClientRect();
      const logoRect = logo.getBoundingClientRect();
      const logoImgRect = logoImg ? logoImg.getBoundingClientRect() : null;
      const titleRect = title ? title.getBoundingClientRect() : null;
      const cardStyle = window.getComputedStyle(card);
      const logoStyle = window.getComputedStyle(logo);

      return {
        cardPaddingTop: cardStyle.paddingTop,
        whiteSpaceAboveBar: Math.round(logoRect.top - cardRect.top),
        barHeight: Math.round(logoRect.height),
        barWidth: Math.round(logoRect.width),
        cardWidth: Math.round(cardRect.width),
        isFlushLeft: Math.abs(logoRect.left - cardRect.left) <= 1,
        isFlushRight: Math.abs(logoRect.right - cardRect.right) <= 1,
        barBorderRadius: logoStyle.borderRadius,
        logoImgHeight: logoImgRect ? Math.round(logoImgRect.height) : null,
        titleText: title ? title.textContent.trim() : null,
        spaceBelowBarToHeading: titleRect ? Math.round(titleRect.top - logoRect.bottom) : null
      };
    });

    console.log(`📱 [MOBILE (375px)]`);
    console.log(`   - White Space Above Bar (Card Top -> Bar Top): ${mobileMetrics.whiteSpaceAboveBar}px (Card Top Padding: ${mobileMetrics.cardPaddingTop})`);
    console.log(`   - Bar Height: ${mobileMetrics.barHeight}px (Logo Img Height: ${mobileMetrics.logoImgHeight}px)`);
    console.log(`   - Bar Width: ${mobileMetrics.barWidth}px | Card Width: ${mobileMetrics.cardWidth}px`);
    console.log(`   - Flush Edges (No Gap): Left=${mobileMetrics.isFlushLeft}, Right=${mobileMetrics.isFlushRight}`);
    console.log(`   - Bar Border-Radius: ${mobileMetrics.barBorderRadius}`);

    const mobilePath = path.join(ARTIFACT_DIR, s.mobileFile);
    await page.screenshot({ path: mobilePath });
    console.log(`   📸 Saved Mobile Screenshot: ${s.mobileFile}`);

    await page.close();
  }

  await browser.close();
  console.log('\n======================================================');
  console.log('✅ ALL SCREENSHOTS & METRICS CAPTURED SUCCESSFULLY!');
  console.log('======================================================\n');
}

runVisualQA().catch((err) => {
  console.error('Error during Visual QA:', err);
  process.exit(1);
});
