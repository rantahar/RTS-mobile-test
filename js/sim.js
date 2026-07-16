// Simulation loop: pathfinding movement, collisions, command execution.
//
// Unit commands (unit.cmd):
//   { type: 'move', col, row }           walk to a hex (or nearest free one)
//   { type: 'moveRect', targetId }       walk next to a structure
//   { type: 'mine', nodeId, hqId, phase, t }
//       phase: 'toNode' -> 'mining' -> 'toHq' -> repeat
//
// Movement follows a SMOOTHED route (unit.route = [{x,y},...]): the A* hex
// path is string-pulled against structure footprints, so units walk straight
// and only turn at obstacle corners (Path.route). Collisions stay hex-based:
// a unit owns the hex under its center (GameMap.unitOcc) and, while moving,
// reserves the hex a little ahead of it before entering. If that hex is held
// by someone else the unit waits ~0.5s, then replans around them.
const Sim = {
  _last: null,
  REPATH_WAIT: 0.5,           // seconds to wait when blocked before replanning
  ADJACENT_PX: CONFIG.TILE * 1.10, // "standing at the structure" distance

  start() {
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

  tickUnit(e, dt) {
    const c = e.cmd;

    if (c.type === 'move') {
      if (!e.route) {
        const dest = Hex.nearestFree(c.col, c.row, e, null);
        const r = dest && Path.route(e, dest);
        if (!r) { this.stopUnit(e); return; } // unreachable: give up
        e.route = r;
      }
      const st = this.moveAlong(e, dt);
      if (st === 'arrived') this.stopUnit(e);
      else if (st === 'blocked') this.blockedWait(e, c, dt);

    } else if (c.type === 'moveRect') {
      const s = Entities.byId.get(c.targetId);
      if (!s) { this.stopUnit(e); return; }
      if (this.approachRect(e, c, s, dt)) this.stopUnit(e);

    } else if (c.type === 'mine') {
      const node = Entities.byId.get(c.nodeId);
      if (!node) { this.stopUnit(e); return; }

      if (c.phase === 'toNode') {
        if (this.approachRect(e, c, node, dt)) {
          c.phase = 'mining';
          c.t = CONFIG.MINE_TIME;
        }
      } else if (c.phase === 'mining') {
        c.t -= dt;
        if (c.t <= 0) {
          this.setCarrying(e, true);
          c.phase = 'toHq';
        }
      } else if (c.phase === 'toHq') {
        const hq = Entities.byId.get(c.hqId);
        if (!hq) { this.stopUnit(e); return; } // nowhere to deposit; stay carrying
        if (this.approachRect(e, c, hq, dt)) {
          this.setCarrying(e, false);
          Game.addOre(CONFIG.CARRY);
          c.phase = 'toNode';
        }
      }
    }
  },

  // Advance along the unit's smoothed route. Returns 'arrived' | 'moving' |
  // 'blocked'. Before moving, the hex a bit ahead of the unit is reserved so
  // two units never converge on the same spot.
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

    const step = Math.min(CONFIG.WORKER_SPEED * dt, d);
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
      return true;
    }
    if (!e.route) {
      const t = Hex.bestAdjacent(s, e.hex.col, e.hex.row, e);
      e.route = (t && Path.route(e, t)) || [];
    }
    const st = this.moveAlong(e, dt);
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
      this.clearPath(e); // forces a replan around whatever is in the way
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

  // Drop the unit's route and any hex reservation beyond where it stands.
  clearPath(e) {
    e.route = null;
    e.resHex = null;
    for (const [idx, id] of GameMap.unitOcc) {
      if (id === e.id && idx !== e.curHex) GameMap.unitOcc.delete(idx);
    }
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
