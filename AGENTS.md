# Repository Rules & Standing Directives

## Regression Prevention Protocol (BUG-01 through BUG-33+)

Whenever editing any file in this repository:
1. **Pre-Edit Audit**: Note which prior bug fixes touch the target file and must be preserved (e.g. `useProctoring.js` carries BUG-13, BUG-16, BUG-29, BUG-31, BUG-33; `AdminLiveDashboard.jsx` carries BUG-24, BUG-30, BUG-32; candidate screens carry BUG-14, BUG-31, BUG-33).
2. **Post-Edit Git Diff Verification**: Review full `git diff` on all modified files to ensure zero accidental reverts, dropped imports, or duplicate JSX snippets.
3. **Single Source of Truth**: Edit shared components in their original shared file; never fork or duplicate them across pages.
4. **Regression Triage**: If an issue touches previously fixed behavior, inspect git history first to identify the exact change that caused the regression before modifying code.
5. **Confirmation**: Include an explicit note in every response detailing what previously fixed behavior was preserved.

## Live Hosted Production Testing & Deployment Protocol
Always implement, verify, and test against the live hosted production environments:
- **Admin Panel**: `https://smart-ai-spoj-test-website.vercel.app/admin/login`
- **Candidate Portal**: `https://smart-ai-spoj-test-website.vercel.app/candidate/register`
- **Backend API**: `https://smart-ai-spoj-test-website.onrender.com/api/v1`
- **Admin Credentials**: `superadmin@globussoft.in` / `GlobusAdmin2026!`
- **Deployment Requirement**: Every fix and feature change must be pushed to GitHub (`origin/master`) and verified live against the actual deployed Vercel frontend and Render backend.
