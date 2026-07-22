// Economy: multi-worker mining loop banks ore; training spends it.
const { launchGame, assert, distinct } = require('./helpers');

exports.run = async () => {
  const g = await launchGame();
  const { page } = g;
  await g.center(672, 672); // the framing the coordinates below assume

  // Select all workers, send them mining.
  await g.dragWorld(640, 600, 830, 840);
  assert((await g.selInfo()).includes('×3'), 'box select failed');
  await g.tapWorld(800, 480); // resource node
  await page.waitForTimeout(12000);

  const ore = await page.evaluate(() => Game.ore);
  assert(ore >= 20, `expected >= 20 ore after 12s of mining, got ${ore}`);
  const miners = await g.units();
  assert(distinct(miners.map(u => u.hex)), 'miners share a hex');

  // Training: the button only exists while an HQ is selected (dynamic bar).
  // Halt the miners first so deposits don't drift the ore count mid-check.
  await page.evaluate(() => {
    for (const e of Entities.list) if (e.kind === 'unit') Sim.stopUnit(e);
    Game.ore = 25; Game.updateOre();
  });
  await page.click('#btn-deselect');
  assert(await page.evaluate(() => !document.getElementById('btn-train-worker')),
    'train button shown with no HQ selected');
  await g.tapWorld(560, 656); // HQ
  assert(!await page.evaluate(() => document.getElementById('btn-train-worker').disabled),
    'train disabled with HQ selected and ore');
  await page.evaluate(() => { Types.worker.trainTime = 0.3; }); // fast production
  await page.click('#btn-train-worker');
  await page.click('#btn-train-worker');
  const queued = await page.evaluate(() =>
    Entities.list.find(e => e.type === 'hq').queue.length);
  assert(queued === 2, `expected 2 queued workers, got ${queued}`);
  await page.waitForTimeout(1000); // both produce
  const after = await page.evaluate(() => ({
    ore: Game.ore,
    n: Entities.list.filter(e => e.type === 'worker').length,
    disabled: document.getElementById('btn-train-worker').disabled,
  }));
  assert(after.n === 5, `expected 5 workers after training 2, got ${after.n}`);
  assert(after.ore === 5, `expected 5 ore left, got ${after.ore}`);
  assert(after.disabled, 'train still enabled below cost');
  const all = await g.units();
  assert(distinct(all.map(u => u.hex)), 'spawned workers share a hex');

  assert(g.errors.length === 0, 'console errors: ' + g.errors.join(' | '));
  await g.browser.close();
};
