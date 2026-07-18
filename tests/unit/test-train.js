// Production queue: training takes time, taps enqueue up to a cap, and the
// queue drains one unit at a time. Also covers the now-buildable main building.
const DT = 1 / 60;

function ticks(g, n) {
  for (let i = 0; i < n; i++) g.Sim.tick(DT);
}
function workers(g) {
  return g.Entities.list.filter(e => e.type === 'worker').length;
}

exports.tests = [

  ['the main building is buildable (registry data)', ({ loadGame, assert }) => {
    const g = loadGame();
    assert(g.Types.hq.cost === g.CONFIG.HQ_COST, 'hq has no build cost');
    assert(g.Types.hq.buildTime === g.CONFIG.HQ_BUILD, 'hq has no build time');
    assert(g.Types.worker.builds.includes('hq'), 'worker cannot build a main building');
    assert(g.Types.worker.trainTime === g.CONFIG.WORKER_TRAIN_S, 'worker has no train time');
  }],

  ['enqueue trains over time, not instantly', ({ loadGame, assert }) => {
    const g = loadGame();
    const hq = g.Entities.spawnStructure('hq', 15, 18);
    const n0 = workers(g);
    assert(g.Sim.enqueueTrain(hq), 'enqueue failed');
    assert(hq.queue.length === 1, 'unit not queued');
    ticks(g, 30); // 0.5s, well under trainTime
    assert(workers(g) === n0, 'unit trained instantly');
    assert(g.Sim.trainProgress(hq) > 0, 'training made no progress');
    ticks(g, 60 * (g.Types.worker.trainTime + 1));
    assert(workers(g) === n0 + 1, 'unit never finished training');
    assert(hq.queue.length === 0, 'queue not drained');
    assert(g.Sim.trainProgress(hq) === 0, 'idle building still reports progress');
  }],

  ['a full queue drains one at a time, in order', ({ loadGame, assert }) => {
    const g = loadGame();
    const hq = g.Entities.spawnStructure('hq', 15, 18);
    for (let i = 0; i < 3; i++) assert(g.Sim.enqueueTrain(hq), `enqueue ${i} failed`);
    assert(hq.queue.length === 3, 'not all queued');
    // After one train time only the first should have popped.
    ticks(g, 60 * (g.Types.worker.trainTime + 0.5));
    assert(workers(g) === 1, `expected 1 trained so far, got ${workers(g)}`);
    ticks(g, 60 * (g.Types.worker.trainTime * 2 + 1));
    assert(workers(g) === 3, `expected 3 trained, got ${workers(g)}`);
    assert(hq.queue.length === 0, 'queue not empty');
  }],

  ['the queue is capped at TRAIN_QUEUE_MAX', ({ loadGame, assert }) => {
    const g = loadGame();
    const hq = g.Entities.spawnStructure('hq', 15, 18);
    let accepted = 0;
    for (let i = 0; i < g.CONFIG.TRAIN_QUEUE_MAX + 3; i++) if (g.Sim.enqueueTrain(hq)) accepted++;
    assert(accepted === g.CONFIG.TRAIN_QUEUE_MAX, `cap not enforced (accepted ${accepted})`);
    assert(hq.queue.length === g.CONFIG.TRAIN_QUEUE_MAX, 'queue exceeded the cap');
  }],

  ['the trained hook fires with the unit and its building', ({ loadGame, assert }) => {
    const g = loadGame();
    let got = null;
    g.Sim.hooks.trained = (u, b) => { got = { u, b }; };
    const hq = g.Entities.spawnStructure('hq', 15, 18);
    g.Sim.enqueueTrain(hq);
    ticks(g, 60 * (g.Types.worker.trainTime + 1));
    assert(got && got.b === hq && got.u.type === 'worker', 'trained hook did not fire correctly');
  }],

  ['cannot queue at an unfinished building', ({ loadGame, assert }) => {
    const g = loadGame();
    const site = g.Entities.spawnStructure('hq', 15, 18, 0, true);
    assert(!g.Sim.enqueueTrain(site), 'queued a unit at a construction site');
  }],
];
