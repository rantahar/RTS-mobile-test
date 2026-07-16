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
  // Tile idx -> unit id. A unit owns the tile under its center plus (while
  // moving) the next tile it has reserved. Units block each other.
  unitOcc: null,

  init() {
    this.occupancy = new Array(this.w * this.h).fill(null);
    this.unitOcc = new Map();
  },

  inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  },

  idx(tx, ty) { return ty * this.w + tx; },

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
