// Simulation engine: the tick loop, two-level movement, and collisions.
// Sim knows nothing about specific commands — each tick it dispatches
// unit.cmd to the handler the unit's TYPE defines for it
// (Types[type].commands[cmd.type], see js/types.js) and provides the
// movement primitives those handlers build on: travel, approachRect,
// blockedWait, stopUnit.
//
// Movement is two-level:
//   unit.coarse = [{x,y},...]  macro-grid waypoints for the whole trip,
//                              planned once per command (Path.coarse)
//   unit.route  = [{x,y},...]  smoothed small-grid leg to the next coarse
//                              waypoint (Path.fineRoute), capped at
//                              LEG_MAX_PX
// On collision only the fine leg is replanned — the coarse route survives.
// Collisions are hex-based: a unit owns the hex under its center
// (GameMap.unitOcc) and, while moving, reserves the hex a little ahead of it
// before entering. If that hex is held by someone else the unit waits
// REPATH_WAIT seconds, then replans the leg around them.
const Sim = {
  _last: null,
  // Outbound notifications; the app layer (Game) assigns these.
  hooks: {
    deposit(amount, unit) {}, // a worker delivered `amount` ore
  },
  REPATH_WAIT: 0.1,           // blocked "thinking time" before replanning the leg
  ADJACENT_PX: CONFIG.TILE * 1.10, // "standing at the structure" distance
  LEG_MAX_PX: null,           // max fine-leg length (< 9 hex units), set in start()
  MAX_LEG_FAILS: 3,           // consecutive failed legs before a full replan

  start() {
    this.LEG_MAX_PX = Hex.S * 8.5; // "coarse points less than 9 units away"
    requestAnimationFrame((ts) => this._frame(ts));
  },

  _frame(ts) {
    if (this._last == null) this._last = ts;
    const dt = Math.min((ts - this._last) / 1000, 0.05); // clamp tab-sleep jumps
    this._last = ts;
    this.tick(dt);
    requestAnimationFrame((t) => this._frame(t));
  },

  tick(dt) {
    for (const e of Entities.list) {
      if (e.kind === 'unit' && e.cmd) this.tickUnit(e, dt);
    }
  },

  // Dispatch the unit's command to the handler its type defines.
  tickUnit(e, dt) {
    const handler = e.def.commands && e.def.commands[e.cmd.type];
    if (handler) handler(e, e.cmd, dt);
    else this.stopUnit(e); // type doesn't understand this command
  },

  // Drive the unit through its coarse waypoints, planning one fine leg at a
  // time. Returns 'arrived' | 'moving' | 'blocked'.
  travel(e, c, dt) {
    if (!e.route || !e.route.length) {
      if (!e.coarse || !e.coarse.length) return 'arrived';
      if ((c.cool || 0) > 0) { c.cool -= dt; return 'blocked'; } // failed leg cooldown
      this.trimCoarse(e);
      const t = e.coarse[0];
      const h0 = Hex.fromWorld(t.x, t.y);
      const th = Hex.free(h0.col, h0.row, e) ? h0
               : Hex.nearestFree(h0.col, h0.row, e, null);
      const r = th && Path.fineRoute(e, th);
      if (!r || !r.length) {
        if (r && e.coarse.length === 1) { e.coarse = []; return 'arrived'; } // already there
        c.fails = (c.fails || 0) + 1;
        c.cool = this.REPATH_WAIT;
        if (c.fails > this.MAX_LEG_FAILS) { c.fails = 0; e.coarse = null; } // full replan
        return 'blocked';
      }
      c.fails = 0;
      e.route = r;
    }
    const st = this.moveAlong(e, dt);
    if (st === 'arrived') {
      e.coarse.shift(); // leg complete
      return e.coarse.length ? 'moving' : 'arrived';
    }
    return st;
  },

  // Skip ahead in the coarse list: drop the current target while the next
  // one is within the leg cap and visible past structures. Keeps legs short
  // (collision repairs stay cheap) without zigzagging through every macro
  // center on open ground.
  trimCoarse(e) {
    while (e.coarse.length > 1) {
      const nxt = e.coarse[1];
      if (Math.hypot(nxt.x - e.x, nxt.y - e.y) <= this.LEG_MAX_PX &&
          Path.los({ x: e.x, y: e.y }, nxt, e, false)) e.coarse.shift();
      else break;
    }
  },

  // Advance along the unit's smoothed fine leg. Returns 'arrived' | 'moving'
  // | 'blocked'. Before moving, the hex a bit ahead of the unit is reserved
  // so two units never converge on the same spot.
  moveAlong(e, dt) {
    if (!e.route || !e.route.length) return 'arrived';
    const wp = e.route[0];
    const dx = wp.x - e.x, dy = wp.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5) {
      e.route.shift();
      return e.route.length ? 'moving' : 'arrived';
    }
    const ux = dx / d, uy = dy / d;

    // Reserve the hex we're heading into (lookahead just over half spacing).
    const la = Math.min(d, Hex.S * 0.6);
    const h = Hex.fromWorld(e.x + ux * la, e.y + uy * la);
    const idx = Hex.idx(h.col, h.row);
    if (idx !== e.curHex) {
      const holder = GameMap.unitOcc.get(idx);
      if (holder != null && holder !== e.id) return 'blocked';
      this.reserve(e, idx);
    }

    const step = Math.min((e.def.speed || CONFIG.WORKER_SPEED) * dt, d);
    e.x += ux * step;
    e.y += uy * step;
    if (step >= d - 0.001) { e.x = wp.x; e.y = wp.y; e.route.shift(); }
    this.updateHexReg(e);
    Entities.place(e);
    return e.route.length ? 'moving' : 'arrived';
  },

  // Hold at most one hex reservation beyond the one we stand on.
  reserve(e, idx) {
    if (e.resHex != null && e.resHex !== idx && e.resHex !== e.curHex &&
        GameMap.unitOcc.get(e.resHex) === e.id) {
      GameMap.unitOcc.delete(e.resHex);
    }
    e.resHex = idx;
    GameMap.unitOcc.set(idx, e.id);
  },

  // Approach a structure until standing within ADJACENT_PX of its footprint.
  // Crowded edges make units park a ring out and retry, forming a loose queue.
  approachRect(e, c, s, dt) {
    if (this.distToRect(e, s) <= this.ADJACENT_PX) {
      this.clearPath(e);
      c.wait = 0;
      c.fails = 0;
      return true;
    }
    if (!e.coarse || !e.coarse.length) {
      const t = Hex.bestAdjacent(s, e.hex.col, e.hex.row, e);
      if (!t) { this.blockedWait(e, c, dt); return false; } // fully crowded: retry
      e.coarse = Path.coarse(e, t);
    }
    const st = this.travel(e, c, dt);
    if (st !== 'moving') this.blockedWait(e, c, dt); // blocked, or arrived short
    return false;
  },

  distToRect(e, s) {
    const T = CONFIG.TILE;
    const dx = Math.max(s.tx * T - e.x, 0, e.x - (s.tx + s.w) * T);
    const dy = Math.max(s.ty * T - e.y, 0, e.y - (s.ty + s.h) * T);
    return Math.hypot(dx, dy);
  },

  blockedWait(e, c, dt) {
    c.wait = (c.wait || 0) + dt;
    if (c.wait > this.REPATH_WAIT) {
      c.wait = 0;
      this.clearLeg(e); // replan just the fine leg; the coarse route survives
    }
  },

  // Keep the unit registered on the hex under its center (and the micro tile,
  // per the original spec), releasing the hex it left.
  updateHexReg(e) {
    const h = Hex.fromWorld(e.x, e.y);
    const cur = Hex.idx(h.col, h.row);
    if (e.curHex !== cur) {
      if (GameMap.unitOcc.get(e.curHex) === e.id) GameMap.unitOcc.delete(e.curHex);
      e.hex = h;
      e.curHex = cur;
      GameMap.unitOcc.set(cur, e.id);
    }
    const t = GameMap.worldToTile(e.x, e.y);
    e.tx = t.tx; e.ty = t.ty;
  },

  // Drop the current fine leg and any hex reservation beyond where the unit
  // stands. The coarse route is kept.
  clearLeg(e) {
    e.route = null;
    e.resHex = null;
    for (const [idx, id] of GameMap.unitOcc) {
      if (id === e.id && idx !== e.curHex) GameMap.unitOcc.delete(idx);
    }
  },

  // Full clear: fine leg AND coarse route (new command, stop, arrival).
  clearPath(e) {
    this.clearLeg(e);
    e.coarse = null;
  },

  stopUnit(e) {
    e.cmd = null;
    this.clearPath(e);
  },

  setCarrying(e, on) {
    e.carrying = on;
    e.el.classList.toggle('carrying', on);
  },
};
