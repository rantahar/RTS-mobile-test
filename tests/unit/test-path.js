// Pathfinding: A* validity/optimality, string pulling, coarse planning.
exports.tests = [

  ['A* on an empty map is optimal and valid', ({ loadGame, assert }) => {
    const { Hex, Path } = loadGame();
    const start = { col: 5, row: 5 }, goal = { col: 20, row: 30 };
    const p = Path.aStar(start, goal, null);
    assert(p, 'no path on empty map');
    assert(p.length === Hex.dist(start, goal), `not optimal: ${p.length} vs ${Hex.dist(start, goal)}`);
    let cur = start;
    for (const step of p) {
      assert(Hex.dist(cur, step) === 1, 'non-adjacent step');
      assert(Hex.free(step.col, step.row, null), 'step through blocked hex');
      cur = step;
    }
  }],

  ['A* routes around a structure', ({ loadGame, assert }) => {
    const g = loadGame();
    g.Entities.spawnStructure('hq', 15, 18);
    const start = g.Hex.fromWorld(22.5 * 32, 20.5 * 32); // right of HQ
    const goal = g.Hex.fromWorld(12.5 * 32, 20.5 * 32);  // left of HQ
    const p = g.Path.aStar(start, goal, null);
    assert(p && p.length, 'no path around structure');
    for (const step of p) {
      assert(g.Hex.structFree(step.col, step.row), 'path enters blocked hex');
    }
  }],

  ['A* respects units only within LOCAL_R', ({ loadGame, assert }) => {
    const g = loadGame();
    const start = { col: 10, row: 20 };
    // Blocker 3 hexes away (local): avoided.
    const near = { col: 13, row: 20 };
    g.GameMap.unitOcc.set(g.Hex.idx(near.col, near.row), 42);
    const goal = { col: 16, row: 20 };
    const p1 = g.Path.aStar(start, goal, null);
    assert(p1.every(s => !(s.col === near.col && s.row === near.row)),
      'path goes through a local blocker');
    // Blocker 10 hexes away (beyond LOCAL_R): ignored at plan time.
    g.GameMap.unitOcc.clear();
    const farBlocker = { col: 20, row: 20 };
    g.GameMap.unitOcc.set(g.Hex.idx(farBlocker.col, farBlocker.row), 42);
    const p2 = g.Path.aStar(start, { col: 30, row: 20 }, null);
    assert(p2.some(s => s.col === farBlocker.col && s.row === farBlocker.row),
      'plan detoured around a far blocker it should ignore');
  }],

  ['segRect agrees with dense sampling', ({ loadGame, assert }) => {
    const { Path } = loadGame();
    const rect = [100, 100, 200, 180];
    const inside = (x, y) => x >= rect[0] && x <= rect[2] && y >= rect[1] && y <= rect[3];
    // Deterministic pseudo-random segments.
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 300; i++) {
      const a = { x: rnd() * 320, y: rnd() * 300 };
      const b = { x: rnd() * 320, y: rnd() * 300 };
      let sampled = false;
      for (let t = 0; t <= 1; t += 1 / 256) {
        if (inside(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) { sampled = true; break; }
      }
      const got = Path.segRect(a, b, ...rect);
      // Sampling can miss grazing hits; only require agreement when sampling says yes,
      // and require segRect-yes to be plausible (some sample within 3px of rect).
      if (sampled) assert(got, `segRect missed a crossing segment (${i})`);
      if (got && !sampled) {
        let near = false;
        for (let t = 0; t <= 1; t += 1 / 256) {
          const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
          const dx = Math.max(rect[0] - x, 0, x - rect[2]);
          const dy = Math.max(rect[1] - y, 0, y - rect[3]);
          if (Math.hypot(dx, dy) < 3) { near = true; break; }
        }
        assert(near, `segRect false positive (${i})`);
      }
    }
  }],

  ['string pulling keeps structure clearance', ({ loadGame, assert }) => {
    const g = loadGame();
    const s = g.Entities.spawnStructure('hq', 15, 18);
    const start = g.Hex.fromWorld(22.5 * 32, 20.5 * 32);
    const goal = g.Hex.fromWorld(12.5 * 32, 20.5 * 32);
    const hp = g.Path.aStar(start, goal, null);
    const from = g.Hex.centerOf(start.col, start.row);
    const route = g.Path.smooth(from, hp, null);
    assert(route.length >= 2, 'expected corner turns around the building');
    // Sample every segment: never inside the margin-expanded footprint.
    const T = 32, m = g.Hex.MARGIN - 0.01;
    let cur = from;
    for (const wp of route) {
      for (let t = 0; t <= 1; t += 1 / 128) {
        const x = cur.x + (wp.x - cur.x) * t, y = cur.y + (wp.y - cur.y) * t;
        const inside = x > s.tx * T - m && x < (s.tx + s.w) * T + m &&
                       y > s.ty * T - m && y < (s.ty + s.h) * T + m;
        assert(!inside, 'smoothed route clips the structure margin');
      }
      cur = wp;
    }
  }],

  ['string pulling avoids occupied/reserved hexes locally', ({ loadGame, assert }) => {
    const g = loadGame();
    const start = { col: 10, row: 20 };
    const goal = { col: 16, row: 20 };
    const blocker = { col: 13, row: 20 };
    g.GameMap.unitOcc.set(g.Hex.idx(blocker.col, blocker.row), 42);
    const hp = g.Path.aStar(start, goal, null);
    const from = g.Hex.centerOf(start.col, start.row);
    const route = g.Path.smooth(from, hp, null);
    const bc = g.Hex.centerOf(blocker.col, blocker.row);
    let cur = from;
    for (const wp of route) {
      const d2 = g.Path.segPointDist2(cur, wp, bc.x, bc.y);
      assert(d2 >= (g.Hex.S * 0.75) ** 2 - 1e-6, 'smoothed segment cuts through a blocked hex');
      cur = wp;
    }
  }],

  ['coarse waypoints are spaced under 9 units', ({ loadGame, assert }) => {
    const g = loadGame();
    g.Entities.spawnStructure('hq', 15, 18);
    const u = g.Entities.spawnUnit('worker', 22.5 * 32, 21.5 * 32);
    const dest = g.Hex.fromWorld(4 * 32, 4 * 32);
    const pts = g.Path.coarse(u, dest);
    assert(pts.length >= 2, 'long trip should have multiple coarse points');
    let prev = { x: u.x, y: u.y };
    for (const p of pts) {
      assert(Math.hypot(p.x - prev.x, p.y - prev.y) < 9 * g.Hex.S,
        'coarse spacing exceeds 9 units');
      prev = p;
    }
  }],
];
