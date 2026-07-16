// Global game configuration. Classic script: attaches CONFIG to window scope.
const CONFIG = {
  TILE: 32,        // world px per micro tile (1x1) at zoom = 1
  MACRO: 3,        // micro tiles per macro-tile edge (3x3 => log(n)-ish search later)
  MAP_W: 42,       // map width  in micro tiles
  MAP_H: 42,       // map height in micro tiles

  MIN_ZOOM: 0.35,
  MAX_ZOOM: 2.5,
  ZOOM_STEP: 1.25, // multiplier per +/- button press

  // Gestures
  TAP_SLOP: 10,    // screen px of movement before a tap becomes a drag
  HOLD_MS: 500,    // press duration for tap-and-hold

  // Gesture -> action mapping. Input only recognizes gestures; what they DO
  // is looked up here and implemented in js/actions.js. Remap freely.
  //   tap:   quick press+release            (fire)
  //   hold:  press held still >= HOLD_MS    (fire)
  //   drag1: one-finger drag                (start/update/end/cancel)
  //   drag2: two-finger drag + pinch        (start/update/end/cancel)
  GESTURE_MAP: {
    tap: 'smartTap',
    hold: 'deselect',
    drag1: 'boxSelect',
    drag2: 'camera',
    wheel: 'zoom',
  },

  // Units / economy
  WORKER_SPEED: 96, // world px per second (3 tiles/s)
  MINE_TIME: 1.2,   // seconds spent at the node per load
  CARRY: 5,         // ore per trip
  WORKER_COST: 10,  // ore to train a worker at the main building
};

// Derived helpers.
CONFIG.MAP_PX_W = CONFIG.MAP_W * CONFIG.TILE;
CONFIG.MAP_PX_H = CONFIG.MAP_H * CONFIG.TILE;
