// Selection + command taps: tap-select when empty, command when not,
// box select, stop, deselect (button and long press).
const { launchGame, assert, distinct } = require('./helpers');

exports.run = async () => {
  const g = await launchGame();
  const { page } = g;
  const hq = await page.evaluate(() => {
    const h = Entities.list.find(e => e.type === 'hq'); return { x: h.x, y: h.y };
  });
  // Zoom out so the whole outpost sits comfortably on the small viewport.
  await page.evaluate(() => {
    const v = document.getElementById('view');
    Camera.setZoom(0.4, v.clientWidth, v.clientHeight);
  });
  await g.center(hq.x, hq.y); // put the base on-screen for world->page mapping

  // Tap worker -> selected (shape hit-test).
  let ws = await g.units();
  await g.tapWorld(ws[0].x, ws[0].y);
  assert((await g.selInfo()).includes('Worker'), 'tap did not select worker');

  // With selection, tapping the base is a COMMAND (go to), not a select switch.
  await g.tapWorld(hq.x, hq.y);
  assert((await g.selInfo()).includes('Worker'), 'selection changed on command tap');
  // The worker is close to the base, so poll quickly to catch the command
  // before it arrives and clears itself.
  let issued = false;
  for (let i = 0; i < 8 && !issued; i++) {
    await page.waitForTimeout(40);
    issued = (await g.units()).some(u => u.cmd);
  }
  assert(issued, 'command tap did not issue a command');

  // Stop halts, keeps selection.
  await page.click('#btn-stop');
  assert(!(await g.units()).some(u => u.cmd), 'stop did not halt');
  assert((await g.selInfo()).includes('Worker'), 'stop cleared selection');

  // Deselect button.
  await page.click('#btn-deselect');
  assert((await g.selInfo()) === '', 'deselect button failed');

  // Box select all three workers (box derived from their live positions).
  ws = await g.units();
  const xs = ws.map(u => u.x), ys = ws.map(u => u.y);
  await g.dragWorld(Math.min(...xs) - 30, Math.min(...ys) - 30,
                    Math.max(...xs) + 30, Math.max(...ys) + 30);
  assert((await g.selInfo()).includes('×3'), 'box select missed workers: ' + await g.selInfo());

  // Ground tap -> group move to distinct hexes.
  await g.tapWorld(hq.x - 140, hq.y - 230); // open ground up-left of base
  await page.waitForTimeout(7000);
  const parked = await g.units();
  assert(parked.every(u => !u.cmd), 'group move did not finish');
  assert(distinct(parked.map(u => u.hex)), 'units share a hex after group move');

  // Long press -> deselect.
  const p = await g.toPage(hq.x, hq.y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  assert((await g.selInfo()) === '', 'long press did not deselect');

  // Empty selection -> tap selects again.
  const one = parked[0];
  await g.tapWorld(one.x, one.y);
  assert((await g.selInfo()).includes('Worker'), 'tap-select after deselect failed');

  assert(g.errors.length === 0, 'console errors: ' + g.errors.join(' | '));
  await g.browser.close();
};
