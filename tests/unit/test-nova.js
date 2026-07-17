// Nova: the countdown ignites a ramping radiation field; shields cut the
// damage for workers standing inside their radius; boarding saves workers.
const DT = 1 / 60;

function ticks(g, n) {
  for (let i = 0; i < n; i++) g.Sim.tick(DT);
}

exports.tests = [

  ['no radiation before the nova ignites', ({ loadGame, assert }) => {
    const g = loadGame();
    const u = g.Entities.spawnUnit('worker', 10 * 32, 10 * 32);
    ticks(g, 60 * 5);
    assert(u.hp === g.CONFIG.WORKER_HP, `worker took damage pre-nova (${u.hp})`);
    assert(!g.Sim.nova.active, 'nova active without being started');
  }],

  ['radiation ramps up and eventually burns an exposed worker', ({ loadGame, assert }) => {
    const g = loadGame();
    const u = g.Entities.spawnUnit('worker', 10 * 32, 10 * 32);
    g.Sim.startNova();
    const early = g.Sim.radiationRate();
    ticks(g, 60 * 3);
    assert(g.Sim.radiationRate() > early, 'radiation did not ramp up over time');
    // Exposed, the worker should die within a handful of seconds.
    ticks(g, 60 * 10);
    assert(!g.Entities.byId.has(u.id), 'exposed worker survived the nova far too long');
  }],

  ['a shield keeps a covered worker alive much longer', ({ loadGame, assert }) => {
    const g = loadGame();
    // Shield centered near the worker; worker well inside the radius.
    g.Entities.spawnStructure('shield', 19, 19, 0); // finished, center ~ (20*32,20*32)
    const shielded = g.Entities.spawnUnit('worker', 20 * 32, 20 * 32);
    const exposed = g.Entities.spawnUnit('worker', 4 * 32, 4 * 32); // far from any shield
    assert(g.Sim.shieldMult(shielded) === g.CONFIG.SHIELD_DMG_MULT, 'worker not shielded');
    assert(g.Sim.shieldMult(exposed) === 1, 'exposed worker wrongly shielded');
    g.Sim.startNova();
    // Run until the exposed worker dies; the shielded one must outlast it.
    let exposedDeadAt = null;
    for (let i = 0; i < 60 * 30; i++) {
      g.Sim.tick(DT);
      if (exposedDeadAt == null && !g.Entities.byId.has(exposed.id)) exposedDeadAt = i;
      if (exposedDeadAt != null) break;
    }
    assert(exposedDeadAt != null, 'exposed worker never died');
    assert(g.Entities.byId.has(shielded.id), 'shielded worker died no later than the exposed one');
    assert(shielded.hp > 0, 'shielded worker should still have hp when exposed one dies');
  }],

  ['an unbuilt shield offers no protection', ({ loadGame, assert }) => {
    const g = loadGame();
    g.Entities.spawnStructure('shield', 19, 19, 0, true); // site, not finished
    const u = g.Entities.spawnUnit('worker', 20 * 32, 20 * 32);
    assert(g.Sim.shieldMult(u) === 1, 'construction site shielded a worker');
  }],

  ['Sim.init clears a burning nova so a new game starts calm', ({ loadGame, assert }) => {
    const g = loadGame();
    g.Sim.startNova();
    ticks(g, 60);
    assert(g.Sim.nova.active && g.Sim.nova.t > 0, 'nova did not start/advance');
    g.Sim.init();
    assert(!g.Sim.nova.active && g.Sim.nova.t === 0, 'nova survived Sim.init');
  }],
];
