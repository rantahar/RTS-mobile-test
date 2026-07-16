// Combat: range slots, attacking, auto-acquire, upgrades, and the enemy AI.
const DT = 1 / 60;

function ticks(g, n) {
  for (let i = 0; i < n; i++) { g.Sim.tick(DT); g.AI.tick(DT); }
}

exports.tests = [

  ['attackSlot: free hex within range, nearest to the attacker', ({ loadGame, assert }) => {
    const g = loadGame();
    const t = g.Entities.spawnUnit('soldier', 20 * 32, 20 * 32, 1);
    const a = g.Entities.spawnUnit('soldier', 28 * 32, 20 * 32, 0);
    const range = g.CONFIG.SOLDIER_RANGE * g.Hex.S;
    const slot = g.Hex.attackSlot(t, a, range);
    assert(slot, 'no slot found on open ground');
    const c = g.Hex.centerOf(slot.col, slot.row);
    assert(Math.hypot(c.x - t.x, c.y - t.y) <= range + 0.01, 'slot outside range');
    assert(c.x > t.x, 'slot not on the attacker side');
    assert(g.Hex.free(slot.col, slot.row, a), 'slot not free');
  }],

  ['five attackers fan out at range and all get to fight', ({ loadGame, assert }) => {
    const g = loadGame();
    const hq = g.Entities.spawnStructure('hq', 15, 18, 1); // enemy building
    const range = g.CONFIG.SOLDIER_RANGE * g.Hex.S;
    const squad = [];
    for (let i = 0; i < 5; i++) {
      const u = g.Entities.spawnUnit('soldier', (26 + (i % 3)) * 32, (17 + i) * 32, 0);
      u.cmd = { type: 'attack', targetId: hq.id };
      squad.push(u);
    }
    ticks(g, 60 * 12);
    const hexes = squad.map(u => u.curHex);
    assert(new Set(hexes).size === hexes.length, 'attackers share a hex');
    for (const u of squad) {
      assert(g.Sim.distTo(u, hq) <= range + 0.5,
        `attacker parked out of range (${g.Sim.distTo(u, hq).toFixed(1)}px)`);
    }
    assert(hq.hp < hq.maxHp - 100, `combined damage too low (hp ${hq.hp})`);
  }],

  ['attack kills the target, structure footprint is freed', ({ loadGame, assert }) => {
    const g = loadGame();
    let died = null;
    g.Sim.hooks.destroyed = (e) => { died = e; };
    const b = g.Entities.spawnStructure('barracks', 20, 20, 1);
    b.hp = 20; // nearly dead already
    const u = g.Entities.spawnUnit('soldier', 25 * 32, 21 * 32, 0);
    u.cmd = { type: 'attack', targetId: b.id };
    ticks(g, 60 * 15);
    assert(died === b, 'destroyed hook did not fire');
    assert(!g.Entities.byId.has(b.id), 'dead structure still registered');
    const inside = g.Hex.fromWorld(21.5 * 32, 21.5 * 32);
    assert(g.Hex.structFree(inside.col, inside.row), 'footprint still blocked');
    assert(!u.cmd, 'manual attacker did not stop after the kill');
  }],

  ['idle soldier auto-acquires nearby enemies only', ({ loadGame, assert }) => {
    const g = loadGame();
    const s = g.Entities.spawnUnit('soldier', 20 * 32, 20 * 32, 0);
    // Enemy worker beyond aggro: ignored.
    const far = g.Entities.spawnUnit('worker', 33 * 32, 20 * 32, 1);
    ticks(g, 60);
    assert(!s.cmd, 'soldier aggroed a target beyond its radius');
    // Enemy worker inside aggro: attacked and killed, then back to idle.
    const near = g.Entities.spawnUnit('worker', 23 * 32, 20 * 32, 1);
    ticks(g, 60 * 12);
    assert(!g.Entities.byId.has(near.id), 'nearby enemy survived auto-attack');
    assert(g.Entities.byId.has(far.id), 'far enemy was chased without cause');
  }],

  ['weapons research raises soldier damage and resets with init', ({ loadGame, assert }) => {
    const g = loadGame();
    const lab = g.Entities.spawnStructure('lab', 20, 20, 0);
    const s = g.Entities.spawnUnit('soldier', 10 * 32, 10 * 32, 0);
    const base = g.Sim.attackDamage(s);
    assert(base === g.CONFIG.SOLDIER_DMG, 'base damage mismatch');
    assert(g.Sim.startResearch(lab, 'weapons'), 'research did not start');
    assert(!g.Sim.startResearch(lab, 'weapons'), 'double research allowed');
    ticks(g, Math.ceil(60 * (g.Upgrades.weapons.time + 0.5)));
    assert(!lab.research, 'research never finished');
    assert(g.Sim.upgradeLevel(0, 'weapons') === 1, 'level not stored');
    assert(g.Sim.attackDamage(s) === base + g.Upgrades.weapons.bonus,
      'damage did not increase');
    // Enemy soldiers are unaffected by the player's research.
    const es = g.Entities.spawnUnit('soldier', 12 * 32, 10 * 32, 1);
    assert(g.Sim.attackDamage(es) === base, 'upgrade leaked across owners');
    // A new game must not inherit research.
    g.Sim.init();
    assert(g.Sim.upgradeLevel(0, 'weapons') === 0, 'research survived Sim.init');
  }],

  ['a site under construction cannot research', ({ loadGame, assert }) => {
    const g = loadGame();
    const site = g.Entities.spawnStructure('lab', 20, 20, 0, true);
    assert(!g.Sim.startResearch(site, 'weapons'), 'unbuilt lab researched');
  }],

  ['AI produces on its timer and attacks with a full wave', ({ loadGame, assert }) => {
    const g = loadGame();
    g.CONFIG.ENEMY_PRODUCE_S = 0.5; // speed the test up
    const hq = g.Entities.spawnStructure('hq', 15, 18, 0);
    g.Entities.spawnStructure('barracks', 34, 33, 1);
    ticks(g, 20); // 0.33s: under one production interval
    const count = () => g.Entities.list.filter(e => e.kind === 'unit' && e.owner === 1).length;
    assert(count() === 0, 'AI produced before its timer');
    ticks(g, 60 * 2.2);
    assert(count() >= 3, `expected a wave's worth of soldiers, got ${count()}`);
    const wave = g.Entities.list.filter(e => e.kind === 'unit' && e.owner === 1);
    assert(wave.some(u => u.cmd && u.cmd.type === 'attack'),
      'full wave never received attack orders');
    const t = g.Entities.byId.get(wave.find(u => u.cmd).cmd.targetId);
    assert(t === hq, 'wave did not target the player structure');
  }],

  ['AI stops when its base is destroyed', ({ loadGame, assert }) => {
    const g = loadGame();
    g.CONFIG.ENEMY_PRODUCE_S = 0.2;
    g.Entities.spawnStructure('hq', 15, 18, 0);
    const base = g.Entities.spawnStructure('barracks', 34, 33, 1);
    ticks(g, 60);
    const n0 = g.Entities.list.filter(e => e.kind === 'unit' && e.owner === 1).length;
    assert(n0 >= 1, 'AI never produced');
    g.Entities.removeStructure(base);
    ticks(g, 60);
    const n1 = g.Entities.list.filter(e => e.kind === 'unit' && e.owner === 1).length;
    assert(n1 === n0, 'AI kept producing without a base');
  }],
];
