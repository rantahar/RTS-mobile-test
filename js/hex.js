// Hex lattice for UNIT positions (odd-r staggered grid).
//
// Structures and the macro grid stay on square tiles; units register on and
// path over this hex lattice instead. Horizontal spacing = TILE, row spacing
// = TILE * sqrt(3)/2, odd rows shifted right by TILE/2 — so all 6 neighbors
// of a hex are exactly TILE apart (true hexagonal packing).
const Hex = {
  S: 0,      // horizontal spacing (world px)
  rowH: 0,   // vertical row spacing
  rows: 0,
  STRIDE: 0, // idx stride (> max cols)
  MARGIN: 10, // keep unit centers this many px away from structure footprints

  init() {
    this.S = CONFIG.TILE;
    this.rowH = CONFIG.TILE * Math.sqrt(3) / 2;
    this.rows = Math.floor(CONFIG.MAP_PX_H / this.rowH);
    this.STRIDE = CONFIG.MAP_W + 1;
  },

  cols(row) { return row % 2 ? CONFIG.MAP_W - 1 : CONFIG.MAP_W; },
  idx(col, row) { return row * this.STRIDE + col; },
  inBounds(col, row) {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols(row);
  },

  centerOf(col, row) {
    return {
      x: (col + 0.5 + (row % 2 ? 0.5 : 0)) * this.S,
      y: (row + 0.5) * this.rowH,
    };
  },

  // Nearest hex to a world point (checks the two candidate rows, compares
  // squared euclidean distance).
  fromWorld(x, y) {
    const r0 = Math.floor(y / this.rowH - 0.5);
    let best = null, bd = Infinity;
    for (let row = Math.max(0, r0); row <= Math.min(this.rows - 1, r0 + 1); row++) {
      let col = Math.round(x / this.S - 0.5 - (row % 2 ? 0.5 : 0));
      col = Math.max(0, Math.min(this.cols(row) - 1, col));
      const c = this.centerOf(col, row);
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d < bd) { bd = d; best = { col, row }; }
    }
    return best;
  },

  NEIGH_EVEN: [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]],
  NEIGH_ODD: [[1, 0], [-1, 0], [1, -1], [0, -1], [1, 1], [0, 1]],
  neighbors(row) { return row % 2 ? this.NEIGH_ODD : this.NEIGH_EVEN; },

  // Hex distance in steps (via cube coordinates).
  dist(a, b) {
    const ax = a.col - ((a.row - (a.row & 1)) >> 1);
    const bx = b.col - ((b.row - (b.row & 1)) >> 1);
    const dx = ax - bx, dz = a.row - b.row;
    return Math.max(Math.abs(dx), Math.abs(dz), Math.abs(-dx - dz));
  },

  // No blocked tile (structure footprint OR wall terrain) within MARGIN px of
  // the hex center, so unit circles never visually clip buildings or rock.
  structFree(col, row) {
    if (!this.inBounds(col, row)) return false;
    const c = this.centerOf(col, row);
    const m = this.MARGIN, T = CONFIG.TILE;
    const tx0 = Math.floor((c.x - m) / T), tx1 = Math.floor((c.x + m) / T);
    const ty0 = Math.floor((c.y - m) / T), ty1 = Math.floor((c.y + m) / T);
    for (let tx = tx0; tx <= tx1; tx++)
      for (let ty = ty0; ty <= ty1; ty++)
        if (GameMap.inBounds(tx, ty) && GameMap.tileBlocked(tx, ty)) return false;
    return true;
  },

  unitFree(col, row, self) {
    const o = GameMap.unitOcc.get(this.idx(col, row));
    return o == null || (self != null && o === self.id);
  },

  free(col, row, self) {
    return this.structFree(col, row) && this.unitFree(col, row, self);
  },

  // World-px distance from a hex center to a structure's footprint rect.
  distToRect(col, row, s) {
    const c = this.centerOf(col, row), T = CONFIG.TILE;
    const dx = Math.max(s.tx * T - c.x, 0, c.x - (s.tx + s.w) * T);
    const dy = Math.max(s.ty * T - c.y, 0, c.y - (s.ty + s.h) * T);
    return Math.hypot(dx, dy);
  },

  // Nearest free hex to a start hex, breadth-first over the lattice.
  // `taken` is an optional Set of hex idx promised to other units.
  nearestFree(col, row, self, taken) {
    const seen = new Set([this.idx(col, row)]);
    let frontier = [{ col, row }];
    for (let depth = 0; depth <= 14 && frontier.length; depth++) {
      for (const h of frontier) {
        if (this.free(h.col, h.row, self) &&
            !(taken && taken.has(this.idx(h.col, h.row)))) return h;
      }
      const next = [];
      for (const h of frontier) {
        for (const [dc, dr] of this.neighbors(h.row)) {
          const c2 = h.col + dc, r2 = h.row + dr;
          if (!this.inBounds(c2, r2)) continue;
          const k = this.idx(c2, r2);
          if (!seen.has(k)) { seen.add(k); next.push({ col: c2, row: r2 }); }
        }
      }
      frontier = next;
    }
    return null;
  },

  // Range slot: a free hex within rangePx of the target (unit or structure),
  // nearest to the attacker. Each attacker grabs the closest open spot on its
  // side, so a group fans out along the range ring and units behind path
  // around the ones already standing at range.
  attackSlot(t, e, rangePx) {
    const T = CONFIG.TILE;
    const st = t.kind === 'structure';
    const x0 = st ? t.tx * T : t.x, x1 = st ? (t.tx + t.w) * T : t.x;
    const y0 = st ? t.ty * T : t.y, y1 = st ? (t.ty + t.h) * T : t.y;
    const r0 = Math.max(0, Math.floor((y0 - rangePx) / this.rowH) - 1);
    const r1 = Math.min(this.rows - 1, Math.ceil((y1 + rangePx) / this.rowH));
    let best = null, bd = Infinity;
    for (let row = r0; row <= r1; row++) {
      const c0 = Math.max(0, Math.floor((x0 - rangePx) / this.S) - 1);
      const c1 = Math.min(this.cols(row) - 1, Math.ceil((x1 + rangePx) / this.S));
      for (let col = c0; col <= c1; col++) {
        const c = this.centerOf(col, row);
        const dx = Math.max(x0 - c.x, 0, c.x - x1);
        const dy = Math.max(y0 - c.y, 0, c.y - y1);
        if (Math.hypot(dx, dy) > rangePx + 0.001) continue;
        if (!this.free(col, row, e)) continue;
        const dd = (c.x - e.x) ** 2 + (c.y - e.y) ** 2;
        if (dd < bd) { bd = dd; best = { col, row }; }
      }
    }
    return best;
  },

  // Free hex hugging a structure's footprint, nearest to (fcol,frow).
  // Widens ring by ring when the edge is crowded, so units queue nearby.
  bestAdjacent(s, fcol, frow, self) {
    const T = CONFIG.TILE;
    const from = this.centerOf(fcol, frow);
    for (let ring = 1; ring <= 5; ring++) {
      const maxD = T * (ring + 0.10);
      const minD = ring === 1 ? -1 : T * (ring - 0.90);
      const y0 = s.ty * T - maxD, y1 = (s.ty + s.h) * T + maxD;
      const r0 = Math.max(0, Math.floor(y0 / this.rowH) - 1);
      const r1 = Math.min(this.rows - 1, Math.ceil(y1 / this.rowH));
      let best = null, bd = Infinity;
      for (let row = r0; row <= r1; row++) {
        const c0 = Math.max(0, Math.floor((s.tx * T - maxD) / this.S) - 1);
        const c1 = Math.min(this.cols(row) - 1, Math.ceil(((s.tx + s.w) * T + maxD) / this.S));
        for (let col = c0; col <= c1; col++) {
          const d = this.distToRect(col, row, s);
          if (d > maxD || d <= minD) continue;
          if (!this.free(col, row, self)) continue;
          const c = this.centerOf(col, row);
          const dd = (c.x - from.x) ** 2 + (c.y - from.y) ** 2;
          if (dd < bd) { bd = dd; best = { col, row }; }
        }
      }
      if (best) return best;
    }
    return null;
  },
};
