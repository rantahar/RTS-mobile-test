// Construction: placement validity, the worker build command, and the
// barracks -> soldier training chain (registry data).
const DT = 1 / 60;

function ticks(g, n) {
  for (let i = 0; i < n; i++) g.Sim.tick(DT);
}

exports.tests = [

  ['canPlace: bounds, structures, and standing units all block', ({ loadGame, assert }) => {
    const g = loadGame();
    g.Entities.spawnStructure('hq', 15, 18);
    assert(g.Entities.canPlace('barracks', 25, 25), 'open ground rejected');
    assert(!g.Entities.canPlace('barracks', 14, 17), 'overlap with HQ accepted');
    assert(!g.Entities.canPlace('barracks', -1, 5), 'out of bounds accepted');
    assert(!g.Entities.canPlace('barracks', g.CONFIG.MAP_W - 2, g.CONFIG.MAP_H - 2),
      'footprint past map edge accepted');
    g.Entities.spawnUnit('worker', 26.5 * 32, 26.5 * 32); // inside the candidate footprint
    assert(!g.Entities.canPlace('barracks', 25, 25), 'unit inside footprint ignored');
  }],

  ['a construction site blocks the map immediately', ({ loadGame, assert }) => {
    const g = loadGame();
    const s = g.Entities.spawnStructure('barracks', 20, 20, 0, true);
    assert(s.underConstruction, 'site not flagged under construction');
    const inside = g.Hex.fromWorld(21.5 * 32, 21.5 * 32);
    assert(!g.Hex.structFree(inside.col, inside.row), 'site footprint not blocked for pathing');
  }],

  ['worker orderAt a friendly site produces a build command', ({ loadGame, assert }) => {
    const g = loadGame();
    const site = g.Entities.spawnStructure('barracks', 20, 20, 0, true);
    const done = g.Entities.spawnStructure('barracks', 30, 30, 0);
    const u = g.Entities.spawnUnit('worker', 25 * 32, 21 * 32);
    const cmd = u.def.orderAt(u, site);
    assert(cmd && cmd.type === 'build' && cmd.siteId === site.id,
      'tap on a site should order construction');
    const cmd2 = u.def.orderAt(u, done);
    assert(cmd2 && cmd2.type === 'moveRect', 'finished building should be a go-to');
  }],

  ['worker walks to the site, builds it, and the hook fires', ({ loadGame, assert }) => {
    const g = loadGame();
    let completed = null;
    g.Sim.hooks.completed = (s) => { completed = s; };
    const site = g.Entities.spawnStructure('barracks', 20, 20, 0, true);
    const u = g.Entities.spawnUnit('worker', 28 * 32, 21 * 32);
    u.cmd = u.def.orderAt(u, site);
    ticks(g, 30);
    assert(site.progress === 0 || g.Sim.distToRect(u, site) <= g.Sim.ADJACENT_PX,
      'progress advanced before the worker was adjacent');
    ticks(g, 60 * (g.Types.barracks.buildTime + 8)); // travel + build margin
    assert(!site.underConstruction, 'site never completed');
    assert(completed === site, 'completed hook did not fire with the site');
    assert(!u.cmd, 'builder did not stop after completion');
  }],

  ['two builders finish roughly twice as fast', ({ loadGame, assert }) => {
    const g = loadGame();
    const site = g.Entities.spawnStructure('barracks', 20, 20, 0, true);
    const a = g.Entities.spawnUnit('worker', 25 * 32, 21 * 32);
    const b = g.Entities.spawnUnit('worker', 25 * 32, 23 * 32);
    a.cmd = { type: 'build', siteId: site.id };
    b.cmd = { type: 'build', siteId: site.id };
    let t = 0;
    for (; t < 60 * 20 && site.underConstruction; t++) g.Sim.tick(DT);
    assert(!site.underConstruction, 'pair never finished the site');
    // buildTime is 10 worker-seconds; two adjacent workers should land well
    // under 8s of wall clock even counting the short walk.
    assert(t / 60 < 8, `two builders took ${(t / 60).toFixed(1)}s`);
  }],

  ['barracks trains soldiers (registry data)', ({ loadGame, assert }) => {
    const g = loadGame();
    assert(g.Types.barracks.trains === 'soldier', 'barracks should train soldiers');
    assert(g.Types.soldier.cost === g.CONFIG.SOLDIER_COST, 'soldier cost mismatch');
    assert(g.Types.worker.builds.includes('barracks'), 'worker cannot build barracks');
    const s = g.Entities.spawnUnit('soldier', 10 * 32, 10 * 32);
    assert(s && s.def.speed === g.CONFIG.SOLDIER_SPEED, 'soldier speed mismatch');
    s.cmd = { type: 'move', col: 20, row: 20 };
    ticks(g, 60 * 15);
    assert(!s.cmd && s.hex.col === 20 && s.hex.row === 20, 'soldier cannot walk');
  }],
];
