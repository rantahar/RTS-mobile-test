# RTS Mobile Test

A tile-based RTS prototype for mobile browsers. Pure SVG outline/symbol
graphics, no build step, no dependencies — open `index.html` directly (works
over `file://`), or serve the directory statically.

## Controls

| Gesture / button | Action |
|---|---|
| Tap (nothing selected) | Select the tapped unit/structure (shape hit-test, finger slop) |
| Tap (something selected) | Command: ground = move, resource = mine, enemy = attack, own structure = go to |
| One-finger drag | Rubber-band box select (units first, else structures) |
| Tap and hold | Deselect |
| Two-finger drag / pinch | Pan / zoom the camera |
| Mouse wheel | Zoom (desktop) |
| ◎ / + / − | Recenter / zoom buttons |
| Macro / Hex | Debug overlays: 3×3 macro grid, unit hex lattice |
| ✕ | Deselect (long tap does the same) |

The second top row is the **group bar**: HQ / Prod / Lab / Idle (workers) /
Army select those groups; tapping again centers the camera on them. 1 / 2 / 3
are assignable — press-and-hold saves the current selection, tap recalls it.

The rest of the bottom bar is **dynamic** — buttons come from the selection:

| Selection | Buttons |
|---|---|
| Main building | Worker ◆10 (train) |
| Barracks | Soldier ◆15 (train) |
| Lab | Weapons L1/2/3 (research: +2 soldier damage per level) |
| Worker(s) | Barracks ◆30, Lab ◆25 (build), Stop |
| Any units | Stop |

Combat: soldiers attack on command (tap an enemy) and auto-engage hostiles
within their aggro radius. Attackers take free **range slots** around the
target — a group fans out along the range ring and units behind path around
the ones already fighting. The **enemy** (red camp, bottom-right) slowly
trains soldiers and attacks in waves of three; destroy its barracks to stop
it.

Building: tap the build button to arm it, then tap the map to place the
construction site (green flash = placed, red = invalid spot). The site is
paid up front, blocks the map immediately, and the selected workers walk
over and construct it (more workers build faster). Tapping an unfinished
site with workers selected resumes construction.

Gestures are remappable: `CONFIG.GESTURE_MAP` (js/config.js) maps recognized
gestures to named actions in js/actions.js.

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
  collision wait-and-repath (fine leg only); combat helpers (damage,
  findTarget, attackDamage) and upgrade research state
- `js/ai.js` — scripted opponent: trains soldiers on a timer, attacks in
  waves once enough stand idle

View / UI layer (DOM):

- `js/render.js` — static grid + debug overlays
- `js/view.js` — the ONLY module touching entity DOM; mirrors model state
  into SVG once per frame
- `js/actions.js` — named actions the gesture map points at
- `js/input.js` — pure gesture recognizer (tap/hold/drag1/drag2/wheel)
- `js/game.js` — composition root: wires hooks, owns the frame loop
  (Sim.tick → View.sync), HUD, command issuing, training

Cross-layer communication is one-directional: model modules expose hooks
(`Sim.hooks`, `Entities.hooks`, `Selection.onChange`) that game.js assigns —
model code never calls the UI.

## Tests

- `node tests/unit/run.js` — headless unit tests (no dependencies; loads the
  model modules in a fresh vm context per test)
- `node tests/e2e/run.js` — Playwright end-to-end tests (gestures, economy,
  pathfinding); needs `playwright` installed or preprovisioned
- CI runs both: `.github/workflows/tests.yml`

## Status / roadmap

Working: selection, command taps, group moves with hex-packed arrival,
two-level pathfinding with string pulling, unit collisions/queueing, mining
economy, training, worker-built barracks/lab + soldiers, selection-driven
action bar, combat with range slots + auto-acquire, weapons research, group
buttons, scripted enemy waves. Next candidates: strategic zoom-out view,
depleting resource nodes, win/lose detection, more unit and upgrade types.
