// Simulation: headless ticking, movement, collisions, mining, invariants.
const DT = 1 / 60;

function ticks(g, n) {
  for (let i = 0; i < n; i++) g.Sim.tick(DT);
}

// Every unit owns its current hex; nobody owns more than 2 hexes; no hex is
// owned by a dead id.
function checkOccupancyInvariant(g, assert) {
  const owned = new Map();
  for (const [idx, id] of g.GameMap.unitOcc) {
    owned.set(id, (owned.get(id) || 0) + 1);
    assert(g.Entities.byId.has(id), `hex owned by unknown unit ${id}`);
  }
  for (const e of g.Entities.list) {
    if (e.kind !== 'unit') continue;
    assert(g.GameMap.unitOcc.get(e.curHex) === e.id, `unit ${e.id} does not own its hex`);
    assert((owned.get(e.id) || 0) <= 2, `unit ${e.id} owns ${owned.get(e.id)} hexes`);
  }
}

exports.tests = [

  ['unit walks to a destination hex', ({ loadGame, assert }) => {
    const g = loadGame();
    const u = g.Entities.spawnUnit('worker', 10 * 32, 10 * 32);
    const dest = { col: 20, row: 25 };
    u.cmd = { type: 'move', col: dest.col, row: dest.row };
    ticks(g, 60 * 20);
    assert(!u.cmd, 'move never completed');
    assert(u.hex.col === dest.col && u.hex.row === dest.row,
      `ended at ${u.hex.col},${u.hex.row} instead of ${dest.col},${dest.row}`);
  }],

  ['two crossing units never share a hex and both arrive', ({ loadGame, assert }) => {
    const g = loadGame();
    const a = g.Entities.spawnUnit('worker', 10 * 32, 20 * 32);
    const b = g.Entities.spawnUnit('worker', 18 * 32, 20 * 32);
    const ha = g.Hex.fromWorld(18 * 32, 20 * 32);
    const hb = g.Hex.fromWorld(10 * 32, 20 * 32);
    a.cmd = { type: 'move', col: ha.col, row: ha.row };
    b.cmd = { type: 'move', col: hb.col, row: hb.row };
    for (let i = 0; i < 60 * 30; i++) {
      g.Sim.tick(DT);
      assert(a.curHex !== b.curHex, 'units share a hex mid-crossing');
      if (!a.cmd && !b.cmd) break;
    }
    assert(!a.cmd && !b.cmd, 'crossing units never both arrived');
    checkOccupancyInvariant(g, assert);
  }],

  ['blocked unit repaths only the fine leg (coarse survives)', ({ loadGame, assert }) => {
    const g = loadGame();
    const u = g.Entities.spawnUnit('worker', 8 * 32, 20 * 32);
    // Wall of parked units across the straight line, mid-trip.
    for (let i = -1; i <= 1; i++) {
      const h = g.Hex.fromWorld(16 * 32, (20 + i) * 32);
      g.Entities.spawnUnit('worker', ...(() => { const c = g.Hex.centerOf(h.col, h.row); return [c.x, c.y]; })());
    }
    const dest = g.Hex.fromWorld(38 * 32, 20 * 32); // long trip -> multiple coarse pts
    u.cmd = { type: 'move', col: dest.col, row: dest.row };
    ticks(g, 3); // let it plan
    assert(u.coarse && u.coarse.length >= 1, 'no coarse plan');
    let grew = false, prev = Infinity;
    for (let i = 0; i < 60 * 40 && u.cmd; i++) {
      g.Sim.tick(DT);
      if (u.coarse) {
        if (u.coarse.length > prev) grew = true;
        prev = u.coarse.length;
      }
    }
    assert(!u.cmd, 'never arrived past the wall');
    assert(!grew, 'coarse plan was rebuilt mid-trip (full repath happened)');
    checkOccupancyInvariant(g, assert);
  }],

  ['mining loop deposits through the hook', ({ loadGame, assert }) => {
    const g = loadGame();
    let ore = 0;
    g.Sim.hooks.deposit = (n) => { ore += n; };
    const hq = g.Entities.spawnStructure('hq', 15, 18);
    const node = g.Entities.spawnStructure('node', 24, 14);
    const u = g.Entities.spawnUnit('worker', 22 * 32, 21 * 32);
    u.cmd = u.def.orderAt(u, node);
    assert(u.cmd && u.cmd.type === 'mine', 'orderAt did not produce a mine command');
    assert(u.cmd.hqId === hq.id, 'mine command missed the depot');
    ticks(g, 60 * 30);
    assert(ore >= 10, `expected at least 2 deposits in 30s, got ${ore}`);
    assert(u.cmd && u.cmd.type === 'mine', 'mining loop stopped by itself');
  }],

  ['stop clears command, route, and reservations', ({ loadGame, assert }) => {
    const g = loadGame();
    const u = g.Entities.spawnUnit('worker', 10 * 32, 10 * 32);
    u.cmd = { type: 'move', col: 30, row: 30 };
    ticks(g, 30);
    g.Sim.stopUnit(u);
    assert(!u.cmd && !u.route && !u.coarse, 'stop left state behind');
    checkOccupancyInvariant(g, assert);
  }],

  ['removing a unit releases every hex it owned', ({ loadGame, assert }) => {
    const g = loadGame();
    const u = g.Entities.spawnUnit('worker', 10 * 32, 10 * 32);
    u.cmd = { type: 'move', col: 30, row: 30 };
    ticks(g, 30); // mid-move: owns current + reserved hex
    g.Entities.removeUnit(u);
    for (const [, id] of g.GameMap.unitOcc) {
      assert(id !== u.id, 'removed unit still owns a hex');
    }
    assert(!g.Entities.byId.has(u.id), 'removed unit still registered');
  }],

  ['removing a structure frees its footprint for pathing', ({ loadGame, assert }) => {
    const g = loadGame();
    const s = g.Entities.spawnStructure('hq', 15, 18);
    const inside = g.Hex.fromWorld(17.5 * 32, 20.5 * 32);
    assert(!g.Hex.structFree(inside.col, inside.row), 'footprint not blocked');
    g.Entities.removeStructure(s);
    assert(g.Hex.structFree(inside.col, inside.row), 'footprint still blocked after removal');
  }],

  ['occupancy invariant holds through a crowded random workout', ({ loadGame, assert }) => {
    const g = loadGame();
    g.Entities.spawnStructure('hq', 15, 18);
    g.Entities.spawnStructure('node', 24, 14);
    const units = [];
    for (let i = 0; i < 8; i++) {
      units.push(g.Entities.spawnUnit('worker', (8 + i * 3) * 32, 28 * 32));
    }
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let round = 0; round < 6; round++) {
      for (const u of units) {
        g.Sim.clearPath(u);
        u.cmd = { type: 'move',
          col: 2 + Math.floor(rnd() * 38), row: 2 + Math.floor(rnd() * 40) };
      }
      for (let i = 0; i < 60 * 5; i++) {
        g.Sim.tick(DT);
        if (i % 60 === 0) checkOccupancyInvariant(g, assert);
      }
      // No two units on the same hex, ever.
      const hexes = units.map(u => u.curHex);
      assert(new Set(hexes).size === hexes.length, 'two units share a hex');
    }
  }],
];
