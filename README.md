# Nova Miner

A tile-based mining/evacuation game for mobile browsers. A nova is about to
tear through your asteroid — mine ore, grow your crew, and get as many workers
as you can aboard the escape rocket before it detonates. Pure SVG
outline/symbol graphics, no build step, no dependencies — open `index.html`
directly (works over `file://`), or serve the directory statically.

## Goal

A **five-minute countdown** ticks down to the nova. When it hits zero the nova
**ignites** and a radiation field starts burning — and it grows stronger the
longer it burns, so it's a scramble, not a hard cutoff. The game ends once
every worker is either **saved** (aboard a rocket) or lost to the radiation.

**Your score is the number of workers saved.**

## The three buildings

| Building | Role |
|---|---|
| **Command Center** | Your start building. Trains workers (◆10) and is where mined ore is banked. |
| **Escape Rocket** | Worker-built (◆40). Send workers to it to **board** — each one is saved. Limited to 6 seats, so build more than one to save a bigger crew. |
| **Radiation Shield** | Worker-built (◆30). Projects a protective radius that cuts nova damage to a fifth for any worker standing inside it — that's how you "buy time" once the nova lights up. |

Workers unshielded survive only a handful of seconds in the ignited nova;
under a shield they last far longer. Line your evacuation route with shields.

## Controls

| Gesture / button | Action |
|---|---|
| Tap (nothing selected) | Select the tapped worker/building (shape hit-test, finger slop) |
| Tap (something selected) | Command: ground = move, ore vein = mine, rocket = board, own building = go to |
| One-finger drag | Rubber-band box select (workers first, else buildings) |
| Tap and hold | Deselect |
| Two-finger drag / pinch | Pan / zoom the camera |
| Mouse wheel | Zoom (desktop) |
| ◎ / + / − | Recenter / zoom buttons |
| Macro / Hex | Debug overlays: 3×3 macro grid, unit hex lattice |
| ✕ | Deselect (long tap does the same) |

The second top row is the **group bar**: Base / Idle / Rocket / Shield select
those groups; tapping again centers the camera on them. 1 / 2 / 3 are
assignable — press-and-hold saves the current selection, tap recalls it.

The rest of the bottom bar is **dynamic** — buttons come from the selection:

| Selection | Buttons |
|---|---|
| Command Center | Worker ◆10 (train) |
| Worker(s) | Escape Rocket ◆40, Radiation Shield ◆30 (build), Stop |
| Any workers | Stop |

Building: tap a build button to arm it, then tap the map to place the
construction site (green flash = placed, red = invalid spot). The site is paid
up front, blocks the map immediately, and the selected workers walk over and
construct it (more workers build faster).

The top bar shows the **nova countdown** (`☢ m:ss`, red once it ignites), your
ore (◆), and your saved-worker score (★).

Gestures are remappable: `CONFIG.GESTURE_MAP` (js/config.js) maps recognized
gestures to named actions in js/actions.js. Balance (nova time, radiation
ramp, shield strength, costs, rocket seats) lives in js/config.js.

## Architecture

Plain classic scripts; **the `<script>` order in index.html is load-bearing**
(config first, model modules, then view/UI, then game.js). Keep
`tests/unit/run.js`'s file list in sync when adding a module.

The script/style URLs carry a `?v=N` cache buster — **bump N in every line of
index.html whenever any js/css file changes**. Without it, a browser can pair
a fresh index.html with stale cached scripts and crash at startup.

Model layer (DOM-free, headless-testable):

- `js/config.js` — all tuning constants + the gesture→action map
- `js/camera.js` — world/screen transform, zoom, map clamping
- `js/map.js` — square tile map: structure occupancy, micro→macro (3×3) tiles
- `js/hex.js` — staggered hex lattice for UNIT positions (odd-r offset,
  row spacing √3/2·tile); unit occupancy queries, nearest-free/adjacent search
- `js/path.js` — two-level pathfinding: coarse macro-tile A* waypoints stored
  on the unit, short hex-grid fine legs, string-pulling (LOS respects
  structure margins and, locally, occupied/reserved hexes)
- `js/types.js` — **entity type registry**: each type defines its data
  (footprint/radius/speed/cost/name), its SVG symbol, its per-tick command
  handlers (`commands`), and `orderAt` (what a command tap should do).
  Adding a unit or building is one entry here.
- `js/entities.js` — entity registry (plain data), spawn/remove, hit-tests
- `js/selection.js` — selected-id set
- `js/sim.js` — simulation engine: dispatches `unit.cmd` to the type's
  handler; movement primitives (travel/approachRect), hex reservations,
  collision wait-and-repath (fine leg only); mining deposits, boarding, and
  the **nova** (radiation ramp + shield damage reduction)

View / UI layer (DOM):

- `js/render.js` — static grid + debug overlays
- `js/view.js` — the ONLY module touching entity DOM; mirrors model state
  into SVG once per frame
- `js/actions.js` — named actions the gesture map points at
- `js/input.js` — pure gesture recognizer (tap/hold/drag1/drag2/wheel)
- `js/game.js` — composition root: wires hooks, owns the frame loop
  (clock → Sim.tick → View.sync), the HUD, command issuing, training, and the
  results screen

Cross-layer communication is one-directional: model modules expose hooks
(`Sim.hooks`, `Entities.hooks`, `Selection.onChange`) that game.js assigns —
model code never calls the UI.

## Tests

- `node tests/unit/run.js` — headless unit tests (no dependencies; loads the
  model modules in a fresh vm context per test)
- `node tests/e2e/run.js` — Playwright end-to-end tests (gestures, economy,
  pathfinding, build/board, nova end-game); needs `playwright` installed or
  preprovisioned. e2e coordinates are derived from live entity positions, so
  they survive layout/config tweaks.
- CI runs both: `.github/workflows/tests.yml`

## Status / roadmap

Working: selection, command taps, group moves with hex-packed arrival,
two-level pathfinding with string pulling, unit collisions/queueing, mining
economy, worker training, worker-built escape rockets (limited seats) and
radiation shields (damage-reduction zones), the nova countdown + ramping
radiation field, and the saved-workers results screen.

Planned for the full version:

- **Seeded random maps** — a `MapGen.generate(seed)` producing the asteroid
  layout deterministically (tests already hand-roll a seeded RNG).
- **Passable / impassable terrain** — a static blocked-terrain layer that
  pathfinding consults, distinct from structure occupancy.
- **AI competitors** — rival miners racing for the same ore and rockets
  (see `docs/base-repo-friction.md` for the refactors that make this cheap).
