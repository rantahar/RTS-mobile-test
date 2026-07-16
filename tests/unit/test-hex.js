// Hex lattice: geometry, registration, occupancy queries.
exports.tests = [

  ['fromWorld(centerOf(h)) is the identity for every hex', ({ loadGame, assert }) => {
    const { Hex } = loadGame();
    for (let row = 0; row < Hex.rows; row++) {
      for (let col = 0; col < Hex.cols(row); col++) {
        const c = Hex.centerOf(col, row);
        const h = Hex.fromWorld(c.x, c.y);
        assert(h.col === col && h.row === row, `identity failed at ${col},${row}`);
      }
    }
  }],

  ['all 6 neighbors are exactly one spacing away', ({ loadGame, close }) => {
    const { Hex } = loadGame();
    for (const [col, row] of [[10, 10], [11, 11], [5, 20]]) {
      const c = Hex.centerOf(col, row);
      for (const [dc, dr] of Hex.neighbors(row)) {
        const n = Hex.centerOf(col + dc, row + dr);
        close(Math.hypot(n.x - c.x, n.y - c.y), Hex.S, 0.01,
          `neighbor spacing at ${col},${row} + ${dc},${dr}`);
      }
    }
  }],

  ['hex distance: neighbors are 1, symmetric', ({ loadGame, assert }) => {
    const { Hex } = loadGame();
    const a = { col: 12, row: 15 };
    for (const [dc, dr] of Hex.neighbors(a.row)) {
      const b = { col: a.col + dc, row: a.row + dr };
      assert(Hex.dist(a, b) === 1, 'neighbor dist != 1');
      assert(Hex.dist(b, a) === 1, 'dist not symmetric');
    }
    assert(Hex.dist(a, a) === 0, 'self dist != 0');
  }],

  ['structure blocks hexes with margin', ({ loadGame, assert }) => {
    const g = loadGame();
    g.Entities.spawnStructure('hq', 15, 18); // 5x5 at tiles 15..19 x 18..22
    // A hex whose center is inside the footprint is blocked.
    const inside = g.Hex.fromWorld(17.5 * 32, 20.5 * 32);
    assert(!g.Hex.structFree(inside.col, inside.row), 'footprint hex not blocked');
    // A hex far away is free.
    const far = g.Hex.fromWorld(5 * 32, 5 * 32);
    assert(g.Hex.structFree(far.col, far.row), 'distant hex blocked');
    // Every free hex center keeps the clearance margin from the footprint.
    const T = 32, m = g.Hex.MARGIN;
    for (let row = 0; row < g.Hex.rows; row++) {
      for (let col = 0; col < g.Hex.cols(row); col++) {
        if (!g.Hex.structFree(col, row)) continue;
        const c = g.Hex.centerOf(col, row);
        const dx = Math.max(15 * T - c.x, 0, c.x - 20 * T);
        const dy = Math.max(18 * T - c.y, 0, c.y - 23 * T);
        assert(Math.max(dx, dy) >= m - 0.01,
          `free hex ${col},${row} violates margin (${dx},${dy})`);
      }
    }
  }],

  ['nearestFree skips occupied hexes and taken set', ({ loadGame, assert }) => {
    const g = loadGame();
    const h = { col: 10, row: 10 };
    const id = g.Hex.idx(h.col, h.row);
    g.GameMap.unitOcc.set(id, 999);
    const taken = new Set();
    const f1 = g.Hex.nearestFree(h.col, h.row, null, taken);
    assert(g.Hex.idx(f1.col, f1.row) !== id, 'returned an occupied hex');
    assert(g.Hex.dist(h, f1) === 1, 'not the nearest ring');
    taken.add(g.Hex.idx(f1.col, f1.row));
    const f2 = g.Hex.nearestFree(h.col, h.row, null, taken);
    assert(g.Hex.idx(f2.col, f2.row) !== g.Hex.idx(f1.col, f1.row), 'ignored taken set');
  }],

  ['bestAdjacent hugs the footprint and respects occupancy', ({ loadGame, assert }) => {
    const g = loadGame();
    const s = g.Entities.spawnStructure('node', 24, 14); // 2x2
    const t = g.Hex.bestAdjacent(s, 30, 20, null);
    assert(t, 'no adjacent hex found');
    assert(g.Hex.free(t.col, t.row, null), 'adjacent hex not free');
    const d = g.Hex.distToRect(t.col, t.row, s);
    assert(d > 0 && d <= 32 * 1.1, `not hugging the edge (d=${d})`);
  }],
];
