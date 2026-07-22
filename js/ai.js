// Scripted opponent (owner 1). Dead simple by design: its production
// building slowly trains soldiers, and once ENEMY_WAVE of them stand idle
// they attack the player together. The actual fighting (range slots,
// retargeting) is the same type-defined behavior player soldiers use.
// Ticked from the Game loop after Sim.tick; DOM-free and headless-testable.
const AI = {
  owner: 1,
  t: 0, // production timer (seconds since last spawn attempt)

  init() {
    this.t = 0;
  },

  tick(dt) {
    const base = Entities.list.find(s => s.kind === 'structure' &&
      s.owner === this.owner && s.def.trains && !s.underConstruction);
    if (!base) return; // base destroyed: the AI is out of the game

    const army = Entities.list.filter(e =>
      e.kind === 'unit' && e.owner === this.owner);

    // Queue one soldier at a time through the normal production pipeline
    // (so the enemy pays train time like the player, minus the ore).
    this.t += dt;
    if (this.t >= CONFIG.ENEMY_PRODUCE_S && !base.queue.length &&
        army.length < CONFIG.ENEMY_CAP) {
      if (Sim.enqueueTrain(base, base.def.trains)) this.t = 0;
    }

    // Wave: enough idle soldiers gathered -> everyone attacks. auto:true so
    // they retarget on their own as things die or defenders show up.
    const idle = army.filter(u => !u.cmd);
    if (idle.length >= CONFIG.ENEMY_WAVE) {
      const target = this.pickTarget(base);
      if (target) {
        for (const u of idle) {
          u.cmd = { type: 'attack', targetId: target.id, auto: true };
        }
      }
    }
  },

  // March on the player's nearest structure; fall back to any player unit.
  pickTarget(base) {
    let best = null, bd = Infinity, bestIsStruct = false;
    for (const e of Entities.list) {
      if (e.owner !== 0 || e.hp == null) continue;
      const isStruct = e.kind === 'structure';
      if (bestIsStruct && !isStruct) continue;
      const d = (e.x - base.x) ** 2 + (e.y - base.y) ** 2;
      if ((isStruct && !bestIsStruct) || d < bd) {
        bd = d; best = e; bestIsStruct = isStruct;
      }
    }
    return best;
  },
};
