# Base-repo friction notes

Notes taken while forking the `RTS-mobile-test` base into this pure
mining/evacuation game. These are the spots where the base repo made the
transformation harder than it needed to be, plus what would make the *next*
fork (and the planned features — seeded random maps, passable/impassable
terrain, AI competitors) cheaper. Roughly ordered by payoff.

## 1. The module list is duplicated in three places

Adding or removing one module means editing all of:

- the `<script>` tags in `index.html` (with the right load order),
- the `FILES` array in `tests/unit/run.js`, and
- the `__exports({ ... })` global list in the same file.

Deleting `ai.js` here meant touching all three, and they drift silently — a
missed entry fails only at runtime/test time. **Fix:** a single
`js/manifest.js` array of module names, consumed by a tiny loader in
`index.html` and by the unit runner. One edit, no drift.

## 2. The `?v=N` cache-buster is manual and repo-wide

Every JS/CSS change requires bumping `?v=N` on ~15 lines of `index.html`, or
phones mix a fresh `index.html` with stale cached scripts and crash at
startup. This is a manual step with a nasty, hard-to-reproduce failure mode.
**Fix:** derive the version once (a `VERSION` constant, or the loader appending
a single shared token) so there's exactly one thing to bump — or let the
manifest loader from (1) stamp it.

## 3. Cross-cutting systems live hardcoded in `Sim`, with no plug-in seam

The type registry is a genuinely nice extension point for *entities* — adding
the rocket/shield/board behavior was one entry each in `types.js`. But
*systems* (combat, upgrades/research, and now the nova radiation field) have no
equivalent seam: they're methods baked into `Sim` (`damage`, `findTarget`,
`attackDamage`, `startResearch`, `tickResearch`) and a `tick()` loop that
hardcodes which ones run. Removing combat meant surgery on `Sim` core, and
adding the nova meant editing the same `tick()`.

**Fix:** a small **systems registry** — per-tick global updaters registered the
way types are (`Sim.systems = [radiation, ai, …]`, each a `tick(dt)` plus
optional hooks). Then a game is "compose these entity types + these systems,"
`Sim` stays game-agnostic, and features become additive instead of invasive.
This is also the cheapest path to the roadmap's **AI competitors**: an AI
system drops in without touching the engine.

## 4. `Sim.hooks` is a fixed struct that every game must edit

New events (`boarded`, `novaKilled`) mean editing the `hooks` object in `sim.js`
*and* the wiring in `game.js`, and the old combat hooks (`attack`, `destroyed`,
`researched`) had to be deleted from core. **Fix:** a tiny emitter
(`Sim.on(event, cb)` / `Sim.emit(event, …)`) so features add events without
editing the engine's hook list.

## 5. No map-generation seam and no shared seeded RNG

The start layout is imperative code in `Game.spawnStartLayout` (hardcoded
tiles), and there is no RNG utility at all — the unit tests each hand-roll
their own LCG. The roadmap wants **seeded random maps**, which has nowhere to
live today. **Fix:** a `MapGen.generate(seed) -> { terrain, placements }`
module plus one shared seeded RNG in the model layer. Bonus: seeded generation
makes e2e/unit tests deterministic for free.

## 6. Blocking is entangled with structure occupancy — no terrain layer

`GameMap.occupancy` stores *structure ids*, and "is this blocked?" is answered
by "is there a structure here?" There is no concept of impassable **terrain**.
The roadmap wants passable/impassable terrain, which currently has no home and
would tempt fake "terrain structures." **Fix:** a separate static blocked
bitmap that `Hex.free`/`structFree` and `Path.los` consult alongside structure
occupancy. Terrain then slots in without pretending to be an entity.

## 7. `owner` is effectively binary and the AI is a singleton

`AI.owner = 1` and `AI.pickTarget` assumes `owner === 0` is the player;
`Game` filters commands to `owner === 0` throughout. Supporting **multiple AI
competitors** means generalizing to an N-player model (a `players` list, one AI
instance per owner, "is hostile to" instead of "owner !== 0"). Worth doing
before the roadmap forces it.

## 8. e2e tests hardcoded world coordinates and framing

The original e2e suite baked in pixel coordinates (`center(672, 672)`,
`tapWorld(720, 679)`), a fixed entity count, and ore thresholds tied to the old
layout. Changing the map size / start layout broke ~4 test files that never
touched the behavior under test. While forking I rewrote them to **derive
coordinates from live entity positions** (query the base/veins/workers at
runtime, compute taps and select-boxes from those). That style survives layout
and balance changes; it's worth making the default in the base repo.

## 9. Config mixes engine constants with game balance

`CONFIG` is one flat object holding engine/platform constants (`TILE`, `MACRO`,
zoom limits, gesture map) next to game balance (costs, HP, timers). A new game
wants to rewrite the balance half and leave the engine half alone, but there's
no visible seam. **Fix:** split (or clearly section) `CONFIG.engine` vs
`CONFIG.game`, so a fork knows exactly what it's free to change.

## 10. `hp == null` overloads "indestructible"

Radiation had to special-case `hp == null` to skip buildings, and combat used
the same sentinel. An explicit `def.damageable` (or a `radiationSoak` field)
reads clearer than inferring intent from a null hp, and avoids a whole class of
"forgot to check null" bugs when adding new damage sources.

---

None of these blocked the fork — the type/command registry, the DOM-free model
split, and the headless test harness are genuinely good and did most of the
work. The friction is concentrated in the *systems* dimension (3, 4, 7) and in
the *manual bookkeeping* (1, 2), which is exactly where the roadmap features
will push next.
