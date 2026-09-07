const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function runAll() {
  const dir = __dirname;
  const files = fs.readdirSync(dir)
    .filter((f) => f.startsWith('test_') && f.endsWith('.js'))
    .sort();

  console.log(`\n========================================================================`);
  console.log(`EXECUTING COMPLETE QA REGRESSION SUITE: ${files.length} TEST SCRIPTS`);
  console.log(`========================================================================\n`);

  let passCount = 0;
  let failCount = 0;
  const failedSuites = [];

  for (const file of files) {
    process.stdout.write(`▶ Running ${file.padEnd(55)} ... `);
    const filePath = path.join(dir, file);

    const startTime = Date.now();
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [filePath], {
        cwd: path.resolve(__dirname, '../../..'),
        env: process.env,
      });

      let output = '';
      child.stdout.on('data', (d) => { output += d.toString(); });
      child.stderr.on('data', (d) => { output += d.toString(); });

      child.on('close', (code) => {
        resolve({ code, output, duration: Date.now() - startTime });
      });
    });

    if (result.code === 0) {
      console.log(`✓ PASS (${result.duration}ms)`);
      passCount++;
    } else {
      console.log(`✗ FAIL (exit code ${result.code}, ${result.duration}ms)`);
      failCount++;
      failedSuites.push({ file, output: result.output });
    }
  }

  console.log(`\n========================================================================`);
  console.log(`QA AUDIT RESULTS SUMMARY: ${passCount} / ${files.length} SUITES PASSED (${Math.round((passCount / files.length) * 100)}%)`);
  console.log(`========================================================================\n`);

  if (failedSuites.length > 0) {
    console.log(`FAILED SUITES DETAIL:\n`);
    for (const fail of failedSuites) {
      console.log(`--- [FAIL] ${fail.file} ---`);
      console.log(fail.output);
      console.log(`------------------------------------------------------------------------\n`);
    }
    process.exit(1);
  } else {
    console.log(`🎉 ALL ${passCount} QA TEST SUITES COMPLETED WITH ZERO FAILURES!\n`);
    process.exit(0);
  }
}

runAll().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
