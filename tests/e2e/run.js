// Runs every tests/e2e/test-*.js in order. Plain node, no framework:
//   node tests/e2e/run.js
const fs = require('fs');
const path = require('path');

(async () => {
  const files = fs.readdirSync(__dirname).filter(f => f.startsWith('test-')).sort();
  let failed = 0;
  for (const f of files) {
    const t0 = Date.now();
    try {
      await require(path.join(__dirname, f)).run();
      console.log(`PASS ${f} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${f}: ${e.message}`);
    }
  }
  console.log(failed ? `${failed} test file(s) FAILED` : 'all e2e tests passed');
  process.exit(failed ? 1 : 0);
})();
