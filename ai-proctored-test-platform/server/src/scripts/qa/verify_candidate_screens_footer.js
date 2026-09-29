const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  console.log('--- CANDIDATE TEST SCREENS FOOTER VERIFICATION ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const errors = [];
  page.on('pageerror', (err) => {
    errors.push(err.message);
    console.error('[PageError]:', err.message);
  });

  try {
    // Navigate to candidate instruction / test routes
    await page.goto('http://localhost:5173/candidate/instructions/mock-test-id', { waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise(r => setTimeout(r, 1000));

    const content = await page.evaluate(() => document.body.innerText);
    console.log('Instructions page loaded. Error boundary triggered?:', content.includes('Something went wrong'));

    // Check if there are any errors matching TestFooter
    const hasFooterError = errors.some(e => e.includes('TestFooter'));
    console.log('Any TestFooter errors encountered?:', hasFooterError);

  } catch (err) {
    console.error('Error during test screen check:', err);
  } finally {
    await browser.close();
  }
})();
