// Global game configuration. Classic script: attaches CONFIG to window scope.
const CONFIG = {
  TILE: 32,        // world px per micro tile (1x1) at zoom = 1
  MACRO: 3,        // micro tiles per macro-tile edge (3x3 => log(n)-ish search later)
  MAP_W: 42,       // map width  in micro tiles (asteroid)
  MAP_H: 42,       // map height in micro tiles

  MIN_ZOOM: 0.22,  // low enough to see the whole asteroid
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

  // Economy
  START_ORE: 30,    // ore in the bank at the start
  WORKER_SPEED: 96, // world px per second (3 tiles/s)
  MINE_TIME: 1.2,   // seconds spent at the node per load
  CARRY: 5,         // ore per trip
  WORKER_COST: 10,  // ore to train a worker at the command center
  WORKER_HP: 30,    // radiation soak (see nova, below)

  // Escape rocket: worker-built; boarded workers are saved. Limited seats.
  ROCKET_COST: 40,      // ore to place the rocket construction site
  ROCKET_BUILD: 15,     // worker-seconds of construction to finish it
  ROCKET_CAPACITY: 6,   // seats — a full rocket refuses further boarders

  // Radiation shield: worker-built; a protective zone that cuts nova damage
  // for workers standing inside its radius (it "buys time" during the nova).
  SHIELD_COST: 30,      // ore to place the shield construction site
  SHIELD_BUILD: 10,     // worker-seconds to construct it
  SHIELD_RADIUS: 6,     // protection radius in tiles
  SHIELD_DMG_MULT: 0.2, // damage multiplier for shielded workers

  // Nova: the countdown to detonation, then a ramping radiation field. The
  // nova doesn't kill instantly — damage per second grows the longer it burns,
  // so it's a scramble to board the rocket, not a hard cutoff.
  NOVA_TIME: 300,   // seconds of countdown before the nova ignites
  RAD_BASE: 2,      // radiation damage/second the instant the nova ignites
  RAD_RAMP: 0.5,    // added damage/second for every second the nova burns
};

// Derived helpers.
CONFIG.MAP_PX_W = CONFIG.MAP_W * CONFIG.TILE;
CONFIG.MAP_PX_H = CONFIG.MAP_H * CONFIG.TILE;
CONFIG.SHIELD_RADIUS_PX = CONFIG.SHIELD_RADIUS * CONFIG.TILE;
