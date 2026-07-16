// Selection + command taps: tap-select when empty, command when not,
// box select, stop, deselect (button and long press).
const { launchGame, assert, distinct } = require('./helpers');

exports.run = async () => {
  const g = await launchGame();
  const { page } = g;

  // Tap worker -> selected (shape hit-test).
  await g.tapWorld(720, 679);
  assert((await g.selInfo()).includes('Worker'), 'tap did not select worker');

  // With selection, tapping the HQ is a COMMAND (go to), not a select switch.
  await g.tapWorld(560, 656);
  assert((await g.selInfo()).includes('Worker'), 'selection changed on command tap');
  await page.waitForTimeout(300);
  const moving = await g.units();
  assert(moving[0].cmd, 'command tap did not issue a command');

  // Stop halts, keeps selection.
  await page.click('#btn-stop');
  assert(!(await g.units())[0].cmd, 'stop did not halt');
  assert((await g.selInfo()).includes('Worker'), 'stop cleared selection');

  // Deselect button.
  await page.click('#btn-deselect');
  assert((await g.selInfo()) === '', 'deselect button failed');

  // Box select all three workers.
  await g.dragWorld(640, 600, 830, 840);
  assert((await g.selInfo()).includes('×3'), 'box select missed workers: ' + await g.selInfo());

  // Ground tap -> group move to distinct hexes.
  await g.tapWorld(560, 420);
  await page.waitForTimeout(5000);
  const parked = await g.units();
  assert(parked.every(u => !u.cmd), 'group move did not finish');
  assert(distinct(parked.map(u => u.hex)), 'units share a hex after group move');

  // Long press -> deselect.
  const p = await g.toPage(700, 900);
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
