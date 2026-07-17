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

  // underConstruction: spawn as a construction site — it blocks the map like
  // a finished building, but must be built up by workers (see the worker's
  // `build` command) before it works. Sim.completeStructure finishes it.
  spawnStructure(type, tx, ty, owner = 0, underConstruction = false) {
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
      underConstruction,
      progress: 0, // worker-seconds of construction done (sites only)
      boarded: 0,  // seats taken (escape rocket only)
      hp: def.hp || null, // null = indestructible (buildings don't take radiation)
      maxHp: def.hp || null,
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
      hp: def.hp || null,
      maxHp: def.hp || null,
    };
    GameMap.unitOcc.set(e.curHex, e.id);
    this.list.push(e);
    this.byId.set(e.id, e);
    this.hooks.spawned(e);
    return e;
  },

  // Spawn the unit a building's type trains, on the best free hex by its
  // "door" (bottom edge). Payment is the caller's business (Game). Returns
  // the unit, or null if walled in.
  trainAt(b) {
    const hc = Hex.fromWorld(b.x, b.y + (b.h / 2) * CONFIG.TILE);
    const h = hc && Hex.bestAdjacent(b, hc.col, hc.row, null);
    if (!h) return null;
    const c = Hex.centerOf(h.col, h.row);
    return this.spawnUnit(b.def.trains, c.x, c.y, b.owner);
  },

  // Can a structure of this type be placed with its top-left tile at tx,ty?
  // Footprint must be in bounds and unoccupied, and no unit may be standing
  // inside it (it would be walled in).
  canPlace(type, tx, ty) {
    const def = Types[type];
    for (let y = ty; y < ty + def.h; y++)
      for (let x = tx; x < tx + def.w; x++) {
        if (!GameMap.inBounds(x, y)) return false;
        if (GameMap.occupancy[GameMap.idx(x, y)] != null) return false;
      }
    const T = CONFIG.TILE;
    const x0 = tx * T, y0 = ty * T, x1 = (tx + def.w) * T, y1 = (ty + def.h) * T;
    for (const e of this.list) {
      if (e.kind !== 'unit') continue;
      if (e.x > x0 - e.r && e.x < x1 + e.r && e.y > y0 - e.r && e.y < y1 + e.r) return false;
    }
    return true;
  },

  // Remove a unit from the game (boarding a rocket, or burning up in the nova).
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

  // Box select: the player's units win, then structures, then any other
  // units (info only — commands are filtered to owner 0 in Game).
  inRect(ax, ay, bx, by) {
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx);
    const y0 = Math.min(ay, by), y1 = Math.max(ay, by);
    const units = this.list.filter(e =>
      e.kind === 'unit' && e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1);
    const own = units.filter(e => e.owner === 0);
    if (own.length) return own;
    const T = CONFIG.TILE;
    const structs = this.list.filter(e =>
      e.kind === 'structure' &&
      e.tx * T < x1 && (e.tx + e.w) * T > x0 &&
      e.ty * T < y1 && (e.ty + e.h) * T > y0);
    return structs.length ? structs : units;
  },
};
