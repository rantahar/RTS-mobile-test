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

  spawnStructure(type, tx, ty, w, h) {
    const T = CONFIG.TILE;
    const e = {
      id: this.nextId++,
      kind: 'structure',
      type, tx, ty, w, h,
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

  spawnUnit(type, tx, ty) {
    const c = GameMap.tileToWorldCenter(tx, ty);
    const e = {
      id: this.nextId++,
      kind: 'unit',
      type,
      x: c.x, y: c.y,
      r: CONFIG.TILE * 0.42,
      el: null,
    };
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
    g.innerHTML = this.svgFor(e);
    this.place(e, g);
    return g;
  },

  place(e, el) {
    (el || e.el).setAttribute('transform', `translate(${e.x} ${e.y})`);
  },

  // SVG symbol content, centered on (0,0) = entity center.
  svgFor(e) {
    const T = CONFIG.TILE;
    if (e.type === 'hq') {
      const h = (e.w * T) / 2;      // half footprint size in px
      const i = h - 6;              // outline inset
      return `
        <rect class="selmark" x="${-h - 4}" y="${-h - 4}" width="${2 * h + 8}" height="${2 * h + 8}" rx="8"/>
        <rect class="shape" x="${-i}" y="${-i}" width="${2 * i}" height="${2 * i}" rx="10"/>
        <rect class="detail" x="-16" y="${i - 32}" width="32" height="32" rx="4"/>
        <path class="detail" d="M0 -52 V 8"/>
        <path class="flag" d="M0 -52 L36 -41 L0 -30 Z"/>`;
    }
    if (e.type === 'node') {
      const h = (e.w * T) / 2;
      return `
        <rect class="selmark" x="${-h - 4}" y="${-h - 4}" width="${2 * h + 8}" height="${2 * h + 8}" rx="6"/>
        <polygon class="shape" points="0,-26 15,-2 0,22 -15,-2"/>
        <polygon class="shape" points="-26,8 -16,-5 -6,8 -16,20"/>
        <polygon class="shape" points="10,12 20,1 29,12 20,22"/>`;
    }
    if (e.type === 'worker') {
      const r = e.r;
      return `
        <circle class="selmark" r="${r + 4}"/>
        <circle class="shape" r="${r}"/>
        <path class="detail" d="M-7 8 L7 -7"/>
        <path class="detail" d="M-3 -11 Q9 -13 12 -2"/>
        <circle class="cargo" cx="${r * 0.55}" cy="${r * 0.55}" r="4.5"/>`;
    }
    return `<circle class="shape" r="10"/>`;
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
