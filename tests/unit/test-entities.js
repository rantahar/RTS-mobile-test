// Entity registry: hit-testing, box selection, selection model.
exports.tests = [

  ['tap hit-test: units beat structures, slop works', ({ loadGame, assert }) => {
    const g = loadGame();
    const s = g.Entities.spawnStructure('hq', 15, 18);
    const u = g.Entities.spawnUnit('worker', 21 * 32, 20 * 32); // just right of HQ
    // Dead-on the worker.
    assert(g.Entities.at(u.x, u.y, 0) === u, 'direct hit missed the unit');
    // Within slop of the worker edge.
    assert(g.Entities.at(u.x + u.r + 5, u.y, 8) === u, 'slop hit missed the unit');
    // Inside the structure.
    assert(g.Entities.at(s.x, s.y, 0) === s, 'structure hit failed');
    // Empty ground.
    assert(g.Entities.at(5 * 32, 5 * 32, 8) === null, 'phantom hit on empty ground');
  }],

  ['box select prefers units, falls back to structures', ({ loadGame, assert }) => {
    const g = loadGame();
    const s = g.Entities.spawnStructure('hq', 15, 18);
    const u1 = g.Entities.spawnUnit('worker', 22 * 32, 21 * 32);
    const u2 = g.Entities.spawnUnit('worker', 23 * 32, 22 * 32);
    // Box over everything -> units only.
    const both = g.Entities.inRect(14 * 32, 17 * 32, 25 * 32, 24 * 32);
    assert(both.length === 2 && both.every(e => e.kind === 'unit'),
      'box over units+structure should select the units');
    // Box over just the structure -> the structure.
    const only = g.Entities.inRect(15.5 * 32, 18.5 * 32, 16.5 * 32, 19.5 * 32);
    assert(only.length === 1 && only[0] === s, 'structure-only box failed');
  }],

  ['selection set + onChange notifications', ({ loadGame, assert }) => {
    const g = loadGame();
    const u = g.Entities.spawnUnit('worker', 10 * 32, 10 * 32);
    let notified = 0;
    g.Selection.onChange = () => notified++;
    g.Selection.setTo([u]);
    assert(g.Selection.ids.has(u.id), 'setTo failed');
    assert(notified === 1, `expected 1 notification, got ${notified}`);
    g.Selection.clear();
    assert(notified === 2, 'clear did not notify');
    g.Selection.clear(); // already empty
    assert(notified === 2, 'empty clear should not notify');
    g.Selection.setTo([u]);
    g.Entities.removeUnit(u);
    assert(!g.Selection.ids.has(u.id), 'removed entity still selected');
  }],

  ['training data comes from the type registry', ({ loadGame, assert }) => {
    const g = loadGame();
    assert(g.Types.hq.trains === 'worker', 'hq should train workers');
    assert(g.Types.worker.cost === g.CONFIG.WORKER_COST, 'worker cost mismatch');
    assert(g.Types.node.neutral, 'node should be neutral');
    const n = g.Entities.spawnStructure('node', 24, 14);
    assert(n.owner === null, 'neutral structure got an owner');
    const u = g.Entities.spawnUnit('worker', 10 * 32, 10 * 32, 1);
    assert(u.owner === 1, 'unit owner not stored');
  }],
];
