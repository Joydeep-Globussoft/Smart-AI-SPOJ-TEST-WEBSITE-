// server/src/scripts/qa/test_feature011_admin_dark_mode.js
// QA verification for FEATURE-011: Dark Mode toggle for Admin Panel

const fs = require('fs');
const path = require('path');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✕ FAIL: ${message}`);
  }
}

console.log('=== FEATURE-011: Admin Dark Mode QA Suite ===\n');

const clientRoot = path.join(__dirname, '../../../../client');

// 1. Check global.css for CSS theme tokens
console.log('--- Checking CSS Theme Token Definitions in global.css ---');
const globalCssPath = path.join(clientRoot, 'src/styles/global.css');
assert(fs.existsSync(globalCssPath), 'global.css exists');
const globalCss = fs.readFileSync(globalCssPath, 'utf8');

assert(globalCss.includes('[data-theme="dark"]'), 'global.css defines [data-theme="dark"] tokens');
assert(globalCss.includes('--color-bg:'), 'global.css defines --color-bg variable');
assert(globalCss.includes('--color-bg-card:'), 'global.css defines --color-bg-card variable');
assert(globalCss.includes('--color-bg-subtle:'), 'global.css defines --color-bg-subtle variable');
assert(globalCss.includes('--color-text:'), 'global.css defines --color-text variable');
assert(globalCss.includes('--color-text-muted:'), 'global.css defines --color-text-muted variable');
assert(globalCss.includes('--color-navy:'), 'global.css defines --color-navy variable');
assert(globalCss.includes('--color-border:'), 'global.css defines --color-border variable');
assert(globalCss.includes('--color-table-header-bg:'), 'global.css defines --color-table-header-bg variable');
assert(globalCss.includes('--color-modal-bg:'), 'global.css defines --color-modal-bg variable');

// 2. Check index.html for zero-flash inline head script
console.log('\n--- Checking Zero-Flash Script in index.html ---');
const indexHtmlPath = path.join(clientRoot, 'index.html');
assert(fs.existsSync(indexHtmlPath), 'index.html exists');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

assert(indexHtml.includes("localStorage.getItem('admin_theme')"), 'index.html checks localStorage for admin_theme');
assert(indexHtml.includes("document.documentElement.setAttribute('data-theme'"), 'index.html sets data-theme attribute on documentElement');

// 3. Check useTheme hook & ThemeProvider
console.log('\n--- Checking useTheme Hook & ThemeProvider ---');
const useThemePath = path.join(clientRoot, 'src/hooks/useTheme.jsx');
assert(fs.existsSync(useThemePath), 'useTheme.jsx exists');
const useThemeContent = fs.readFileSync(useThemePath, 'utf8');

assert(useThemeContent.includes('export const useTheme ='), 'useTheme hook is exported');
assert(useThemeContent.includes('export const ThemeProvider ='), 'ThemeProvider is exported');
assert(useThemeContent.includes("localStorage.setItem('admin_theme'"), 'useTheme persists admin_theme to localStorage');

const appPath = path.join(clientRoot, 'src/App.jsx');
const appContent = fs.readFileSync(appPath, 'utf8');
assert(appContent.includes('<ThemeProvider>'), 'App.jsx wraps application with <ThemeProvider>');

// 4. Check AdminNavbar for toggle button
console.log('\n--- Checking Theme Toggle in AdminNavbar ---');
const navbarPath = path.join(clientRoot, 'src/shared/AdminNavbar.jsx');
assert(fs.existsSync(navbarPath), 'AdminNavbar.jsx exists');
const navbarContent = fs.readFileSync(navbarPath, 'utf8');

assert(navbarContent.includes('admin-theme-toggle-btn'), 'AdminNavbar contains #admin-theme-toggle-btn');
assert(navbarContent.includes('useTheme()'), 'AdminNavbar consumes useTheme()');
assert(navbarContent.includes('toggleTheme'), 'AdminNavbar calls toggleTheme');

// 5. Check Admin Pages use theme tokens
console.log('\n--- Checking Admin Pages for Dynamic CSS Variable Usage ---');
const adminPages = [
  'AdminDashboard.jsx',
  'AdminTests.jsx',
  'AdminTestDetail.jsx',
  'AdminQuestionBank.jsx',
  'AdminResults.jsx',
  'AdminProfile.jsx',
  'AdminSettings.jsx',
  'AdminHelp.jsx',
  'AdminCreateAdmin.jsx',
  'AdminLiveDashboard.jsx',
];

adminPages.forEach((pageName) => {
  const filePath = path.join(clientRoot, 'src/admin/pages', pageName);
  assert(fs.existsSync(filePath), `${pageName} exists`);
  const content = fs.readFileSync(filePath, 'utf8');
  assert(
    content.includes('var(--color-') || content.includes('card') || content.includes('app-layout'),
    `${pageName} uses theme styling infrastructure`
  );
});

// 6. Option A: Check AdminQuestionBank & EmbeddedPdfViewer Preview
console.log('\n--- Checking Option A: EmbeddedPdfViewer Problem Statement Canvas ---');
const qbPath = path.join(clientRoot, 'src/admin/pages/AdminQuestionBank.jsx');
const qbContent = fs.readFileSync(qbPath, 'utf8');
assert(qbContent.includes('EmbeddedPdfViewer'), 'AdminQuestionBank imports EmbeddedPdfViewer for preview');
assert(qbContent.includes('var(--color-bg-subtle)') && qbContent.includes('var(--color-navy)'), 'AdminQuestionBank modal uses theme tokens');

const pdfViewerPath = path.join(clientRoot, 'src/candidate/components/EmbeddedPdfViewer.jsx');
const pdfViewerContent = fs.readFileSync(pdfViewerPath, 'utf8');
assert(pdfViewerContent.includes('#13141f') || pdfViewerContent.includes('#0f172a'), 'EmbeddedPdfViewer maintains fixed candidate-safe dark canvas');

// 7. Check Candidate Screens remain fixed dark
console.log('\n--- Checking Candidate Screens Remain Fixed Dark ---');
const candidateTestPath = path.join(clientRoot, 'src/candidate/pages/CandidateTestScreen.jsx');
const candidateTestContent = fs.readFileSync(candidateTestPath, 'utf8');
assert(!candidateTestContent.includes('admin-theme-toggle-btn'), 'CandidateTestScreen does NOT contain admin theme toggle');
assert(candidateTestContent.includes('test-screen-header') || candidateTestContent.includes('timer-bar'), 'CandidateTestScreen retains fixed dark layout header/timer');

// 8. Regression Checks (BUG-01 to BUG-76)
console.log('\n--- Verifying Regression Safeguards (BUG-24, BUG-30, BUG-32, BUG-74, BUG-75, BUG-76) ---');
const liveDashPath = path.join(clientRoot, 'src/admin/pages/AdminLiveDashboard.jsx');
const liveDashContent = fs.readFileSync(liveDashPath, 'utf8');

assert(liveDashContent.includes('getCandidateRemainingMs'), 'AdminLiveDashboard preserves BUG-24 countdown logic');
assert(liveDashContent.includes('seat-tile-hover'), 'AdminLiveDashboard preserves BUG-30 / BUG-32 seat tile structure');
assert(liveDashContent.includes('STATUS_COLORS'), 'AdminLiveDashboard preserves Section 14 STATUS_COLORS');

assert(pdfViewerContent.includes('pdfPageRange'), 'EmbeddedPdfViewer preserves BUG-74 page range restriction');
assert(pdfViewerContent.includes("zoomMode === 'fitWidth'") && pdfViewerContent.includes('ResizeObserver'), 'EmbeddedPdfViewer preserves BUG-75 responsive auto-fit');
assert(pdfViewerContent.includes('isHorizontalOverflow') && pdfViewerContent.includes('handleMouseDown'), 'EmbeddedPdfViewer preserves BUG-76 zoom panning');

console.log(`\n========================================`);
console.log(`Summary: ${passedTests}/${totalTests} tests passed`);
console.log(`========================================`);

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
