# RTS Mobile Test

A tile-based RTS prototype for mobile browsers. Pure SVG outline/symbol
graphics, no build step, no dependencies — open `index.html` directly (works
over `file://`), or serve the directory statically.

## Controls

| Gesture / button | Action |
|---|---|
| Tap (nothing selected) | Select the tapped unit/structure (shape hit-test, finger slop) |
| Tap (something selected) | Command: ground = move, resource = mine, structure/unit = go to |
| One-finger drag | Rubber-band box select (units first, else structures) |
| Tap and hold | Deselect |
| Two-finger drag / pinch | Pan / zoom the camera |
| Mouse wheel | Zoom (desktop) |
| ◎ / + / − | Recenter / zoom buttons |
| Macro / Hex | Debug overlays: 3×3 macro grid, unit hex lattice |
| Worker ◆10 | Train a worker at the selected main building |
| Stop / ✕ | Halt selected units' commands / deselect |

Gestures are remappable: `CONFIG.GESTURE_MAP` (js/config.js) maps recognized
gestures to named actions in js/actions.js.

## Architecture

Plain classic scripts; **the `<script>` order in index.html is load-bearing**
(config first, model modules, then view/UI, then game.js). Keep
`tests/unit/run.js`'s file list in sync when adding a module.

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
  collision wait-and-repath (fine leg only)

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
economy, training. Next candidates: army unit + attack (range-slot arcs),
control groups, depleting resource nodes, build placement.
