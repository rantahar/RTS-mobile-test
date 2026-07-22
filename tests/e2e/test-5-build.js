// Build chain: worker places a barracks site, constructs it, then the
// finished barracks trains a soldier. Also covers the dynamic action bar
// and placement validity feedback.
const { launchGame, assert } = require('./helpers');

exports.run = async () => {
  const g = await launchGame();
  const { page } = g;
  await g.center(672, 672); // the framing the coordinates below assume

  await page.evaluate(() => { Game.ore = 100; Game.updateOre(); });

  // Select one worker; the build button should appear, armed on tap.
  const w0 = (await g.units())[0];
  await g.tapWorld(w0.x, w0.y);
  assert((await g.selInfo()).includes('Worker'), 'worker not selected');
  assert(!await page.evaluate(() => document.getElementById('btn-build-barracks').disabled),
    'build button missing/disabled with worker selected and ore');
  await page.click('#btn-build-barracks');
  assert((await g.selInfo()).includes('place'), 'placement hint not shown');

  // Invalid spot (on the HQ): no site, still armed.
  await g.tapWorld(560, 656);
  assert(await page.evaluate(() =>
    !Entities.list.some(e => e.type === 'barracks' && e.owner === 0) && Game.placing === 'barracks'),
    'invalid placement was accepted');

  // Valid spot: site spawns, ore is paid, the worker is sent to build.
  await g.tapWorld(592, 880);
  const placed = await page.evaluate(() => {
    const s = Entities.list.find(e => e.type === 'barracks' && e.owner === 0);
    return s && {
      under: s.underConstruction, ore: Game.ore,
      builder: Entities.list.some(e => e.kind === 'unit' &&
        e.cmd && e.cmd.type === 'build' && e.cmd.siteId === s.id),
    };
  });
  assert(placed, 'no barracks site after valid placement tap');
  assert(placed.under, 'site not under construction');
  assert(placed.ore === 70, `expected 70 ore after paying 30, got ${placed.ore}`);
  assert(placed.builder, 'selected worker was not sent to build');

  // Wait for construction to actually progress, then fast-forward the tail.
  let progressed = false;
  for (let i = 0; i < 20 && !progressed; i++) {
    await page.waitForTimeout(500);
    progressed = await page.evaluate(() =>
      Entities.list.find(e => e.type === 'barracks' && e.owner === 0).progress > 0.5);
  }
  assert(progressed, 'construction never progressed');
  await page.evaluate(() => {
    const s = Entities.list.find(e => e.type === 'barracks' && e.owner === 0);
    s.progress = s.def.buildTime - 0.3;
  });
  await page.waitForTimeout(1500);
  const done = await page.evaluate(() => {
    const s = Entities.list.find(e => e.type === 'barracks' && e.owner === 0);
    return { under: s.underConstruction, builderStopped: Entities.list.every(e =>
      e.kind !== 'unit' || !e.cmd || e.cmd.type !== 'build') };
  });
  assert(!done.under, 'site never completed');
  assert(done.builderStopped, 'builder kept building a finished barracks');

  // Select the finished barracks and train a soldier.
  await page.click('#btn-deselect');
  await g.tapWorld(592, 880); // barracks center
  assert((await g.selInfo()).includes('Barracks'), 'barracks not selected: ' + await g.selInfo());
  assert(await page.evaluate(() => !!document.getElementById('btn-train-soldier')),
    'soldier train button missing');
  await page.evaluate(() => { Types.soldier.trainTime = 0.4; }); // fast production
  await page.click('#btn-train-soldier');
  const queued = await page.evaluate(() => ({
    ore: Game.ore,
    label: document.getElementById('btn-train-soldier').textContent,
  }));
  assert(queued.ore === 55, `ore not paid on enqueue (${queued.ore})`);
  assert(queued.label.includes('×1'), `queue count missing from button: ${queued.label}`);
  assert(await page.evaluate(() => !!document.getElementById('btn-cancel-soldier')),
    'cancel button missing while queued');
  await page.waitForTimeout(800); // production completes
  const trained = await page.evaluate(() => ({
    ore: Game.ore,
    soldiers: Entities.list.filter(e => e.type === 'soldier').length,
  }));
  assert(trained.soldiers === 1, `expected 1 soldier, got ${trained.soldiers}`);
  assert(trained.ore === 55, `expected 55 ore after training, got ${trained.ore}`);

  assert(g.errors.length === 0, 'console errors: ' + g.errors.join(' | '));
  await g.browser.close();
};
