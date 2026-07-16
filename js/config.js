// Global game configuration. Classic script: attaches CONFIG to window scope.
const CONFIG = {
  TILE: 32,        // world px per micro tile (1x1) at zoom = 1
  MACRO: 3,        // micro tiles per macro-tile edge (3x3 => log(n)-ish search later)
  MAP_W: 42,       // map width  in micro tiles
  MAP_H: 42,       // map height in micro tiles

  MIN_ZOOM: 0.35,
  MAX_ZOOM: 2.5,
  ZOOM_STEP: 1.25, // multiplier per +/- button press
};

// Derived helpers.
CONFIG.MAP_PX_W = CONFIG.MAP_W * CONFIG.TILE;
CONFIG.MAP_PX_H = CONFIG.MAP_H * CONFIG.TILE;
