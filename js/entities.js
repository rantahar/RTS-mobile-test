// Entity registry + SVG rendering (pure outline/symbol graphics).
//
// Structures anchor on a top-left tile and occupy a w x h tile footprint.
// Units live at a world-px position and register on the micro tile their
// CENTER is on (GameMap.worldToTile). Hit-testing is done against the actual
// shape (circle / footprint rect), NOT the tile.
const Entities = {
  list: [],
  byId: new Map(),
  nextId: 1,
  layer: null,

  init() {
    this.layer = document.getElementById('layer-entities');
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
      el: null,
    };
    // Mark footprint tiles occupied (pathfinding obstacles later).
    for (let y = ty; y < ty + h; y++)
      for (let x = tx; x < tx + w; x++)
        if (GameMap.inBounds(x, y)) GameMap.occupancy[GameMap.idx(x, y)] = e.id;

    e.el = this.makeEl(e);
    this.layer.appendChild(e.el);
    this.list.push(e);
    this.byId.set(e.id, e);
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
      el: null,
    };
    GameMap.unitOcc.set(e.curHex, e.id);
    e.el = this.makeEl(e);
    this.layer.appendChild(e.el);
    this.list.push(e);
    this.byId.set(e.id, e);
    return e;
  },

  // Micro tile a unit currently registers on.
  tileOf(e) { return GameMap.worldToTile(e.x, e.y); },

  makeEl(e) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `entity ${e.kind} ${e.type}`);
    g.dataset.id = e.id;
    g.innerHTML = e.def.svg(e);
    this.place(e, g);
    return g;
  },

  place(e, el) {
    (el || e.el).setAttribute('transform', `translate(${e.x} ${e.y})`);
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
