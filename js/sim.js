// Simulation loop: pathfinding movement, collisions, command execution.
//
// Unit commands (unit.cmd):
//   { type: 'move', tx, ty }             walk to a tile (or nearest free one)
//   { type: 'moveRect', targetId }       walk next to a structure
//   { type: 'mine', nodeId, hqId, phase, t }
//       phase: 'toNode' -> 'mining' -> 'toHq' -> repeat
//
// Movement is tile-to-tile along an A* path (unit.path). Collisions: a unit
// owns the tile under its center (GameMap.unitOcc) and reserves the next
// waypoint tile before entering it. If the next tile is held by someone else
// the unit waits ~0.5s, then replans around them.
const Sim = {
  _last: null,
  REPATH_WAIT: 0.5, // seconds to wait when blocked before replanning

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
      if (!e.path) {
        const dest = Path.nearestFreeTile(c.tx, c.ty, e, null);
        const p = dest && Path.find(e.tx, e.ty, dest.tx, dest.ty, e);
        if (!p) { this.stopUnit(e); return; } // unreachable: give up
        e.path = p;
      }
      const st = this.followPath(e, dt);
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

  // Walk the unit's path. Returns 'arrived' | 'moving' | 'blocked'.
  followPath(e, dt) {
    if (!e.path || !e.path.length) return 'arrived';
    const wp = e.path[0];
    const idx = GameMap.idx(wp.tx, wp.ty);
    const holder = GameMap.unitOcc.get(idx);
    if (holder != null && holder !== e.id) return 'blocked';
    GameMap.unitOcc.set(idx, e.id); // reserve the next tile

    const c = GameMap.tileToWorldCenter(wp.tx, wp.ty);
    if (this.stepToward(e, c.x, c.y, dt)) e.path.shift();
    this.updateTileReg(e);
    Entities.place(e);
    return e.path.length ? 'moving' : 'arrived';
  },

  // Approach a structure until standing on a tile adjacent to its footprint.
  // Crowded edges make units park nearby and retry, forming a loose queue.
  approachRect(e, c, s, dt) {
    if (this.adjacentToRect(e, s)) { this.clearPath(e); c.wait = 0; return true; }
    if (!e.path) {
      const t = Path.bestAdjacentTile(s, e.tx, e.ty, e);
      e.path = (t && Path.find(e.tx, e.ty, t.tx, t.ty, e)) || [];
    }
    const st = this.followPath(e, dt);
    if (st !== 'moving') this.blockedWait(e, c, dt); // blocked, or arrived short
    return false;
  },

  adjacentToRect(e, s) {
    return e.tx >= s.tx - 1 && e.tx <= s.tx + s.w &&
           e.ty >= s.ty - 1 && e.ty <= s.ty + s.h;
  },

  blockedWait(e, c, dt) {
    c.wait = (c.wait || 0) + dt;
    if (c.wait > this.REPATH_WAIT) {
      c.wait = 0;
      this.clearPath(e); // forces a replan around whatever is in the way
    }
  },

  // Walk straight toward a point (one tile step at most). Returns true on arrival.
  stepToward(e, x, y, dt) {
    const dx = x - e.x, dy = y - e.y;
    const d = Math.hypot(dx, dy);
    const step = CONFIG.WORKER_SPEED * dt;
    if (d <= step) { e.x = x; e.y = y; return true; }
    e.x += (dx / d) * step;
    e.y += (dy / d) * step;
    return false;
  },

  // Keep the unit registered on the tile under its center, releasing the
  // tile it left.
  updateTileReg(e) {
    const t = GameMap.worldToTile(e.x, e.y);
    const cur = GameMap.idx(t.tx, t.ty);
    if (e.curTile !== cur) {
      if (GameMap.unitOcc.get(e.curTile) === e.id) GameMap.unitOcc.delete(e.curTile);
      e.tx = t.tx; e.ty = t.ty; e.curTile = cur;
      GameMap.unitOcc.set(cur, e.id);
    }
  },

  // Drop the unit's path and any tile reservation beyond where it stands.
  clearPath(e) {
    e.path = null;
    for (const [idx, id] of GameMap.unitOcc) {
      if (id === e.id && idx !== e.curTile) GameMap.unitOcc.delete(idx);
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
