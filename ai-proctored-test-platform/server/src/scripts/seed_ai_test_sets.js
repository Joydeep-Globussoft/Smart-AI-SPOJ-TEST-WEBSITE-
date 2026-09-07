// seed_ai_test_sets.js — Creates 5 AI Test Question Sets with 1 or 2 comprehensive project questions each
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Admin = require('../models/Admin');
const QuestionSet = require('../models/QuestionSet');
const Question = require('../models/Question');
const Test = require('../models/Test');

const AI_QUESTION_SETS = [
  {
    name: 'AI Test — Kanban Workspace & Focus Studio',
    testType: 'AI_TEST',
    testTitle: 'AI Test: Productivity & Task Engineering',
    durationMinutes: 60,
    passingCriteria: 1,
    instructions: 'Use the Kimi AI Assistant to design and develop responsive, interactive web applications. You will be evaluated on UI polish, functional interactivity, edge case handling, and code organization.',
    questions: [
      {
        title: 'Interactive Kanban Project Board',
        difficulty: 'MEDIUM',
        description: `# Interactive Kanban Project Board

Build a fully interactive, single-page Kanban project management board.

## Core Requirements:
1. **Three Standard Columns**:
   - "To Do"
   - "In Progress"
   - "Done"
2. **Task Creation**:
   - A modal or inline form to add a new task with: Title, Description, Priority (Low, Medium, High), and Due Date.
3. **Card Management & Movement**:
   - Allow moving tasks between columns (via drag-and-drop or explicit "Move to..." action buttons).
   - Ability to edit task details inline or via modal.
   - Ability to delete a task with a confirmation prompt.
4. **Filtering & Search**:
   - Real-time search bar that filters tasks by title or keyword.
   - Priority filter (All, Low, Medium, High).
5. **Visual Polish & State Persistence**:
   - Modern glassmorphic or card-based UI with clear priority badges.
   - Smooth hover animations and column item counters (e.g., "In Progress (3)").
   - Persist board state to \`localStorage\` so data survives page refreshes.`,
        aiTestBriefFiles: [
          { fileName: 'index.html' },
          { fileName: 'style.css' },
          { fileName: 'script.js' }
        ]
      },
      {
        title: 'Pomodoro Focus Timer & Productivity Tracker',
        difficulty: 'EASY',
        description: `# Pomodoro Focus Timer & Productivity Tracker

Build an elegant, feature-complete Pomodoro Timer web application.

## Core Requirements:
1. **Timer Modes**:
   - **Work Session**: 25 minutes default (customizable).
   - **Short Break**: 5 minutes default.
   - **Long Break**: 15 minutes default.
2. **Interactive Controls**:
   - Start / Pause / Reset buttons.
   - Mode switching tabs with visual active states.
   - Circular progress ring (SVG or CSS) showing elapsed time.
3. **Session Logging & Audio Alert**:
   - Log completed focus intervals in a daily session history list.
   - Visual flash or sound chime upon timer completion.
   - Custom duration inputs in a settings drawer or modal.`,
        aiTestBriefFiles: [
          { fileName: 'index.html' },
          { fileName: 'style.css' },
          { fileName: 'script.js' }
        ]
      }
    ]
  },
  {
    name: 'AI Test — Real-Time Financial & Crypto Hub',
    testType: 'AI_TEST',
    testTitle: 'AI Test: Financial Systems & Data Visualization',
    durationMinutes: 45,
    passingCriteria: 1,
    instructions: 'Develop an interactive financial dashboard utilizing real-time calculation logic, clean data presentation, and responsive UI components.',
    questions: [
      {
        title: 'Crypto Portfolio & Currency Exchange Studio',
        difficulty: 'HARD',
        description: `# Crypto Portfolio & Currency Exchange Studio

Build a comprehensive financial dashboard with real-time conversion tools and asset tracking.

## Core Requirements:
1. **Multi-Currency Converter**:
   - Support conversion between USD, EUR, GBP, JPY, INR, BTC, and ETH.
   - Real-time input calculation (typing in one field instantly computes the counterpart).
   - "Swap Currencies" toggle button with smooth icon rotation.
2. **Interactive Asset Portfolio**:
   - Add custom asset holdings (Asset Name, Quantity, Buy Price, Current Price).
   - Live profit/loss calculation (dollar amount and percentage badge: green for gain, red for loss).
   - Total Portfolio Value summary banner with overall ROI metric.
3. **Price Trend Chart Simulation**:
   - Render a 7-day price trend line chart using SVG or HTML5 Canvas.
   - Timeframe toggles (24H, 7D, 1M, 1Y) that update the charted datapoints.
4. **Transaction History & Export**:
   - Log of recent buy/sell conversions with timestamps.
   - Filterable transaction table with CSV or JSON download option.`,
        aiTestBriefFiles: [
          { fileName: 'index.html' },
          { fileName: 'style.css' },
          { fileName: 'script.js' }
        ]
      }
    ]
  },
  {
    name: 'AI Test — E-Commerce Storefront & Checkout',
    testType: 'AI_TEST',
    testTitle: 'AI Test: E-Commerce Architecture & Cart Experience',
    durationMinutes: 60,
    passingCriteria: 1,
    instructions: 'Build a seamless online shopping experience with product catalog filtering, cart state management, and coupon validation.',
    questions: [
      {
        title: 'Dynamic Product Catalog & Sliding Cart Drawer',
        difficulty: 'MEDIUM',
        description: `# Dynamic Product Catalog & Sliding Cart Drawer

Build a modern, responsive storefront catalog with full shopping cart capabilities.

## Core Requirements:
1. **Product Grid & Filtering**:
   - Display a grid of at least 8 varied mock products (Image placeholder, Title, Category, Rating, Price, Stock status).
   - Category filter pills (All, Electronics, Apparel, Accessories, Home).
   - Price range slider with minimum and maximum boundaries.
   - Sort dropdown (Price Low-to-High, Price High-to-Low, Highest Rated).
2. **Interactive Cart System**:
   - Slide-over cart drawer or floating modal.
   - Add to Cart, Increment, Decrement, and Remove item actions.
   - Real-time Subtotal, Estimated Tax (8%), Shipping cost, and Order Total.
   - Badge counter on the main navigation cart icon indicating total item quantity.
3. **Product Quick View Modal**:
   - Clicking a product card opens a detailed Quick View modal with item description, image carousel, and quantity selector.`,
        aiTestBriefFiles: [
          { fileName: 'index.html' },
          { fileName: 'style.css' },
          { fileName: 'script.js' }
        ]
      },
      {
        title: 'Promo Code & Discount Voucher Engine',
        difficulty: 'EASY',
        description: `# Promo Code & Discount Voucher Engine

Build a coupon and promotion code evaluation component for an e-commerce checkout.

## Core Requirements:
1. **Coupon Rules Engine**:
   - \`SAVE10\`: 10% discount on orders above $50.
   - \`FLAT25\`: $25 flat discount on orders above $100.
   - \`FREESHIP\`: Free shipping ($0 shipping fee).
   - \`GLOBUSVIP\`: 20% discount + Free shipping on all orders.
2. **User Interaction & Feedback**:
   - Promo code input with "Apply" button.
   - Instant validation: displays success badge with saved amount or explicit error banner (e.g., "Code expired" or "Order subtotal must be at least $50").
   - Ability to remove an applied coupon.
3. **Live Savings Breakdown**:
   - Visual breakdown showing Original Price, Discount Deducted, Final Payable Amount, and Total Savings Highlight.`,
        aiTestBriefFiles: [
          { fileName: 'index.html' },
          { fileName: 'style.css' },
          { fileName: 'script.js' }
        ]
      }
    ]
  },
  {
    name: 'AI Test — Markdown Studio & Documentation Hub',
    testType: 'AI_TEST',
    testTitle: 'AI Test: Content Systems & Markdown Engine',
    durationMinutes: 45,
    passingCriteria: 1,
    instructions: 'Build a high-performance, real-time Markdown editor and documentation manager with live rendering and export tools.',
    questions: [
      {
        title: 'Split-Pane Markdown Editor & Live HTML Previewer',
        difficulty: 'MEDIUM',
        description: `# Split-Pane Markdown Editor & Live HTML Previewer

Build a split-screen Markdown editor with synchronized live HTML preview and document organization.

## Core Requirements:
1. **Dual-Pane Interface**:
   - Left Pane: Textarea/Editor for raw Markdown input with line numbers.
   - Right Pane: Live rendered HTML output with clean GitHub-flavored styling (headings, blockquotes, tables, code blocks, lists).
2. **Formatting Toolbar**:
   - Quick formatting buttons: **Bold**, *Italic*, # Header, > Quote, \`Code\`, [Link], Bullet List, Task Checkbox.
   - Clicking a toolbar button inserts the corresponding markdown syntax around active text selection.
3. **Word & Reading Metrics**:
   - Live metrics bar: Word count, Character count, Estimated reading time (words / 200 wpm).
4. **Document Library & Export**:
   - Sidebar with saved document list (New Document, Rename, Delete).
   - "Export as Markdown (.md)" and "Export as HTML (.html)" download triggers.
   - LocalStorage auto-saving every 2 seconds.`,
        aiTestBriefFiles: [
          { fileName: 'index.html' },
          { fileName: 'style.css' },
          { fileName: 'script.js' }
        ]
      }
    ]
  },
  {
    name: 'AI Test — Data Analytics & Survey Visualization Studio',
    testType: 'AI_TEST',
    testTitle: 'AI Test: Analytics & Interactive Visualizations',
    durationMinutes: 60,
    passingCriteria: 1,
    instructions: 'Create responsive analytics dashboards featuring tabular data manipulation, dynamic polling widgets, and visual charts.',
    questions: [
      {
        title: 'Interactive CSV Data Explorer & Chart Studio',
        difficulty: 'MEDIUM',
        description: `# Interactive CSV Data Explorer & Chart Studio

Build a client-side data exploration suite that parses structured datasets and generates live charts.

## Core Requirements:
1. **Dataset Ingestion & Table View**:
   - Pre-loaded sample dataset (e.g., Sales by Region / Employee Performance) with option to paste or upload custom CSV text.
   - Multi-column sorting (ascending/descending on click).
   - Search filter matching across all columns.
   - Client-side pagination (10, 25, 50 rows per page) with page navigation controls.
2. **Visual Chart Generation**:
   - Render Bar Chart and Pie/Donut Chart visualizations using SVG or HTML5 Canvas based on the filtered table data.
   - Hover tooltips displaying exact values and percentages.
3. **Data Summaries**:
   - KPI metric cards: Total Records, Column Sums, Average, Min, and Max values.`,
        aiTestBriefFiles: [
          { fileName: 'index.html' },
          { fileName: 'style.css' },
          { fileName: 'script.js' }
        ]
      },
      {
        title: 'Live Interactive Poll & Feedback Widget',
        difficulty: 'EASY',
        description: `# Live Interactive Poll & Feedback Widget

Build an engaging, live polling widget with animated result visualizations.

## Core Requirements:
1. **Poll Question & Options**:
   - Support questions with 3 to 5 distinct options (e.g., "What is your favorite modern tech stack?").
   - Radio selection with an active "Submit Vote" state.
2. **Animated Results View**:
   - Once submitted, smoothly transition into the results view.
   - Render animated percentage progress bars for each option.
   - Show exact vote tally and total participant count.
3. **Vote Integrity & Reset**:
   - Use \`localStorage\` to prevent duplicate voting from the same session while providing an "Admin Reset / Revote" option for testing.`,
        aiTestBriefFiles: [
          { fileName: 'index.html' },
          { fileName: 'style.css' },
          { fileName: 'script.js' }
        ]
      }
    ]
  }
];

async function seedAiTestSets() {
  console.log('[Seed AI] Connecting to MongoDB...');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-proctoring';
  await mongoose.connect(mongoUri);
  console.log('[Seed AI] MongoDB connected successfully.');

  let admin = await Admin.findOne({ email: 'superadmin@globussoft.in' });
  if (!admin) {
    admin = await Admin.findOne();
  }
  if (!admin) {
    throw new Error('No Admin account found to associate QuestionSets.');
  }

  console.log(`[Seed AI] Using Admin: ${admin.name} (${admin._id})`);

  for (let i = 0; i < AI_QUESTION_SETS.length; i++) {
    const setData = AI_QUESTION_SETS[i];
    console.log(`\n--------------------------------------------------`);
    console.log(`[Seed AI] Processing Set ${i + 1}/${AI_QUESTION_SETS.length}: "${setData.name}"`);

    // 1. Find or create QuestionSet
    let qSet = await QuestionSet.findOne({ name: setData.name });
    if (!qSet) {
      qSet = new QuestionSet({
        name: setData.name,
        testType: 'AI_TEST',
        createdBy: admin._id,
        questionIds: [],
      });
      await qSet.save();
      console.log(`  + Created QuestionSet: "${qSet.name}" (${qSet._id})`);
    } else {
      qSet.testType = 'AI_TEST';
      await qSet.save();
      console.log(`  * Found existing QuestionSet: "${qSet.name}" (${qSet._id})`);
    }

    // 2. Remove old questions for this set to avoid duplicates, then recreate fresh
    await Question.deleteMany({ questionSetId: qSet._id });
    const questionIds = [];

    for (let qIdx = 0; qIdx < setData.questions.length; qIdx++) {
      const q = setData.questions[qIdx];
      const newQuestion = new Question({
        questionSetId: qSet._id,
        testType: 'AI_TEST',
        title: q.title,
        description: q.description,
        difficulty: q.difficulty,
        inputFormat: 'N/A (AI Web App Project)',
        outputFormat: 'N/A (Live Sandpack Web Application)',
        constraints: 'Modern HTML5, CSS3, JavaScript (ES6+)',
        visibleTestCases: [],
        hiddenTestCases: [],
        aiTestBriefFiles: q.aiTestBriefFiles || [
          { fileName: 'index.html' },
          { fileName: 'style.css' },
          { fileName: 'script.js' }
        ],
      });
      await newQuestion.save();
      questionIds.push(newQuestion._id);
      console.log(`    - Question ${qIdx + 1}: "${newQuestion.title}" (${newQuestion.difficulty}) -> ID: ${newQuestion._id}`);
    }

    qSet.questionIds = questionIds;
    await qSet.save();
    console.log(`  ✓ QuestionSet "${qSet.name}" now contains ${questionIds.length} question(s).`);

    // 3. Create or update corresponding Test in Test collection
    let test = await Test.findOne({ title: setData.testTitle });
    if (!test) {
      test = new Test({
        title: setData.testTitle,
        testType: 'AI_TEST',
        createdBy: admin._id,
        questionSetId: qSet._id,
        durationMinutes: setData.durationMinutes,
        totalQuestions: questionIds.length,
        passingCriteria: setData.passingCriteria,
        instructions: setData.instructions,
        startTestWindowMinutes: 15,
        supportedLanguages: ['javascript', 'react'],
        status: 'LIVE',
      });
      await test.save();
      console.log(`  + Created LIVE Test: "${test.title}" (${test._id}) with ${questionIds.length} question(s)`);
    } else {
      test.testType = 'AI_TEST';
      test.questionSetId = qSet._id;
      test.totalQuestions = questionIds.length;
      test.passingCriteria = setData.passingCriteria;
      test.durationMinutes = setData.durationMinutes;
      test.instructions = setData.instructions;
      test.status = 'LIVE';
      await test.save();
      console.log(`  * Updated LIVE Test: "${test.title}" (${test._id}) to ${questionIds.length} question(s)`);
    }
  }

  console.log('\n==================================================');
  console.log('[Seed AI] COMPLETE! Summary of All AI_TEST Sets in Database:');
  const allAiSets = await QuestionSet.find({ testType: 'AI_TEST' }).populate('questionIds').lean();
  for (const s of allAiSets) {
    console.log(`\n📁 QuestionSet: "${s.name}" (${s.testType})`);
    console.log(`   ID: ${s._id} | Questions: ${s.questionIds?.length || 0}`);
    (s.questionIds || []).forEach((q, idx) => {
      console.log(`     ${idx + 1}. ${q.title} [${q.difficulty}] - ${q.aiTestBriefFiles?.map(f => f.fileName).join(', ')}`);
    });
  }

  const allAiTests = await Test.find({ testType: 'AI_TEST' }).populate('questionSetId').lean();
  console.log(`\n🎯 Total AI Tests Configured: ${allAiTests.length}`);
  for (const t of allAiTests) {
    console.log(` - Test: "${t.title}" | Status: ${t.status} | Total Qs: ${t.totalQuestions} | Set: "${t.questionSetId?.name}"`);
  }

  await mongoose.disconnect();
  console.log('\n[Seed AI] Database disconnected cleanly.');
}

seedAiTestSets().catch((err) => {
  console.error('[Seed AI] Error:', err);
  process.exit(1);
});
