// Global game configuration. Classic script: attaches CONFIG to window scope.
const CONFIG = {
  TILE: 32,        // world px per micro tile (1x1) at zoom = 1
  MACRO: 3,        // micro tiles per macro-tile edge (3x3 => log(n)-ish search later)
  MAP_W: 84,       // map width  in micro tiles
  MAP_H: 84,       // map height in micro tiles

  // Seeded map generation (js/mapgen.js): a number re-rolls the whole map
  // (terrain, ore, start spots) deterministically. Set to null for the
  // legacy hand-placed layout.
  MAP_SEED: 1337,

  MIN_ZOOM: 0.14,  // low enough to see the whole map (strategic view: later)
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

  SOLDIER_SPEED: 80,   // a bit slower than workers
  SOLDIER_COST: 15,    // ore to train a soldier at a barracks
  BARRACKS_COST: 30,   // ore to place a barracks construction site
  BARRACKS_BUILD: 10,  // worker-seconds of construction work to finish it

  // Combat
  WORKER_HP: 30,
  SOLDIER_HP: 40,
  SOLDIER_DMG: 4,      // damage per swing
  SOLDIER_RATE: 0.8,   // seconds between swings
  SOLDIER_RANGE: 2,    // attack range in hex spacings (range slots sit here)
  SOLDIER_AGGRO: 5,    // auto-acquire radius in hex spacings
  HQ_HP: 400,
  BARRACKS_HP: 220,
  LAB_HP: 160,
  LAB_COST: 25,
  LAB_BUILD: 8,        // worker-seconds to construct a lab

  // Upgrades (researched at the lab)
  WEAPON_BONUS: 2,       // +damage per weapons level
  WEAPON_COST_BASE: 30,  // level 1 cost; each level adds WEAPON_COST_STEP
  WEAPON_COST_STEP: 20,
  WEAPON_TIME: 12,       // research seconds per level

  // Enemy AI
  ENEMY_PRODUCE_S: 16, // seconds per enemy soldier
  ENEMY_WAVE: 3,       // idle soldiers needed before it attacks
  ENEMY_CAP: 6,        // max simultaneous enemy soldiers
};

// Derived helpers.
CONFIG.MAP_PX_W = CONFIG.MAP_W * CONFIG.TILE;
CONFIG.MAP_PX_H = CONFIG.MAP_H * CONFIG.TILE;
