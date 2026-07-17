// Seeded map generator. Produces the NEUTRAL WORLD only — terrain, resource
// placements, and start locations — never any game's entities. A game calls
// generate(seed), then decides what to spawn at each start (base, units, …).
//
//   const { terrain, resources, starts } = MapGen.generate(1234, { starts: 2 });
//
//   terrain    Uint8Array(w*h): 0 passable, 1 wall (feed to GameMap.setTerrain)
//   resources  [{ tx, ty }]    : 2x2 ore-node top-left tiles. One is guaranteed
//                                near each start; the rest are scattered.
//   starts     [{ tx, ty }]    : cleared plaza CENTER tiles, spread far apart.
//                                Deterministic: same seed + opts -> same map.
//
// The map is always fully connected: after scattering wall blobs, every start
// and resource is BFS-checked from start 0 and corridors are carved to any
// that aren't reachable, so a generated map can never seal a player in.
const MapGen = {
  generate(seed, opts = {}) {
    const W = GameMap.w, H = GameMap.h;
    const rng = RNG.create(seed);
    const nStarts = opts.starts != null ? opts.starts : 2;
    const plaza = opts.plaza != null ? opts.plaza : 7;   // cleared square side
    const nodeNear = opts.nodeNear != null ? opts.nodeNear : 5; // tiles from start
    const extra = opts.extraNodes != null ? opts.extraNodes : nStarts + 2;
    const wallFrac = opts.wallFrac != null ? opts.wallFrac : 0.16;
    const border = 2; // keep the outer ring clear

    const terr = new Uint8Array(W * H);
    const at = (tx, ty) => terr[ty * W + tx];
    const set = (tx, ty, v) => {
      if (tx >= border && ty >= border && tx < W - border && ty < H - border)
        terr[ty * W + tx] = v;
    };

    // 1) Scatter natural wall blobs with short random walks that paint small
    //    clumps, until ~wallFrac of the interior is wall.
    const target = Math.floor(W * H * wallFrac);
    let walls = 0, guard = 0;
    while (walls < target && guard++ < 5000) {
      let cx = rng.int(border, W - 1 - border);
      let cy = rng.int(border, H - 1 - border);
      const steps = rng.int(6, 20);
      for (let s = 0; s < steps && walls < target; s++) {
        const rad = rng.int(0, 1);
        for (let dy = -rad; dy <= rad; dy++)
          for (let dx = -rad; dx <= rad; dx++) {
            const tx = cx + dx, ty = cy + dy;
            if (tx < border || ty < border || tx >= W - border || ty >= H - border) continue;
            if (at(tx, ty) === 0) { terr[ty * W + tx] = 1; walls++; }
          }
        cx = Math.max(border, Math.min(W - 1 - border, cx + rng.int(-1, 1)));
        cy = Math.max(border, Math.min(H - 1 - border, cy + rng.int(-1, 1)));
      }
    }

    // 2) Start locations: farthest-point sampling so they spread apart, each
    //    with its plaza cleared to bare ground.
    const starts = this._placeStarts(rng, W, H, nStarts, plaza, border);
    for (const s of starts) this._clear(terr, W, H, s.tx, s.ty, plaza, border);

    // 3) A guaranteed resource near each start, then scattered extras.
    const resources = [];
    for (const s of starts) {
      const n = this._nodeNearStart(rng, W, H, s, nodeNear, border);
      this._clear(terr, W, H, n.tx + 1, n.ty + 1, 4, border);
      resources.push(n);
    }
    for (let i = 0; i < extra; i++) {
      const n = this._scatterNode(rng, W, H, resources, starts, border);
      if (n) { this._clear(terr, W, H, n.tx + 1, n.ty + 1, 4, border); resources.push(n); }
    }

    // 4) Guarantee connectivity: carve corridors to anything unreachable from
    //    start 0 over passable ground.
    this._ensureConnected(terr, W, H, starts, resources);

    return { terrain: terr, resources, starts };
  },

  // Clear a `side`x`side` square of terrain centered on (cx,cy) to passable.
  _clear(terr, W, H, cx, cy, side, border) {
    const h = Math.floor(side / 2);
    for (let dy = -h; dy <= h; dy++)
      for (let dx = -h; dx <= h; dx++) {
        const tx = cx + dx, ty = cy + dy;
        if (tx >= border && ty >= border && tx < W - border && ty < H - border)
          terr[ty * W + tx] = 0;
      }
  },

  // Spread N start points: a random first point, then repeatedly the candidate
  // farthest from all chosen so far (deterministic given the RNG).
  _placeStarts(rng, W, H, n, plaza, border) {
    const half = Math.ceil(plaza / 2) + 1;
    const loX = border + half, hiX = W - border - half - 1;
    const loY = border + half, hiY = H - border - half - 1;
    const cand = [];
    for (let i = 0; i < 200; i++) {
      cand.push({ tx: rng.int(loX, hiX), ty: rng.int(loY, hiY) });
    }
    const chosen = [cand[0]];
    while (chosen.length < n) {
      let best = cand[0], bd = -1;
      for (const c of cand) {
        let d = Infinity;
        for (const s of chosen) {
          const dd = (c.tx - s.tx) ** 2 + (c.ty - s.ty) ** 2;
          if (dd < d) d = dd;
        }
        if (d > bd) { bd = d; best = c; }
      }
      chosen.push(best);
    }
    return chosen;
  },

  // A 2x2 node top-left roughly `dist` tiles from a start, kept in bounds.
  _nodeNearStart(rng, W, H, s, dist, border) {
    const ang = rng.float(0, Math.PI * 2);
    const r = dist + rng.int(0, 2);
    let tx = Math.round(s.tx + Math.cos(ang) * r);
    let ty = Math.round(s.ty + Math.sin(ang) * r);
    tx = Math.max(border, Math.min(W - border - 2, tx));
    ty = Math.max(border, Math.min(H - border - 2, ty));
    return { tx, ty };
  },

  // A scattered 2x2 node, kept a few tiles clear of other nodes and starts.
  _scatterNode(rng, W, H, resources, starts, border) {
    for (let tries = 0; tries < 40; tries++) {
      const tx = rng.int(border, W - border - 2);
      const ty = rng.int(border, H - border - 2);
      let ok = true;
      for (const r of resources)
        if ((r.tx - tx) ** 2 + (r.ty - ty) ** 2 < 25) { ok = false; break; }
      if (ok) for (const s of starts)
        if ((s.tx - tx) ** 2 + (s.ty - ty) ** 2 < 36) { ok = false; break; }
      if (ok) return { tx, ty };
    }
    return null;
  },

  // BFS over passable tiles from start 0; carve a corridor to any start or
  // resource that isn't reachable so the whole map is one connected space.
  _ensureConnected(terr, W, H, starts, resources) {
    const passable = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H && terr[ty * W + tx] === 0;
    const reach = (from) => {
      const seen = new Uint8Array(W * H);
      const q = [from];
      seen[from.ty * W + from.tx] = 1;
      for (let i = 0; i < q.length; i++) {
        const { tx, ty } = q[i];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = tx + dx, ny = ty + dy;
          if (passable(nx, ny) && !seen[ny * W + nx]) {
            seen[ny * W + nx] = 1; q.push({ tx: nx, ty: ny });
          }
        }
      }
      return seen;
    };
    const hub = starts[0];
    let seen = reach(hub);
    const targets = [...starts.slice(1), ...resources.map(r => ({ tx: r.tx, ty: r.ty }))];
    for (const t of targets) {
      if (seen[t.ty * W + t.tx]) continue;
      this._carve(terr, W, H, hub, t); // clears a 2-wide corridor hub -> t
      seen = reach(hub); // corridor may connect several at once
    }
  },

  // Carve a 2-wide passable corridor between two tiles (L-shaped: x then y).
  _carve(terr, W, H, a, b) {
    const paint = (tx, ty) => {
      for (let dy = 0; dy <= 1; dy++)
        for (let dx = 0; dx <= 1; dx++) {
          const x = tx + dx, y = ty + dy;
          if (x >= 0 && y >= 0 && x < W && y < H) terr[y * W + x] = 0;
        }
    };
    const stepX = a.tx <= b.tx ? 1 : -1;
    for (let x = a.tx; x !== b.tx; x += stepX) paint(x, a.ty);
    const stepY = a.ty <= b.ty ? 1 : -1;
    for (let y = a.ty; y !== b.ty; y += stepY) paint(b.tx, y);
    paint(b.tx, b.ty);
  },
};
