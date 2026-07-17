// Economy: multi-worker mining loop banks ore; training spends it.
const { launchGame, assert, distinct } = require('./helpers');

exports.run = async () => {
  const g = await launchGame();
  const { page } = g;
  const world = await page.evaluate(() => {
    const h = Entities.list.find(e => e.type === 'hq');
    // Nearest ore vein to the base, to keep mining trips short.
    const nodes = Entities.list.filter(e => e.type === 'node');
    nodes.sort((a, b) => (a.x - h.x) ** 2 + (a.y - h.y) ** 2 - ((b.x - h.x) ** 2 + (b.y - h.y) ** 2));
    return { hq: { x: h.x, y: h.y }, node: { x: nodes[0].x, y: nodes[0].y } };
  });
  await page.evaluate(() => {
    const v = document.getElementById('view');
    Camera.setZoom(0.4, v.clientWidth, v.clientHeight);
  });
  await g.center(world.hq.x, world.hq.y);

  // Select all workers, send them mining.
  let ws = await g.units();
  let xs = ws.map(u => u.x), ys = ws.map(u => u.y);
  await g.dragWorld(Math.min(...xs) - 30, Math.min(...ys) - 30,
                    Math.max(...xs) + 30, Math.max(...ys) + 30);
  assert((await g.selInfo()).includes('×3'), 'box select failed');
  const before = await page.evaluate(() => Game.ore);
  await g.tapWorld(world.node.x, world.node.y); // resource node
  await page.waitForTimeout(16000);

  const ore = await page.evaluate(() => Game.ore);
  assert(ore - before >= 10, `expected >= 10 ore mined in 16s, gained ${ore - before}`);
  const miners = await g.units();
  assert(distinct(miners.map(u => u.hex)), 'miners share a hex');

  // Training: the button only exists while the base is selected (dynamic bar).
  await page.evaluate(() => { Game.ore = 25; Game.updateOre(); });
  await page.click('#btn-deselect');
  assert(await page.evaluate(() => !document.getElementById('btn-train-worker')),
    'train button shown with no base selected');
  await g.tapWorld(world.hq.x, world.hq.y); // base
  assert(!await page.evaluate(() => document.getElementById('btn-train-worker').disabled),
    'train disabled with base selected and ore');
  await page.click('#btn-train-worker');
  await page.click('#btn-train-worker');
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
