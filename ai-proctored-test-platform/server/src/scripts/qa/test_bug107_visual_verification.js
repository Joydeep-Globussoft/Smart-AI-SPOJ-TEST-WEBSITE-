const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\218a7624-67c0-4cf9-bf77-bc409535b4c9';

async function runVisualQA() {
  console.log('\n======================================================');
  console.log('📸 VISUAL & ZOOMED-IN EDGE QA VERIFICATION FOR BUG-107');
  console.log('======================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const screens = [
    {
      id: 'candidate_register',
      name: 'Candidate Register',
      url: 'http://localhost:5173/candidate/register',
      desktopFile: 'bug107_candidate_register_desktop.png',
      mobileFile: 'bug107_candidate_register_mobile.png',
      leftEdgeFile: 'bug107_candidate_register_left_edge.png',
      rightEdgeFile: 'bug107_candidate_register_right_edge.png'
    },
    {
      id: 'candidate_login',
      name: 'Candidate Login',
      url: 'http://localhost:5173/candidate/login',
      desktopFile: 'bug107_candidate_login_desktop.png',
      mobileFile: 'bug107_candidate_login_mobile.png',
      leftEdgeFile: 'bug107_candidate_login_left_edge.png',
      rightEdgeFile: 'bug107_candidate_login_right_edge.png'
    },
    {
      id: 'join_test_room',
      name: 'Candidate Join Room (Join Test Room State)',
      url: 'http://localhost:5173/candidate/join',
      desktopFile: 'bug107_candidate_join_room_desktop.png',
      mobileFile: 'bug107_candidate_join_room_mobile.png',
      leftEdgeFile: 'bug107_candidate_join_room_left_edge.png',
      rightEdgeFile: 'bug107_candidate_join_room_right_edge.png',
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
          sessionStorage.removeItem('inviteToken');
          sessionStorage.removeItem('inviteDetails');
        });
      }
    },
    {
      id: 'waiting_for_test',
      name: 'Candidate Join Room (Waiting for Test to Start State)',
      url: 'http://localhost:5173/candidate/join?token=MOCK-INVITE-TOKEN',
      desktopFile: 'bug107_waiting_for_test_desktop.png',
      mobileFile: 'bug107_waiting_for_test_mobile.png',
      leftEdgeFile: 'bug107_waiting_for_test_left_edge.png',
      rightEdgeFile: 'bug107_waiting_for_test_right_edge.png',
      preSetup: async (pg) => {
        await pg.setRequestInterception(true);
        pg.on('request', (req) => {
          if (req.url().includes('/api/v1/rooms/invite/')) {
            req.respond({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                data: {
                  testTitle: 'Auto submitted',
                  roomName: 'Ground floor',
                  isLive: false,
                  testStatus: 'DRAFT',
                  testId: 't123',
                  roomId: 'r123'
                }
              })
            });
          } else {
            req.continue();
          }
        });
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
        });
      }
    },
    {
      id: 'test_complete',
      name: 'Candidate Test Complete (Test Submitted)',
      url: 'http://localhost:5173/candidate/complete',
      desktopFile: 'bug107_candidate_test_complete_desktop.png',
      mobileFile: 'bug107_candidate_test_complete_mobile.png',
      leftEdgeFile: 'bug107_candidate_test_complete_left_edge.png',
      rightEdgeFile: 'bug107_candidate_test_complete_right_edge.png',
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
      desktopFile: 'bug107_admin_login_desktop.png',
      mobileFile: 'bug107_admin_login_mobile.png',
      leftEdgeFile: 'bug107_admin_login_left_edge.png',
      rightEdgeFile: 'bug107_admin_login_right_edge.png'
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
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
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
        isFlushLeft: logoRect.left <= cardRect.left,
        isFlushRight: logoRect.right >= cardRect.right,
        barBorderRadius: logoStyle.borderRadius,
        logoImgHeight: logoImgRect ? Math.round(logoImgRect.height) : null,
        titleText: title ? title.textContent.trim() : null,
        spaceBelowBarToHeading: titleRect ? Math.round(titleRect.top - logoRect.bottom) : null,
        cardRect: { x: cardRect.x, y: cardRect.y, width: cardRect.width, height: cardRect.height },
        logoRect: { x: logoRect.x, y: logoRect.y, width: logoRect.width, height: logoRect.height }
      };
    });

    console.log(`🖥️  [DESKTOP]`);
    console.log(`   - White Space Above Bar (Card Top -> Bar Top): ${desktopMetrics.whiteSpaceAboveBar}px (Card Top Padding: ${desktopMetrics.cardPaddingTop})`);
    console.log(`   - Bar Height: ${desktopMetrics.barHeight}px (Logo Img Height: ${desktopMetrics.logoImgHeight}px)`);
    console.log(`   - Bar Width: ${desktopMetrics.barWidth}px | Card Width: ${desktopMetrics.cardWidth}px`);
    console.log(`   - Flush Edges (Zero White Gap): Left Flush=${desktopMetrics.isFlushLeft}, Right Flush=${desktopMetrics.isFlushRight}`);
    console.log(`   - Bar Border-Radius: ${desktopMetrics.barBorderRadius}`);
    console.log(`   - Heading Below: "${desktopMetrics.titleText}" (${desktopMetrics.spaceBelowBarToHeading}px below bar)`);

    const desktopPath = path.join(ARTIFACT_DIR, s.desktopFile);
    await page.screenshot({ path: desktopPath });
    console.log(`   📸 Saved Desktop Screenshot: ${s.desktopFile}`);

    // Capture Zoomed-In Left Edge Crop (Card Top-Left corner + Bar Left edge junction)
    if (s.leftEdgeFile && desktopMetrics.cardRect && desktopMetrics.logoRect) {
      const leftCropPath = path.join(ARTIFACT_DIR, s.leftEdgeFile);
      await page.screenshot({
        path: leftCropPath,
        clip: {
          x: Math.max(0, desktopMetrics.cardRect.x - 10),
          y: Math.max(0, desktopMetrics.cardRect.y),
          width: 80,
          height: desktopMetrics.barHeight + 60
        }
      });
      console.log(`   🔍 Saved Left Edge Zoom Crop: ${s.leftEdgeFile}`);
    }

    // Capture Zoomed-In Right Edge Crop (Card Top-Right corner + Bar Right edge junction)
    if (s.rightEdgeFile && desktopMetrics.cardRect && desktopMetrics.logoRect) {
      const rightCropPath = path.join(ARTIFACT_DIR, s.rightEdgeFile);
      await page.screenshot({
        path: rightCropPath,
        clip: {
          x: Math.max(0, desktopMetrics.cardRect.x + desktopMetrics.cardRect.width - 70),
          y: Math.max(0, desktopMetrics.cardRect.y),
          width: 80,
          height: desktopMetrics.barHeight + 60
        }
      });
      console.log(`   🔍 Saved Right Edge Zoom Crop: ${s.rightEdgeFile}`);
    }

    // 2. Mobile Viewport (375x812)
    await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2 });
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
        isFlushLeft: logoRect.left <= cardRect.left,
        isFlushRight: logoRect.right >= cardRect.right,
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
    console.log(`   - Flush Edges (Zero White Gap): Left Flush=${mobileMetrics.isFlushLeft}, Right Flush=${mobileMetrics.isFlushRight}`);
    console.log(`   - Bar Border-Radius: ${mobileMetrics.barBorderRadius}`);

    const mobilePath = path.join(ARTIFACT_DIR, s.mobileFile);
    await page.screenshot({ path: mobilePath });
    console.log(`   📸 Saved Mobile Screenshot: ${s.mobileFile}`);

    await page.close();
  }

  await browser.close();
  console.log('\n======================================================');
  console.log('✅ ALL SCREENSHOTS & EDGE ZOOM CROPS CAPTURED SUCCESSFULLY!');
  console.log('======================================================\n');
}

runVisualQA().catch((err) => {
  console.error('Error during Visual QA:', err);
  process.exit(1);
});
