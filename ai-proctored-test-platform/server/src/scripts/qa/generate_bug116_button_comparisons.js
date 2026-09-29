const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  console.log('=== GENERATING BUG-116 BUTTON COLOR COMPARISON SCREENSHOTS ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });

  try {
    // 1. Login
    await page.goto('http://localhost:5173/admin/login', { waitUntil: 'networkidle2' });
    await page.type('input[type="email"], input[name="email"]', 'superadmin@globussoft.in');
    await page.type('input[type="password"], input[name="password"]', 'GlobusAdmin2026!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise(r => setTimeout(r, 1200));

    // 2. Navigate to Manage Admins
    await page.goto('http://localhost:5173/admin/create-admin', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    // --- OPTION 1: Crisp Blue-Indigo (#3E63DD / Light, #5375E2 / Dark) ---
    console.log('Generating Option 1 (Crisp Blue-Indigo: #3E63DD)...');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('admin_theme', 'light');
      document.documentElement.style.setProperty('--admin-indigo', '#3E63DD');
      const btn = document.querySelector('#create-admin-btn');
      if (btn) {
        btn.style.background = '#3E63DD';
        btn.style.borderColor = '#3E63DD';
      }
    });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\bug116_option1_blue_indigo_light.png',
      clip: { x: 0, y: 0, width: 1440, height: 600 }
    });

    // Option 1 Modal
    await page.click('#create-admin-btn');
    await new Promise(r => setTimeout(r, 400));
    await page.evaluate(() => {
      const submitBtn = document.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.style.background = '#3E63DD';
        submitBtn.style.borderColor = '#3E63DD';
      }
    });
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\bug116_option1_modal_light.png',
      fullPage: false
    });
    // Close modal
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Cancel'));
      if (cancelBtn) cancelBtn.click();
    });
    await new Promise(r => setTimeout(r, 400));

    // --- OPTION 2: Muted Slate-Indigo (#365CCE / Light, #4C6EF5 / Dark) ---
    console.log('Generating Option 2 (Muted Slate-Indigo: #365CCE)...');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.style.setProperty('--admin-indigo', '#365CCE');
      const btn = document.querySelector('#create-admin-btn');
      if (btn) {
        btn.style.background = '#365CCE';
        btn.style.borderColor = '#365CCE';
      }
    });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\bug116_option2_slate_indigo_light.png',
      clip: { x: 0, y: 0, width: 1440, height: 600 }
    });

    // Option 2 Modal
    await page.click('#create-admin-btn');
    await new Promise(r => setTimeout(r, 400));
    await page.evaluate(() => {
      const submitBtn = document.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.style.background = '#365CCE';
        submitBtn.style.borderColor = '#365CCE';
      }
    });
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\bug116_option2_modal_light.png',
      fullPage: false
    });
    // Close modal
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Cancel'));
      if (cancelBtn) cancelBtn.click();
    });
    await new Promise(r => setTimeout(r, 400));

    // Dark Mode Comparison (Option 1 vs Option 2)
    console.log('Generating Dark Mode renders...');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('admin_theme', 'dark');
      document.documentElement.style.setProperty('--admin-indigo', '#5375E2');
      const btn = document.querySelector('#create-admin-btn');
      if (btn) {
        btn.style.background = '#5375E2';
        btn.style.borderColor = '#5375E2';
      }
    });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({
      path: 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\56886273-cde7-484d-baee-8a3540f0f48d\\bug116_option1_blue_indigo_dark.png',
      clip: { x: 0, y: 0, width: 1440, height: 600 }
    });

    console.log('✅ All comparison screenshots generated successfully!');
  } catch (err) {
    console.error('Error generating comparisons:', err);
  } finally {
    await browser.close();
  }
})();
