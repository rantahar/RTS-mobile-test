// Hierarchical pathfinding for units over the hex lattice.
//
// Two levels, per the map design:
//   1. A* over macro tiles (MACRO x MACRO squares) to get a coarse route,
//      structures only. A macro tile is passable if any of its micro tiles
//      is structure-free.
//   2. A* over hexes restricted to a corridor around the macro route (macro
//      tiles on the route, dilated by one macro ring). This keeps the fine
//      search proportional to path length instead of map area.
// If the corridor search fails (tight squeeze, unit jam), fall back to an
// unrestricted hex search.
//
// Hex walkability: inside the map, clear of structure footprints (with a
// margin so unit circles don't clip buildings), and not owned by another
// unit. All 6 hex steps cost the same — no corner-cutting cases to handle.

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
  DIRS8: [
    [1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10],
    [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14],
  ],

  structFree(tx, ty) {
    return GameMap.inBounds(tx, ty) &&
           GameMap.occupancy[GameMap.idx(tx, ty)] == null;
  },

  // Hex-lattice A*. start/goal are {col,row}. Returns waypoints excluding the
  // start hex, [] if already there, or null if unreachable. `allowedMicro`
  // optionally restricts hexes to those whose center lies in a set of micro
  // tile idx (the macro corridor).
  aStar(start, goal, self, allowedMicro) {
    const sIdx = Hex.idx(start.col, start.row);
    const gIdx = Hex.idx(goal.col, goal.row);
    if (sIdx === gIdx) return [];

    const open = new _MinHeap();
    const g = new Map([[sIdx, 0]]);
    const came = new Map();
    const closed = new Set();
    const h = (col, row) => 10 * Hex.dist({ col, row }, goal);
    open.push([h(start.col, start.row), sIdx, start.col, start.row]);

    while (open.size) {
      const [, cur, ccol, crow] = open.pop();
      if (cur === gIdx) {
        const out = [];
        for (let n = gIdx; n !== sIdx; n = came.get(n)) {
          out.push({ col: n % Hex.STRIDE, row: Math.floor(n / Hex.STRIDE) });
        }
        return out.reverse();
      }
      if (closed.has(cur)) continue;
      closed.add(cur);
      if (closed.size > 6000) return null; // safety valve

      for (const [dc, dr] of Hex.neighbors(crow)) {
        const ncol = ccol + dc, nrow = crow + dr;
        if (!Hex.free(ncol, nrow, self)) continue;
        const nidx = Hex.idx(ncol, nrow);
        if (allowedMicro) {
          const c = Hex.centerOf(ncol, nrow);
          const t = GameMap.worldToTile(c.x, c.y);
          if (!allowedMicro.has(GameMap.idx(t.tx, t.ty))) continue;
        }
        const ng = g.get(cur) + 10;
        if (ng < (g.get(nidx) ?? Infinity)) {
          g.set(nidx, ng);
          came.set(nidx, cur);
          open.push([ng + h(ncol, nrow), nidx, ncol, nrow]);
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
      for (const [ox, oy, cost] of this.DIRS8) {
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

  // Public entry: hierarchical find from hex to hex.
  find(start, goal, self) {
    if (start.col === goal.col && start.row === goal.row) return [];
    const sc = Hex.centerOf(start.col, start.row);
    const gc = Hex.centerOf(goal.col, goal.row);
    const st = GameMap.worldToTile(sc.x, sc.y);
    const gt = GameMap.worldToTile(gc.x, gc.y);
    const sm = GameMap.microToMacro(st.tx, st.ty);
    const gm = GameMap.microToMacro(gt.tx, gt.ty);

    let allowed = null;
    if (sm.mx !== gm.mx || sm.my !== gm.my) {
      const mp = this.macroAStar(sm.mx, sm.my, gm.mx, gm.my);
      if (mp) allowed = this.corridor(mp);
    }
    let p = this.aStar(start, goal, self, allowed);
    if (!p && allowed) p = this.aStar(start, goal, self, null);
    return p;
  },
};
