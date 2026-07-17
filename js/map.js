// Tile map model. Two levels:
//   - micro tiles: 1x1, the fundamental grid. Units register on the micro tile
//     their CENTER sits on.
//   - macro tiles: CONFIG.MACRO x CONFIG.MACRO blocks of micro tiles. Used later
//     for hierarchical pathfinding / targeting so search is ~log(n) in distance.
const GameMap = {
  w: CONFIG.MAP_W,
  h: CONFIG.MAP_H,
  macro: CONFIG.MACRO,
  macroW: Math.ceil(CONFIG.MAP_W / CONFIG.MACRO),
  macroH: Math.ceil(CONFIG.MAP_H / CONFIG.MACRO),

  // Per micro tile: which structure (id) occupies it, or null. Pathfinding
  // obstacles.
  occupancy: null,
  // Per micro tile: impassable natural terrain (rock). 0 = passable, 1 = wall.
  // Static for the game — set once by the map generator (js/mapgen.js). Kept
  // separate from `occupancy` so terrain isn't confused with an entity.
  terrain: null,
  hasTerrain: false, // fast path: skip terrain checks when the map is all open
  // Hex idx (see js/hex.js) -> unit id. A unit owns the hex under its center
  // plus (while moving) the next hex it has reserved. Units block each other.
  unitOcc: null,

  init() {
    this.occupancy = new Array(this.w * this.h).fill(null);
    this.terrain = new Uint8Array(this.w * this.h);
    this.hasTerrain = false;
    this.unitOcc = new Map();
  },

  // Install a terrain bitmap (Uint8Array, length w*h). Recomputes hasTerrain.
  setTerrain(bitmap) {
    this.terrain = bitmap;
    this.hasTerrain = bitmap.some(v => v !== 0);
  },

  inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  },

  idx(tx, ty) { return ty * this.w + tx; },

  // Is this tile blocked for pathing — a structure footprint OR wall terrain?
  // The single question walkability checks ask (Hex.structFree, Path.structFree).
  tileBlocked(tx, ty) {
    const i = ty * this.w + tx;
    return this.occupancy[i] != null || this.terrain[i] !== 0;
  },

  // Does the world-space segment a->b cross any wall tile? Marches the center
  // line at sub-tile steps. Structures are handled separately (Path.los rect
  // tests); this only asks about terrain, and only when hasTerrain is set.
  segHitsTerrain(a, b) {
    if (!this.hasTerrain) return false;
    const T = CONFIG.TILE;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len / (T * 0.4)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const tx = Math.floor((a.x + dx * t) / T);
      const ty = Math.floor((a.y + dy * t) / T);
      if (this.inBounds(tx, ty) && this.terrain[this.idx(tx, ty)] !== 0) return true;
    }
    return false;
  },

  // World px <-> micro tile coords.
  worldToTile(wx, wy) {
    return { tx: Math.floor(wx / CONFIG.TILE), ty: Math.floor(wy / CONFIG.TILE) };
  },
  tileToWorldCenter(tx, ty) {
    return { x: (tx + 0.5) * CONFIG.TILE, y: (ty + 0.5) * CONFIG.TILE };
  },

  // Micro tile -> its macro tile coords.
  microToMacro(tx, ty) {
    return { mx: Math.floor(tx / this.macro), my: Math.floor(ty / this.macro) };
  },
};

GameMap.init();
