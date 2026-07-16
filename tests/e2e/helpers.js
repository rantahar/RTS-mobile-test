// Shared helpers for the Playwright end-to-end tests.
// No test framework — plain async functions + assert, run by run.js.
const fs = require('fs');
const path = require('path');

function requirePlaywright() {
  try { return require('playwright'); }
  catch { return require('/opt/node22/lib/node_modules/playwright'); }
}

async function launchGame({ width = 390, height = 844 } = {}) {
  const { chromium } = requirePlaywright();
  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    // Fall back to a preinstalled Chromium (e.g. /opt/pw-browsers in CI boxes).
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    const dir = fs.readdirSync(base).find(d => d.startsWith('chromium-'));
    browser = await chromium.launch({
      executablePath: path.join(base, dir, 'chrome-linux', 'chrome'),
    });
  }
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', '..', 'index.html'));
  await page.waitForTimeout(300);

  // World coords -> page coords (for mouse input).
  const toPage = (wx, wy) => page.evaluate(([wx, wy]) => {
    const r = document.getElementById('view').getBoundingClientRect();
    return { x: (wx - Camera.x) * Camera.zoom + r.left, y: (wy - Camera.y) * Camera.zoom + r.top };
  }, [wx, wy]);

  const tapWorld = async (wx, wy) => {
    const p = await toPage(wx, wy);
    await page.mouse.click(p.x, p.y);
  };

  const dragWorld = async (ax, ay, bx, by) => {
    const a = await toPage(ax, ay), b = await toPage(bx, by);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
  };

  // Point the camera at a world position (tests were written against a
  // fixed framing; the game itself starts centered on the player's HQ).
  const center = (wx, wy) => page.evaluate(([wx, wy]) => {
    const v = document.getElementById('view');
    Camera.centerOnWorld(wx, wy, v.clientWidth, v.clientHeight);
    Camera.apply(document.getElementById('world'));
  }, [wx, wy]);

  const selInfo = () => page.evaluate(() => document.getElementById('selinfo').textContent);
  const units = () => page.evaluate(() => Entities.list.filter(e => e.kind === 'unit')
    .map(e => ({ x: e.x, y: e.y, hex: e.curHex, type: e.type, cmd: e.cmd && e.cmd.type })));

  return { browser, page, errors, toPage, tapWorld, dragWorld, center, selInfo, units };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function distinct(arr) {
  return new Set(arr).size === arr.length;
}

module.exports = { launchGame, assert, distinct };
