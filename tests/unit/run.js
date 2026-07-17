// Headless unit tests. Plain node, no dependencies:
//   node tests/unit/run.js
//
// loadGame() evaluates the DOM-free model modules (config through sim) in a
// fresh vm context and returns their globals, so every test starts from a
// clean world. View/render/input/actions/game are DOM-bound and are covered
// by the e2e suite instead.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
// Keep in sync with the <script> order in index.html.
const FILES = ['config.js', 'camera.js', 'map.js', 'hex.js', 'path.js',
               'types.js', 'entities.js', 'selection.js', 'sim.js'];

function loadGame() {
  let src = FILES.map(f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n;\n');
  src += '\n;__exports({ CONFIG, Camera, GameMap, Hex, Path, Types, Entities, Selection, Sim });';
  let g = null;
  const ctx = vm.createContext({ __exports: (o) => { g = o; }, console });
  vm.runInContext(src, ctx, { filename: 'game-concat.js' });
  g.Hex.init();
  g.Sim.init();
  return g;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function close(a, b, eps, msg) {
  if (Math.abs(a - b) > eps) throw new Error(`${msg} (${a} vs ${b})`);
}

// ---- run all test files ----
(async () => {
  const files = fs.readdirSync(__dirname).filter(f => f.startsWith('test-')).sort();
  let pass = 0, fail = 0;
  for (const f of files) {
    const tests = require(path.join(__dirname, f)).tests;
    for (const [name, fn] of tests) {
      try {
        fn({ loadGame, assert, close });
        pass++;
      } catch (e) {
        fail++;
        console.error(`FAIL ${f} :: ${name}\n     ${e.message}`);
      }
    }
  }
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
