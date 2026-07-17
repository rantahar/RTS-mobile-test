// Seeded map generation: a generated map spawns a playable world (base, crew,
// enemy, ore, rendered rock terrain) and workers can path over the terrain to
// mine — proving the generator, terrain-aware pathfinding, and connectivity
// all work together in the real app.
const { launchGame, assert, distinct } = require('./helpers');

exports.run = async () => {
  const g = await launchGame({ seed: 1337 });
  const { page } = g;

  const world = await page.evaluate(() => {
    const own = Entities.list.filter(e => e.owner === 0);
    const h = own.find(e => e.def.depot);
    const nodes = Entities.list.filter(e => e.type === 'node');
    nodes.sort((a, b) => (a.x - h.x) ** 2 + (a.y - h.y) ** 2 - ((b.x - h.x) ** 2 + (b.y - h.y) ** 2));
    return {
      hasTerrain: GameMap.hasTerrain,
      rockTiles: (() => { let n = 0; for (const v of GameMap.terrain) if (v) n++; return n; })(),
      rockDrawn: !!document.querySelector('#layer-grid path.rock'),
      base: !!h, hq: { x: h.x, y: h.y },
      workers: Entities.list.filter(e => e.type === 'worker' && e.owner === 0).length,
      enemy: Entities.list.some(e => e.type === 'barracks' && e.owner === 1),
      nodes: nodes.length,
      node: { x: nodes[0].x, y: nodes[0].y },
    };
  });

  assert(world.hasTerrain && world.rockTiles > 50, `no terrain generated (${world.rockTiles} tiles)`);
  assert(world.rockDrawn, 'rock terrain not rendered');
  assert(world.base, 'no player base at a generated start');
  assert(world.workers === 3, `expected 3 workers, got ${world.workers}`);
  assert(world.enemy, 'no enemy camp at the second start');
  assert(world.nodes >= 2, `expected scattered ore veins, got ${world.nodes}`);

  // Zoom out so the base and its ore vein are both on the small viewport.
  await page.evaluate(() => {
    const v = document.getElementById('view');
    Camera.setZoom(0.35, v.clientWidth, v.clientHeight);
  });
  await g.center(world.hq.x, world.hq.y);

  // Box-select the crew and send them mining across the terrain.
  const ws = await g.units();
  const own = ws.filter(u => u.type === 'worker');
  const xs = own.map(u => u.x), ys = own.map(u => u.y);
  await g.dragWorld(Math.min(...xs) - 30, Math.min(...ys) - 30,
                    Math.max(...xs) + 30, Math.max(...ys) + 30);
  assert((await g.selInfo()).includes('Worker'), 'crew not selected: ' + await g.selInfo());

  const before = await page.evaluate(() => Game.ore);
  await g.tapWorld(world.node.x, world.node.y);
  await page.waitForTimeout(16000);
  const after = await page.evaluate(() => Game.ore);
  assert(after - before >= 5, `workers never mined over the terrain (gained ${after - before})`);

  const miners = await g.units();
  assert(distinct(miners.filter(u => u.type === 'worker').map(u => u.hex)), 'miners share a hex');

  assert(g.errors.length === 0, 'console errors: ' + g.errors.join(' | '));
  await g.browser.close();
};
