// Nova end-game: the countdown ignites the radiation field, exposed workers
// burn up, and once none are left the results screen appears.
const { launchGame, assert } = require('./helpers');

exports.run = async () => {
  const g = await launchGame();
  const { page } = g;

  // Fast-forward the countdown to the brink of ignition.
  await page.evaluate(() => { Game.timeLeft = 0.5; });
  await page.waitForFunction(() => Sim.nova.active, { timeout: 4000 });

  const lit = await page.evaluate(() => ({
    banner: document.getElementById('nova').textContent,
    body: document.body.classList.contains('nova'),
  }));
  assert(lit.banner.includes('NOVA'), 'nova banner not shown: ' + lit.banner);
  assert(lit.body, 'nova body class not set');

  // Exposed workers (no shield built) should start losing hp.
  await page.waitForFunction(
    () => Entities.list.some(e => e.type === 'worker' && e.hp < CONFIG.WORKER_HP),
    { timeout: 4000 });

  // With no rockets, everyone eventually burns up and the results show.
  await page.waitForFunction(
    () => !document.getElementById('endscreen').classList.contains('hidden'),
    { timeout: 20000 });

  const res = await page.evaluate(() => ({
    ended: Game.ended,
    saved: document.getElementById('end-saved').textContent,
    workersLeft: Entities.list.filter(e => e.type === 'worker').length,
    restart: !!document.getElementById('btn-restart'),
  }));
  assert(res.ended, 'game did not enter the ended state');
  assert(res.workersLeft === 0, `expected no workers left, got ${res.workersLeft}`);
  assert(res.saved === '0', `expected 0 saved with no rocket, got ${res.saved}`);
  assert(res.restart, 'restart button missing on results screen');

  assert(g.errors.length === 0, 'console errors: ' + g.errors.join(' | '));
  await g.browser.close();
};
