// Map generator: determinism, start/resource guarantees, and full
// connectivity (a generated map can never seal a player in).

function bfsReach(g, terr, from) {
  const W = g.GameMap.w, H = g.GameMap.h;
  const seen = new Uint8Array(W * H);
  const passable = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H && terr[ty * W + tx] === 0;
  const q = [from];
  seen[from.ty * W + from.tx] = 1;
  for (let i = 0; i < q.length; i++) {
    const { tx, ty } = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + dx, ny = ty + dy;
      if (passable(nx, ny) && !seen[ny * W + nx]) { seen[ny * W + nx] = 1; q.push({ tx: nx, ty: ny }); }
    }
  }
  return seen;
}

exports.tests = [

  ['same seed reproduces an identical map', ({ loadGame, assert }) => {
    const g = loadGame();
    const a = g.MapGen.generate(1337, { starts: 2 });
    const b = g.MapGen.generate(1337, { starts: 2 });
    assert(a.terrain.length === b.terrain.length, 'terrain size differs');
    for (let i = 0; i < a.terrain.length; i++)
      if (a.terrain[i] !== b.terrain[i]) throw new Error(`terrain differs at ${i}`);
    assert(JSON.stringify(a.starts) === JSON.stringify(b.starts), 'starts differ');
    assert(JSON.stringify(a.resources) === JSON.stringify(b.resources), 'resources differ');
  }],

  ['different seeds give different terrain', ({ loadGame, assert }) => {
    const g = loadGame();
    const a = g.MapGen.generate(1, { starts: 2 });
    const b = g.MapGen.generate(2, { starts: 2 });
    let diff = 0;
    for (let i = 0; i < a.terrain.length; i++) if (a.terrain[i] !== b.terrain[i]) diff++;
    assert(diff > 20, `seeds produced near-identical maps (${diff} tiles differ)`);
  }],

  ['starts: requested count, passable, spread apart', ({ loadGame, assert }) => {
    const g = loadGame();
    const W = g.GameMap.w;
    const { terrain, starts } = g.MapGen.generate(42, { starts: 3 });
    assert(starts.length === 3, `expected 3 starts, got ${starts.length}`);
    for (const s of starts)
      assert(terrain[s.ty * W + s.tx] === 0, 'start tile is not passable');
    // Every pair reasonably far apart (farthest-point sampling).
    for (let i = 0; i < starts.length; i++)
      for (let j = i + 1; j < starts.length; j++) {
        const d = Math.hypot(starts[i].tx - starts[j].tx, starts[i].ty - starts[j].ty);
        assert(d > 10, `starts ${i},${j} too close (${d.toFixed(1)})`);
      }
  }],

  ['each start has a guaranteed nearby resource', ({ loadGame, assert }) => {
    const g = loadGame();
    const { starts, resources } = g.MapGen.generate(7, { starts: 2, nodeNear: 5 });
    assert(resources.length >= starts.length, 'fewer resources than starts');
    starts.forEach((s, i) => {
      const r = resources[i]; // resources[0..starts-1] are the per-start nodes
      const d = Math.hypot((r.tx + 1) - s.tx, (r.ty + 1) - s.ty);
      assert(d <= 12, `start ${i} resource too far (${d.toFixed(1)})`);
    });
  }],

  ['every start and resource is reachable from start 0', ({ loadGame, assert }) => {
    const g = loadGame();
    const W = g.GameMap.w;
    for (const seed of [1, 2, 3, 99, 1337]) {
      const { terrain, starts, resources } = g.MapGen.generate(seed, { starts: 2 });
      const seen = bfsReach(g, terrain, starts[0]);
      for (const s of starts)
        assert(seen[s.ty * W + s.tx], `seed ${seed}: a start is walled off`);
      for (const r of resources)
        assert(seen[r.ty * W + r.tx], `seed ${seed}: a resource is walled off`);
    }
  }],

  ['wall coverage is present but not overwhelming', ({ loadGame, assert }) => {
    const g = loadGame();
    const { terrain } = g.MapGen.generate(1337, { starts: 2 });
    let walls = 0;
    for (let i = 0; i < terrain.length; i++) if (terrain[i]) walls++;
    const frac = walls / terrain.length;
    assert(frac > 0.02, `hardly any terrain generated (${frac.toFixed(3)})`);
    assert(frac < 0.35, `too much of the map is wall (${frac.toFixed(3)})`);
  }],
];
