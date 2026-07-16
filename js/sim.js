// Simulation loop: unit movement + command execution.
//
// Unit commands (unit.cmd):
//   { type: 'move', x, y }               walk to a world point
//   { type: 'moveRect', targetId }       walk to a structure's edge
//   { type: 'mine', nodeId, hqId, phase, t }
//       phase: 'toNode' -> 'mining' -> 'toHq' -> repeat
const Sim = {
  _last: null,

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
      if (this.stepToward(e, c.x, c.y, dt)) e.cmd = null;

    } else if (c.type === 'moveRect') {
      const s = Entities.byId.get(c.targetId);
      if (!s || this.stepTowardRect(e, s, dt)) e.cmd = null;

    } else if (c.type === 'mine') {
      const node = Entities.byId.get(c.nodeId);
      if (!node) { e.cmd = null; return; }

      if (c.phase === 'toNode') {
        if (this.stepTowardRect(e, node, dt)) {
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
        if (!hq) { e.cmd = null; return; } // nowhere to deposit; stay carrying
        if (this.stepTowardRect(e, hq, dt)) {
          this.setCarrying(e, false);
          Game.addOre(CONFIG.CARRY);
          c.phase = 'toNode';
        }
      }
    }

    // Re-register on the micro tile under the unit's center.
    const t = GameMap.worldToTile(e.x, e.y);
    e.tx = t.tx; e.ty = t.ty;
    Entities.place(e);
  },

  // Walk straight toward a point. Returns true on arrival.
  // (Straight-line only; pathfinding around obstacles is a later step.)
  stepToward(e, x, y, dt) {
    const dx = x - e.x, dy = y - e.y;
    const d = Math.hypot(dx, dy);
    const step = CONFIG.WORKER_SPEED * dt;
    if (d <= step) { e.x = x; e.y = y; return true; }
    e.x += (dx / d) * step;
    e.y += (dy / d) * step;
    return false;
  },

  // Walk toward the closest point on a structure's footprint. Returns true
  // once the unit's circle touches the footprint edge.
  stepTowardRect(e, s, dt) {
    const T = CONFIG.TILE;
    const cx = Math.max(s.tx * T, Math.min(e.x, (s.tx + s.w) * T));
    const cy = Math.max(s.ty * T, Math.min(e.y, (s.ty + s.h) * T));
    if (Math.hypot(cx - e.x, cy - e.y) <= e.r + 2) return true;
    this.stepToward(e, cx, cy, dt);
    return Math.hypot(cx - e.x, cy - e.y) <= e.r + 2;
  },

  setCarrying(e, on) {
    e.carrying = on;
    e.el.classList.toggle('carrying', on);
  },
};
