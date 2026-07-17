// Build + evacuate chain: a worker places an escape-rocket site, constructs
// it, then boards it to be saved. Also covers the dynamic action bar and
// placement validity feedback.
const { launchGame, assert } = require('./helpers');

exports.run = async () => {
  const g = await launchGame();
  const { page } = g;
  const hq = await page.evaluate(() => {
    const h = Entities.list.find(e => e.type === 'hq'); return { x: h.x, y: h.y };
  });
  await page.evaluate(() => {
    const v = document.getElementById('view');
    Camera.setZoom(0.4, v.clientWidth, v.clientHeight);
  });
  await g.center(hq.x, hq.y);

  await page.evaluate(() => { Game.ore = 100; Game.updateOre(); });

  // Select one worker; the build buttons should appear, armed on tap.
  const w0 = (await g.units())[0];
  await g.tapWorld(w0.x, w0.y);
  assert((await g.selInfo()).includes('Worker'), 'worker not selected');
  assert(await page.evaluate(() => !!document.getElementById('btn-build-rocket')),
    'rocket build button missing');
  assert(await page.evaluate(() => !!document.getElementById('btn-build-shield')),
    'shield build button missing');
  assert(!await page.evaluate(() => document.getElementById('btn-build-rocket').disabled),
    'rocket build disabled with worker selected and ore');
  await page.click('#btn-build-rocket');
  assert((await g.selInfo()).includes('place'), 'placement hint not shown');

  // Invalid spot (on the base): no site, still armed.
  await g.tapWorld(hq.x, hq.y);
  assert(await page.evaluate(() =>
    !Entities.list.some(e => e.type === 'rocket') && Game.placing === 'rocket'),
    'invalid placement was accepted');

  // Valid spot near the worker: site spawns, ore is paid, worker sent to build.
  const spot = { x: w0.x + 120, y: w0.y + 40 };
  await g.tapWorld(spot.x, spot.y);
  const placed = await page.evaluate(() => {
    const s = Entities.list.find(e => e.type === 'rocket');
    return s && {
      under: s.underConstruction, ore: Game.ore,
      builder: Entities.list.some(e => e.kind === 'unit' &&
        e.cmd && e.cmd.type === 'build' && e.cmd.siteId === s.id),
    };
  });
  assert(placed, 'no rocket site after valid placement tap');
  assert(placed.under, 'site not under construction');
  assert(placed.ore === 60, `expected 60 ore after paying 40, got ${placed.ore}`);
  assert(placed.builder, 'selected worker was not sent to build');

  // Wait for construction to actually progress, then fast-forward the tail.
  let progressed = false;
  for (let i = 0; i < 20 && !progressed; i++) {
    await page.waitForTimeout(500);
    progressed = await page.evaluate(() =>
      Entities.list.find(e => e.type === 'rocket').progress > 0.5);
  }
  assert(progressed, 'construction never progressed');
  await page.evaluate(() => {
    const s = Entities.list.find(e => e.type === 'rocket');
    s.progress = s.def.buildTime - 0.3;
  });
  await page.waitForTimeout(1500);
  const done = await page.evaluate(() => {
    const s = Entities.list.find(e => e.type === 'rocket');
    return { under: s.underConstruction, builderStopped: Entities.list.every(e =>
      e.kind !== 'unit' || !e.cmd || e.cmd.type !== 'build') };
  });
  assert(!done.under, 'site never completed');
  assert(done.builderStopped, 'builder kept building a finished rocket');

  // Select the finished rocket: it reports its seat count.
  await page.click('#btn-deselect');
  const rk = await page.evaluate(() => {
    const s = Entities.list.find(e => e.type === 'rocket'); return { x: s.x, y: s.y };
  });
  await g.tapWorld(rk.x, rk.y);
  assert((await g.selInfo()).includes('Escape Rocket'), 'rocket not selected: ' + await g.selInfo());

  // Select a worker and tap the rocket to board (evacuate) it.
  await page.click('#btn-deselect');
  const wb = (await g.units())[0];
  await g.tapWorld(wb.x, wb.y);
  await g.tapWorld(rk.x, rk.y);
  let saved = 0;
  for (let i = 0; i < 40 && saved < 1; i++) {
    await page.waitForTimeout(300);
    saved = await page.evaluate(() => Game.saved);
  }
  assert(saved === 1, `expected 1 saved worker, got ${saved}`);
  const board = await page.evaluate(() => ({
    seat: Entities.list.find(e => e.type === 'rocket').boarded,
    score: document.getElementById('score').textContent,
  }));
  assert(board.seat === 1, `rocket seat not filled, got ${board.seat}`);
  assert(board.score.includes('1'), 'score readout did not update');

  assert(g.errors.length === 0, 'console errors: ' + g.errors.join(' | '));
  await g.browser.close();
};
