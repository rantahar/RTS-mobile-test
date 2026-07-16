// Entity type registry. Each type defines its own data AND behavior:
// footprint/radius, display name, SVG symbol, and — for units — a `commands`
// table (cmd.type -> per-tick handler, dispatched by Sim) plus `orderAt`
// (which command a tap on a target should produce). Adding a new unit or
// building is one entry here; Sim and Game stay generic.
//
// Command handlers get (e, cmd, dt) and drive the unit via Sim's movement
// primitives (travel/approachRect/stopUnit/blockedWait).

// Movement commands shared by every mobile unit.
const UnitCommands = {
  // { type:'move', col, row } — walk to a hex (or the nearest free one).
  move(e, c, dt) {
    if (!e.coarse) {
      const dest = Hex.nearestFree(c.col, c.row, e, null);
      if (!dest) { Sim.stopUnit(e); return; } // nowhere to stand: give up
      e.coarse = Path.coarse(e, dest);
    }
    const st = Sim.travel(e, c, dt);
    if (st === 'arrived') Sim.stopUnit(e);
    else if (st === 'blocked') Sim.blockedWait(e, c, dt);
  },

  // { type:'moveRect', targetId } — walk next to a structure.
  moveRect(e, c, dt) {
    const s = Entities.byId.get(c.targetId);
    if (!s) { Sim.stopUnit(e); return; }
    if (Sim.approachRect(e, c, s, dt)) Sim.stopUnit(e);
  },
};

const Types = {
  hq: {
    kind: 'structure',
    name: 'Main Building',
    w: 5, h: 5,
    depot: true,      // carried ore is deposited here
    trains: 'worker', // Train button spawns this unit type
    svg(e) {
      const T = CONFIG.TILE;
      const h = (e.w * T) / 2;      // half footprint size in px
      const i = h - 6;              // outline inset
      return `
        <rect class="selmark" x="${-h - 4}" y="${-h - 4}" width="${2 * h + 8}" height="${2 * h + 8}" rx="8"/>
        <rect class="shape" x="${-i}" y="${-i}" width="${2 * i}" height="${2 * i}" rx="10"/>
        <rect class="detail" x="-16" y="${i - 32}" width="32" height="32" rx="4"/>
        <path class="detail" d="M0 -52 V 8"/>
        <path class="flag" d="M0 -52 L36 -41 L0 -30 Z"/>`;
    },
  },

  node: {
    kind: 'structure',
    name: 'Resource',
    w: 2, h: 2,
    neutral: true,   // belongs to no player
    mineable: true,
    svg(e) {
      const T = CONFIG.TILE;
      const h = (e.w * T) / 2;
      return `
        <rect class="selmark" x="${-h - 4}" y="${-h - 4}" width="${2 * h + 8}" height="${2 * h + 8}" rx="6"/>
        <polygon class="shape" points="0,-26 15,-2 0,22 -15,-2"/>
        <polygon class="shape" points="-26,8 -16,-5 -6,8 -16,20"/>
        <polygon class="shape" points="10,12 20,1 29,12 20,22"/>`;
    },
  },

  worker: {
    kind: 'unit',
    name: 'Worker',
    radius: 0.42,               // body radius in tiles
    speed: CONFIG.WORKER_SPEED, // world px per second
    cost: CONFIG.WORKER_COST,
    svg(e) {
      const r = e.r;
      return `
        <circle class="selmark" r="${r + 4}"/>
        <circle class="shape" r="${r}"/>
        <path class="detail" d="M-7 8 L7 -7"/>
        <path class="detail" d="M-3 -11 Q9 -13 12 -2"/>
        <circle class="cargo" cx="${r * 0.55}" cy="${r * 0.55}" r="4.5"/>`;
    },

    // A tap-command landed on `hit` — what should this worker do about it?
    // Return a command object, or null to fall back to a plain group move.
    orderAt(u, hit) {
      if (hit.def.mineable) {
        const depot = Entities.list.find(s => s.def.depot && s.owner === u.owner);
        return { type: 'mine', nodeId: hit.id, hqId: depot && depot.id, phase: 'toNode' };
      }
      if (hit.kind === 'structure') return { type: 'moveRect', targetId: hit.id };
      return null;
    },

    commands: {
      ...UnitCommands,

      // { type:'mine', nodeId, hqId, phase, t }
      //   phase: 'toNode' -> 'mining' -> 'toHq' -> repeat
      mine(e, c, dt) {
        const node = Entities.byId.get(c.nodeId);
        if (!node) { Sim.stopUnit(e); return; }

        if (c.phase === 'toNode') {
          if (Sim.approachRect(e, c, node, dt)) {
            c.phase = 'mining';
            c.t = CONFIG.MINE_TIME;
          }
        } else if (c.phase === 'mining') {
          c.t -= dt;
          if (c.t <= 0) {
            Sim.setCarrying(e, true);
            c.phase = 'toHq';
          }
        } else if (c.phase === 'toHq') {
          const hq = Entities.byId.get(c.hqId);
          if (!hq) { Sim.stopUnit(e); return; } // nowhere to deposit; stay carrying
          if (Sim.approachRect(e, c, hq, dt)) {
            Sim.setCarrying(e, false);
            Sim.hooks.deposit(CONFIG.CARRY, e);
            c.phase = 'toNode';
          }
        }
      },
    },
  },
};
