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

  // Halt the miners so ore is stable while we assert training payments.
  await page.evaluate(() => Entities.list
    .filter(e => e.type === 'worker').forEach(w => Sim.stopUnit(w)));

  // Training: queued and timed. The button only exists while an HQ is selected.
  const cost = await page.evaluate(() => Types.worker.cost);
  const tt = await page.evaluate(() => Types.worker.trainTime);
  await page.evaluate(() => { Game.ore = 100; Game.updateOre(); });
  await page.click('#btn-deselect');
  assert(await page.evaluate(() => !document.getElementById('btn-train-worker')),
    'train button shown with no HQ selected');
  await g.tapWorld(560, 656); // HQ
  assert(!await page.evaluate(() => document.getElementById('btn-train-worker').disabled),
    'train disabled with HQ selected and ore');
  await page.click('#btn-train-worker');
  await page.click('#btn-train-worker');

  // Paid up front and queued — but NOT spawned instantly.
  const queued = await page.evaluate(() => ({
    ore: Game.ore,
    n: Entities.list.filter(e => e.type === 'worker').length,
    queue: (Entities.list.find(e => e.type === 'hq' && e.owner === 0).queue || []).length,
  }));
  assert(queued.queue === 2, `expected 2 queued, got ${queued.queue}`);
  assert(queued.n === 3, `training should not be instant, got ${queued.n} workers`);
  assert(queued.ore === 100 - 2 * cost, `expected ${100 - 2 * cost} ore, got ${queued.ore}`);

  // Let the queue train out over time.
  await page.waitForTimeout((2 * tt + 3) * 1000);
  const after = await page.evaluate(() => ({
    ore: Game.ore,
    n: Entities.list.filter(e => e.type === 'worker').length,
    queue: (Entities.list.find(e => e.type === 'hq' && e.owner === 0).queue || []).length,
  }));
  assert(after.n === 5, `expected 5 workers after training 2, got ${after.n}`);
  assert(after.queue === 0, `queue not drained, got ${after.queue}`);
  assert(after.ore === 100 - 2 * cost, `ore changed after enqueue (${after.ore})`);
  const all = await g.units();
  assert(distinct(all.map(u => u.hex)), 'spawned workers share a hex');

  assert(g.errors.length === 0, 'console errors: ' + g.errors.join(' | '));
  await g.browser.close();
};
