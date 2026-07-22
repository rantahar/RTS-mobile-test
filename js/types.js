// Entity type registry. Each type defines its own data AND behavior:
// footprint/radius, display name, SVG symbol, and — for units — a `commands`
// table (cmd.type -> per-tick handler, dispatched by Sim) plus `orderAt`
// (which command a tap on a target should produce). Adding a new unit or
// building is one entry here; Sim and Game stay generic.
//
// Command handlers get (e, cmd, dt) and drive the unit via Sim's movement
// primitives (travel/approachRect/stopUnit/blockedWait).

// Upgrade registry: researched at buildings whose type lists them in
// def.upgrades. Levels are stored per owner in Sim.upgrades.
const Upgrades = {
  weapons: {
    name: 'Weapons',
    maxLevel: 3,
    bonus: CONFIG.WEAPON_BONUS, // +damage per level (Sim.attackDamage)
    time: CONFIG.WEAPON_TIME,   // research seconds per level
    cost(level) { return CONFIG.WEAPON_COST_BASE + CONFIG.WEAPON_COST_STEP * level; },
  },
};

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
    hp: CONFIG.HQ_HP,
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

  barracks: {
    kind: 'structure',
    name: 'Barracks',
    w: 3, h: 3,
    hp: CONFIG.BARRACKS_HP,
    trains: 'soldier',
    cost: CONFIG.BARRACKS_COST,   // ore to place the construction site
    buildTime: CONFIG.BARRACKS_BUILD, // worker-seconds to finish it
    svg(e) {
      const T = CONFIG.TILE;
      const h = (e.w * T) / 2;
      const i = h - 5;
      return `
        <rect class="selmark" x="${-h - 4}" y="${-h - 4}" width="${2 * h + 8}" height="${2 * h + 8}" rx="6"/>
        <rect class="shape" x="${-i}" y="${-i}" width="${2 * i}" height="${2 * i}" rx="8"/>
        <path class="detail" d="M${-i + 8} 16 L0 ${-i + 10} L${i - 8} 16"/>
        <path class="detail" d="M-9 ${i - 6} L-9 12 A9 9 0 0 1 9 12 L9 ${i - 6}"/>`;
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
    trainTime: CONFIG.WORKER_TRAIN_S,
    hp: CONFIG.WORKER_HP,
    builds: ['barracks', 'lab'], // structures this unit can construct
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
      if (hit.kind === 'structure' && hit.underConstruction && hit.owner === u.owner) {
        return { type: 'build', siteId: hit.id }; // resume/help construction
      }
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

      // { type:'build', siteId } — walk to a construction site and work on it.
      // Each adjacent worker contributes dt per tick, so extra builders help.
      build(e, c, dt) {
        const s = Entities.byId.get(c.siteId);
        if (!s || !s.underConstruction) { Sim.stopUnit(e); return; } // done or gone
        if (Sim.approachRect(e, c, s, dt)) {
          s.progress += dt;
          if (s.progress >= s.def.buildTime) Sim.completeStructure(s);
        }
      },
    },
  },

  soldier: {
    kind: 'unit',
    name: 'Soldier',
    radius: 0.42,
    speed: CONFIG.SOLDIER_SPEED,
    cost: CONFIG.SOLDIER_COST,
    trainTime: CONFIG.SOLDIER_TRAIN_S,
    hp: CONFIG.SOLDIER_HP,
    damage: CONFIG.SOLDIER_DMG,
    rate: CONFIG.SOLDIER_RATE,   // seconds between swings
    range: CONFIG.SOLDIER_RANGE, // hex spacings
    aggro: CONFIG.SOLDIER_AGGRO, // auto-acquire radius, hex spacings
    svg(e) {
      const r = e.r;
      return `
        <circle class="selmark" r="${r + 4}"/>
        <circle class="shape" r="${r}"/>
        <path class="detail" d="M-6.5 7.5 L6.5 -6.5"/>
        <path class="detail" d="M-5.5 1.5 L0.5 7.5"/>
        <circle class="detail" cx="-7.5" cy="8.5" r="1.6"/>`;
    },

    orderAt(u, hit) {
      if (hit.hp != null && hit.owner != null && hit.owner !== u.owner) {
        return { type: 'attack', targetId: hit.id };
      }
      if (hit.kind === 'structure') return { type: 'moveRect', targetId: hit.id };
      return null;
    },

    // Idle soldiers look around and engage hostiles on their own.
    idle(e, dt) {
      e.scanT = (e.scanT || 0) - dt;
      if (e.scanT > 0) return;
      e.scanT = 0.3;
      const t = Sim.findTarget(e);
      if (t) e.cmd = { type: 'attack', targetId: t.id, auto: true };
    },

    commands: {
      ...UnitCommands,

      // { type:'attack', targetId, auto } — walk to a free range slot around
      // the target (Hex.attackSlot), hold it, and swing on cooldown. Units
      // behind path around attackers already standing at range. auto: the
      // command was self-acquired; it retargets when the target dies or
      // something closer wanders into aggro range.
      attack(e, c, dt) {
        let t = Entities.byId.get(c.targetId);
        if (!t || t.hp == null) {
          const nt = c.auto && Sim.findTarget(e);
          if (!nt) { Sim.stopUnit(e); return; }
          c.targetId = nt.id;
          Sim.clearPath(e);
          t = nt;
        }
        const range = e.def.range * Hex.S;
        const d = Sim.distTo(e, t);
        c.cd = Math.max(0, (c.cd || 0) - dt);
        if (d <= range + 0.5) {
          if (e.coarse || e.route) Sim.clearPath(e); // in range: hold the slot
          if (c.cd === 0) {
            c.cd = e.def.rate;
            Sim.damage(t, Sim.attackDamage(e), e);
          }
          return;
        }
        // Approaching. Auto attackers keep glancing for closer prey.
        if (c.auto) {
          c.scan = (c.scan || 0) - dt;
          if (c.scan <= 0) {
            c.scan = 0.4;
            const nt = Sim.findTarget(e);
            if (nt && nt.id !== c.targetId && Sim.distTo(e, nt) < d) {
              c.targetId = nt.id;
              Sim.clearPath(e);
              return;
            }
          }
        }
        // Replan when the target has moved well away from the planned slot.
        if (e.coarse && c.gx != null &&
            Math.hypot(t.x - c.gx, t.y - c.gy) > Hex.S * 1.5) Sim.clearPath(e);
        if (!e.coarse || !e.coarse.length) {
          const slot = Hex.attackSlot(t, e, range);
          if (!slot) { Sim.blockedWait(e, c, dt); return; } // ring full: queue
          c.gx = t.x; c.gy = t.y;
          e.coarse = Path.coarse(e, slot);
        }
        if (Sim.travel(e, c, dt) === 'blocked') Sim.blockedWait(e, c, dt);
        // 'arrived' while still out of range (slot stolen / target moved):
        // coarse is empty now, so next tick picks a fresh slot.
      },
    },
  },

  lab: {
    kind: 'structure',
    name: 'Lab',
    w: 3, h: 3,
    hp: CONFIG.LAB_HP,
    cost: CONFIG.LAB_COST,
    buildTime: CONFIG.LAB_BUILD,
    upgrades: ['weapons'], // research buttons offered when selected
    svg(e) {
      const T = CONFIG.TILE;
      const h = (e.w * T) / 2;
      const i = h - 5;
      return `
        <rect class="selmark" x="${-h - 4}" y="${-h - 4}" width="${2 * h + 8}" height="${2 * h + 8}" rx="6"/>
        <rect class="shape" x="${-i}" y="${-i}" width="${2 * i}" height="${2 * i}" rx="8"/>
        <path class="detail" d="M-6 ${-i + 10} H6 M-4 ${-i + 10} V-4 L-16 18 H16 L4 -4 V${-i + 10}"/>
        <circle class="detail" cx="-3" cy="10" r="2"/>
        <circle class="detail" cx="5" cy="4" r="1.5"/>`;
    },
  },
};
