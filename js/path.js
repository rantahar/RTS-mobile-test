// Hierarchical pathfinding.
//
// Two levels, per the map design:
//   1. A* over macro tiles (MACRO x MACRO blocks) to get a coarse route,
//      ignoring units. A macro tile is passable if any of its micro tiles is
//      structure-free.
//   2. A* over micro tiles restricted to a corridor around the macro route
//      (macro tiles on the route, dilated by one macro ring). This keeps the
//      fine search proportional to path length instead of map area.
// If the corridor search fails (tight squeeze, unit jam), fall back to an
// unrestricted micro search.
//
// Micro walkability: inside the map, no structure footprint, and no unit
// registered on the tile (units block each other; Sim resolves jams by
// waiting + repathing).

class _MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) {
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

const Path = {
  DIRS: [
    [1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10],
    [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14],
  ],

  structFree(tx, ty) {
    return GameMap.inBounds(tx, ty) &&
           GameMap.occupancy[GameMap.idx(tx, ty)] == null;
  },

  unitFree(tx, ty, self) {
    const o = GameMap.unitOcc.get(GameMap.idx(tx, ty));
    return o == null || (self && o === self.id);
  },

  free(tx, ty, self) {
    return this.structFree(tx, ty) && this.unitFree(tx, ty, self);
  },

  // Nearest free tile to (tx,ty), spiraling outward. `taken` is an optional
  // Set of tile idx already promised to other units in the same order.
  nearestFreeTile(tx, ty, self, taken) {
    for (let ring = 0; ring <= 10; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const x = tx + dx, y = ty + dy;
          if (!this.free(x, y, self)) continue;
          if (taken && taken.has(GameMap.idx(x, y))) continue;
          return { tx: x, ty: y };
        }
      }
    }
    return null;
  },

  // Best free tile hugging a structure's footprint (ring 1), preferring the
  // one closest to (ftx,fty). Expands outward if the whole ring is taken,
  // which makes crowded workers queue nearby instead of giving up.
  bestAdjacentTile(s, ftx, fty, self) {
    for (let ring = 1; ring <= 6; ring++) {
      const x0 = s.tx - ring, x1 = s.tx + s.w - 1 + ring;
      const y0 = s.ty - ring, y1 = s.ty + s.h - 1 + ring;
      let best = null, bd = Infinity;
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          if (x !== x0 && x !== x1 && y !== y0 && y !== y1) continue; // border only
          if (!this.free(x, y, self)) continue;
          const ax = Math.abs(x - ftx), ay = Math.abs(y - fty);
          const d = 10 * Math.max(ax, ay) + 4 * Math.min(ax, ay);
          if (d < bd) { bd = d; best = { tx: x, ty: y }; }
        }
      }
      if (best) return best;
    }
    return null;
  },

  // Micro-tile A*. Returns waypoints [{tx,ty},...] excluding the start tile,
  // [] if already there, or null if unreachable. `allowed` optionally
  // restricts the search to a set of tile idx (the macro corridor).
  aStar(sx, sy, dx, dy, self, allowed) {
    const W = GameMap.w;
    const start = sy * W + sx, goal = dy * W + dx;
    if (start === goal) return [];

    const h = (x, y) => {
      const ax = Math.abs(x - dx), ay = Math.abs(y - dy);
      return 10 * Math.max(ax, ay) + 4 * Math.min(ax, ay);
    };
    const open = new _MinHeap();
    const g = new Map([[start, 0]]);
    const came = new Map();
    const closed = new Set();
    open.push([h(sx, sy), start]);

    while (open.size) {
      const [, cur] = open.pop();
      if (cur === goal) {
        const out = [];
        for (let n = goal; n !== start; n = came.get(n)) {
          out.push({ tx: n % W, ty: (n - (n % W)) / W });
        }
        return out.reverse();
      }
      if (closed.has(cur)) continue;
      closed.add(cur);
      if (closed.size > 5000) return null; // safety valve

      const cx = cur % W, cy = (cur - cx) / W;
      for (const [ox, oy, cost] of this.DIRS) {
        const nx = cx + ox, ny = cy + oy;
        if (!this.free(nx, ny, self)) continue;
        const nidx = ny * W + nx;
        if (allowed && !allowed.has(nidx)) continue;
        // No cutting corners around blocked tiles on diagonal steps.
        if (ox && oy && (!this.free(cx + ox, cy, self) || !this.free(cx, cy + oy, self))) continue;
        const ng = g.get(cur) + cost;
        if (ng < (g.get(nidx) ?? Infinity)) {
          g.set(nidx, ng);
          came.set(nidx, cur);
          open.push([ng + h(nx, ny), nidx]);
        }
      }
    }
    return null;
  },

  // Coarse A* over macro tiles (structures only). Returns list of macro idx.
  macroFree(mx, my) {
    if (mx < 0 || my < 0 || mx >= GameMap.macroW || my >= GameMap.macroH) return false;
    const M = GameMap.macro;
    for (let x = mx * M; x < Math.min((mx + 1) * M, GameMap.w); x++)
      for (let y = my * M; y < Math.min((my + 1) * M, GameMap.h); y++)
        if (this.structFree(x, y)) return true;
    return false;
  },

  macroAStar(sx, sy, dx, dy) {
    const W = GameMap.macroW;
    const start = sy * W + sx, goal = dy * W + dx;
    if (start === goal) return [start];

    const h = (x, y) => {
      const ax = Math.abs(x - dx), ay = Math.abs(y - dy);
      return 10 * Math.max(ax, ay) + 4 * Math.min(ax, ay);
    };
    const open = new _MinHeap();
    const g = new Map([[start, 0]]);
    const came = new Map();
    const closed = new Set();
    open.push([h(sx, sy), start]);

    while (open.size) {
      const [, cur] = open.pop();
      if (cur === goal) {
        const out = [];
        for (let n = goal; n !== undefined; n = came.get(n)) out.push(n);
        return out;
      }
      if (closed.has(cur)) continue;
      closed.add(cur);
      const cx = cur % W, cy = (cur - cx) / W;
      for (const [ox, oy, cost] of this.DIRS) {
        const nx = cx + ox, ny = cy + oy;
        if (!this.macroFree(nx, ny)) continue;
        const nidx = ny * W + nx;
        const ng = g.get(cur) + cost;
        if (ng < (g.get(nidx) ?? Infinity)) {
          g.set(nidx, ng);
          came.set(nidx, cur);
          open.push([ng + h(nx, ny), nidx]);
        }
      }
    }
    return null;
  },

  // Micro-tile idx set covering the macro route dilated by one macro ring.
  corridor(macroPath) {
    const W = GameMap.macroW, M = GameMap.macro;
    const macros = new Set();
    for (const m of macroPath) {
      const mx = m % W, my = (m - mx) / W;
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++)
          macros.add(`${mx + ox},${my + oy}`);
    }
    const allowed = new Set();
    for (const key of macros) {
      const [mx, my] = key.split(',').map(Number);
      for (let x = mx * M; x < (mx + 1) * M; x++)
        for (let y = my * M; y < (my + 1) * M; y++)
          if (GameMap.inBounds(x, y)) allowed.add(GameMap.idx(x, y));
    }
    return allowed;
  },

  // Public entry: hierarchical find from tile to tile.
  find(sx, sy, dx, dy, self) {
    if (sx === dx && sy === dy) return [];
    const sm = GameMap.microToMacro(sx, sy);
    const gm = GameMap.microToMacro(dx, dy);
    let allowed = null;
    if (sm.mx !== gm.mx || sm.my !== gm.my) {
      const mp = this.macroAStar(sm.mx, sm.my, gm.mx, gm.my);
      if (mp) allowed = this.corridor(mp);
    }
    let p = this.aStar(sx, sy, dx, dy, self, allowed);
    if (!p && allowed) p = this.aStar(sx, sy, dx, dy, self, null);
    return p;
  },
};
