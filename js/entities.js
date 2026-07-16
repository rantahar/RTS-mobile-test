// Entity registry: plain-data model, no DOM (rendering lives in js/view.js,
// wired up through the hooks below).
//
// Structures anchor on a top-left tile and occupy a w x h tile footprint.
// Units live at a world-px position and register on the micro tile their
// CENTER is on (GameMap.worldToTile). Hit-testing is done against the actual
// shape (circle / footprint rect), NOT the tile.
const Entities = {
  list: [],
  byId: new Map(),
  nextId: 1,

  // Outbound notifications; the app layer (Game) assigns these.
  hooks: {
    spawned(e) {},
    removed(e) {},
  },

  spawnStructure(type, tx, ty, owner = 0) {
    const def = Types[type];
    const T = CONFIG.TILE;
    const w = def.w, h = def.h;
    const e = {
      id: this.nextId++,
      kind: 'structure',
      type, def,
      owner: def.neutral ? null : owner,
      tx, ty, w, h,
      x: (tx + w / 2) * T,
      y: (ty + h / 2) * T,
    };
    // Mark footprint tiles occupied (pathfinding obstacles).
    for (let y = ty; y < ty + h; y++)
      for (let x = tx; x < tx + w; x++)
        if (GameMap.inBounds(x, y)) GameMap.occupancy[GameMap.idx(x, y)] = e.id;

    this.list.push(e);
    this.byId.set(e.id, e);
    this.hooks.spawned(e);
    return e;
  },

  // Spawn a unit on the free hex nearest to a world point.
  spawnUnit(type, wx, wy, owner = 0) {
    const def = Types[type];
    let h = Hex.fromWorld(wx, wy);
    if (!h) return null;
    if (!Hex.free(h.col, h.row, null)) h = Hex.nearestFree(h.col, h.row, null, null);
    if (!h) return null;
    const c = Hex.centerOf(h.col, h.row);
    const t = GameMap.worldToTile(c.x, c.y);
    const e = {
      id: this.nextId++,
      kind: 'unit',
      type, def,
      owner,
      x: c.x, y: c.y,
      hex: h,
      curHex: Hex.idx(h.col, h.row),
      tx: t.tx, ty: t.ty,
      r: CONFIG.TILE * def.radius,
      cmd: null,
      coarse: null,
      route: null,
      resHex: null,
    };
    GameMap.unitOcc.set(e.curHex, e.id);
    this.list.push(e);
    this.byId.set(e.id, e);
    this.hooks.spawned(e);
    return e;
  },

  // Remove a unit from the game (future: combat deaths).
  removeUnit(e) {
    for (const [idx, id] of GameMap.unitOcc) {
      if (id === e.id) GameMap.unitOcc.delete(idx);
    }
    this._drop(e);
  },

  // Remove a structure and free its footprint (future: destruction, depletion).
  removeStructure(e) {
    for (let y = e.ty; y < e.ty + e.h; y++)
      for (let x = e.tx; x < e.tx + e.w; x++) {
        const i = GameMap.idx(x, y);
        if (GameMap.inBounds(x, y) && GameMap.occupancy[i] === e.id)
          GameMap.occupancy[i] = null;
      }
    this._drop(e);
  },

  _drop(e) {
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    this.byId.delete(e.id);
    Selection.remove(e.id);
    this.hooks.removed(e);
  },

  // Hit-test a world point against entity shapes. Units win over structures.
  // slop (world px) expands targets so fingers can be sloppy.
  at(wx, wy, slop) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.kind !== 'unit') continue;
      if (Math.hypot(wx - e.x, wy - e.y) <= e.r + slop) return e;
    }
    const T = CONFIG.TILE;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.kind !== 'structure') continue;
      if (wx >= e.tx * T - slop && wx <= (e.tx + e.w) * T + slop &&
          wy >= e.ty * T - slop && wy <= (e.ty + e.h) * T + slop) return e;
    }
    return null;
  },

  // Box select: units whose center is inside the rect; if no units,
  // structures whose footprint intersects the rect.
  inRect(ax, ay, bx, by) {
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx);
    const y0 = Math.min(ay, by), y1 = Math.max(ay, by);
    const units = this.list.filter(e =>
      e.kind === 'unit' && e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1);
    if (units.length) return units;
    const T = CONFIG.TILE;
    return this.list.filter(e =>
      e.kind === 'structure' &&
      e.tx * T < x1 && (e.tx + e.w) * T > x0 &&
      e.ty * T < y1 && (e.ty + e.h) * T > y0);
  },
};
