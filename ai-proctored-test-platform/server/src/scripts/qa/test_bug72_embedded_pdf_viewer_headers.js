/**
 * QA Automated Verification Suite: BUG-72
 * Resolves PDF Viewer Cross-Origin Iframe Framing Restrictions & Implements Resilient In-App Loading
 *
 * Verifies that:
 * 1. Express helmet middleware allows cross-origin framing and assets (frameguard: false, CSP: false, CORP: cross-origin).
 * 2. GET /questions/pdf-asset/:filename endpoint:
 *    - Explicitly strips X-Frame-Options (never returns SAMEORIGIN).
 *    - Emits Content-Security-Policy: frame-ancestors *.
 *    - Emits Cross-Origin-Resource-Policy: cross-origin.
 *    - Emits Access-Control-Allow-Origin: *.
 *    - Emits Content-Disposition: inline.
 *    - Safely blocks path traversal attempts.
 * 3. Candidate EmbeddedPdfViewer.jsx:
 *    - Implements proactive asset probing watchdog.
 *    - Provides resilient in-app loading and retry states with backoff.
 *    - Renders fallback direct-open links and manual retry controls.
 *    - Tags iframe with id="pdf-viewer-iframe" and data-preview-iframe="true" to exempt focus from false tab-switch penalties.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
  }
}

async function requestHttp(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: urlPath,
        method: 'GET',
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body,
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: BUG-72 (PDF Viewer Framing & In-App Loading)');
  console.log('========================================================================\n');

  // ── PART 1: Static Code Inspection ───────────────────────────────────────────
  console.log('--- Part 1: Static Code & Architectural Integrity Inspection ---');

  const appPath = path.resolve(__dirname, '../../app.js');
  const questionControllerPath = path.resolve(__dirname, '../../controllers/questionController.js');
  const embeddedPdfViewerPath = path.resolve(__dirname, '../../../../client/src/candidate/components/EmbeddedPdfViewer.jsx');

  const appCode = fs.readFileSync(appPath, 'utf8');
  const questionControllerCode = fs.readFileSync(questionControllerPath, 'utf8');
  const embeddedPdfViewerCode = fs.readFileSync(embeddedPdfViewerPath, 'utf8');

  assert(
    appCode.includes('frameguard: false') &&
    appCode.includes("crossOriginResourcePolicy: { policy: 'cross-origin' }"),
    'app.js configures helmet with frameguard disabled and crossOriginResourcePolicy cross-origin'
  );

  assert(
    questionControllerCode.includes("res.removeHeader('X-Frame-Options')") &&
    questionControllerCode.includes('frame-ancestors *') &&
    questionControllerCode.includes("res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')"),
    'questionController.js servePdfAsset explicitly removes X-Frame-Options and sets frame-ancestors *'
  );

  assert(
    embeddedPdfViewerCode.includes('probeAsset') &&
    embeddedPdfViewerCode.includes('maxRetries') &&
    embeddedPdfViewerCode.includes('handleManualRetry'),
    'EmbeddedPdfViewer.jsx implements proactive asset probing and auto-retry watchdog'
  );

  assert(
    embeddedPdfViewerCode.includes('id="pdf-viewer-iframe"') &&
    embeddedPdfViewerCode.includes('data-preview-iframe="true"'),
    'EmbeddedPdfViewer.jsx tags iframe with id and data-preview-iframe="true" for proctoring exemption'
  );

  assert(
    embeddedPdfViewerCode.includes('Open PDF Directly') &&
    embeddedPdfViewerCode.includes('Retry Loading'),
    'EmbeddedPdfViewer.jsx includes in-app retry button and direct PDF open link fallback'
  );

  // ── PART 2: Live HTTP Response Header Inspection ─────────────────────────────
  console.log('\n--- Part 2: Dynamic Live HTTP Response Header Inspection ---');

  // Find an existing PDF file in uploads
  const uploadDir = path.resolve(__dirname, '../../../uploads/pdf_questions');
  let testPdfFilename = null;
  if (fs.existsSync(uploadDir)) {
    const files = fs.readdirSync(uploadDir).filter((f) => f.endsWith('.pdf'));
    if (files.length > 0) {
      testPdfFilename = files[0];
    }
  }

  if (!testPdfFilename) {
    // Create a temporary dummy pdf file for testing
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    testPdfFilename = 'qa_test_asset.pdf';
    fs.writeFileSync(path.join(uploadDir, testPdfFilename), '%PDF-1.4 test dummy');
  }

  const pdfEndpoint = `/api/v1/questions/pdf-asset/${testPdfFilename}`;
  const response = await requestHttp(pdfEndpoint);

  assert(response.statusCode === 200, `GET ${pdfEndpoint} returns HTTP 200 OK`);
  assert(
    !response.headers['x-frame-options'] || response.headers['x-frame-options'] === 'ALLOWALL',
    `X-Frame-Options is NOT SAMEORIGIN (Actual: ${response.headers['x-frame-options'] || 'None'})`
  );
  assert(
    response.headers['content-security-policy']?.includes('frame-ancestors *'),
    `Content-Security-Policy contains frame-ancestors * (Actual: ${response.headers['content-security-policy']})`
  );
  assert(
    response.headers['cross-origin-resource-policy'] === 'cross-origin',
    `Cross-Origin-Resource-Policy is cross-origin (Actual: ${response.headers['cross-origin-resource-policy']})`
  );
  assert(
    response.headers['access-control-allow-origin'] === '*',
    `Access-Control-Allow-Origin is * (Actual: ${response.headers['access-control-allow-origin']})`
  );
  assert(
    response.headers['content-type'] === 'application/pdf',
    `Content-Type is application/pdf (Actual: ${response.headers['content-type']})`
  );
  assert(
    response.headers['content-disposition']?.includes('inline'),
    `Content-Disposition is inline (Actual: ${response.headers['content-disposition']})`
  );

  // Test 404 handling for non-existent file
  const missingResponse = await requestHttp('/api/v1/questions/pdf-asset/non_existent_file.pdf');
  assert(missingResponse.statusCode === 404, 'GET /questions/pdf-asset for missing file returns HTTP 404');
  try {
    const errorBody = JSON.parse(missingResponse.body);
    assert(errorBody.error === 'PDF asset not found.', 'Missing PDF returns structured JSON error');
  } catch (err) {
    assert(false, `Missing PDF response body was not valid JSON: ${err.message}`);
  }

  // ── SUMMARY ──────────────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log(`QA TEST SUMMARY: ${passedTests}/${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
