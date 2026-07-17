// Pathfinding: straight lines on open ground, corner turns at buildings,
// flowing around parked units, and bounded two-level legs on long trips.
// Coordinates are derived from the live base position so the test survives
// layout/config changes.
const { launchGame, assert } = require('./helpers');

exports.run = async () => {
  const g = await launchGame();
  const { page } = g;
  const hq = await page.evaluate(() => {
    const h = Entities.list.find(e => e.type === 'hq');
    return { x: h.x, y: h.y, x0: h.tx * 32, y0: h.ty * 32,
             x1: (h.tx + h.w) * 32, y1: (h.ty + h.h) * 32 };
  });
  await g.center(hq.x, hq.y);

  const worker = (i = 0) => page.evaluate((i) => {
    const w = Entities.list.filter(e => e.type === 'worker')[i];
    return { x: w.x, y: w.y, hex: w.curHex, cmd: !!w.cmd,
             route: w.route && w.route.length ? w.route[w.route.length - 1] : null,
             coarse: w.coarse ? w.coarse.length : 0 };
  }, i);

  // Park the lead worker alone in open space first, so the straightness
  // measurement isn't perturbed by the starting cluster.
  let w0 = await worker(0);
  await g.tapWorld(w0.x, w0.y);
  await g.tapWorld(hq.x + 320, hq.y - 300);
  await page.waitForTimeout(4500);

  // 1. Open ground: route collapses to ~1 waypoint, movement is collinear.
  w0 = await worker(0);
  const a = { x: w0.x, y: w0.y };
  await g.tapWorld(w0.x - 200, w0.y - 40); // straight shot across open space
  await page.waitForTimeout(80);
  const dest = (await worker(0)).route;
  assert(dest, 'no route planned');
  let maxDev = 0;
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(120);
    const s = await worker(0);
    const dev = Math.abs((s.x - a.x) * (dest.y - a.y) - (s.y - a.y) * (dest.x - a.x)) /
                Math.hypot(dest.x - a.x, dest.y - a.y);
    maxDev = Math.max(maxDev, dev);
  }
  assert(maxDev < 8, `open-ground path deviates ${maxDev.toFixed(1)}px from straight`);
  await page.waitForTimeout(1500);

  // 2. Around the base: never enter the footprint.
  w0 = await worker(0);
  await g.tapWorld(w0.x, w0.y);
  await g.tapWorld(hq.x0 - 40, hq.y + 20); // just past the far side of the base
  let violated = false, done = false;
  for (let i = 0; i < 70 && !done; i++) {
    await page.waitForTimeout(120);
    const s = await worker(0);
    if (s.x > hq.x0 && s.x < hq.x1 && s.y > hq.y0 && s.y < hq.y1) violated = true;
    done = !s.cmd;
  }
  assert(done, 'around-base trip never finished');
  assert(!violated, 'unit entered the base footprint');

  // 3. Parked blocker: second worker holds position; first flows around it.
  await page.click('#btn-deselect');
  const w1start = await worker(1);
  await g.tapWorld(w1start.x, w1start.y);
  await g.tapWorld(w1start.x, w1start.y + 120);
  await page.waitForTimeout(2500);
  await page.click('#btn-deselect');
  const blocker = await worker(1);
  const mover0 = await worker(0);
  await g.tapWorld(mover0.x, mover0.y);
  const L = Math.hypot(blocker.x - mover0.x, blocker.y - mover0.y) || 1;
  const tgt = { x: blocker.x + (blocker.x - mover0.x) / L * 170,
                y: blocker.y + (blocker.y - mover0.y) / L * 170 };
  await g.tapWorld(tgt.x, tgt.y);
  let minD = Infinity, shared = false;
  done = false;
  for (let i = 0; i < 90 && !done; i++) {
    await page.waitForTimeout(120);
    const s = await page.evaluate(() => {
      const ws = Entities.list.filter(e => e.type === 'worker');
      return { a: { x: ws[0].x, y: ws[0].y, hex: ws[0].curHex, cmd: !!ws[0].cmd },
               b: { x: ws[1].x, y: ws[1].y, hex: ws[1].curHex } };
    });
    minD = Math.min(minD, Math.hypot(s.a.x - s.b.x, s.a.y - s.b.y));
    if (s.a.hex === s.b.hex) shared = true;
    done = !s.a.cmd;
  }
  assert(done, 'blocker trip never finished');
  assert(minD > 26, `units overlapped: min separation ${minD.toFixed(1)}px`);
  assert(!shared, 'units shared a hex');

  // 4. Long trip across the map: legs stay bounded, coarse list only shrinks.
  await page.click('#btn-deselect');
  await page.evaluate(() => {
    const w = Entities.list.find(e => e.type === 'worker');
    Selection.setTo([w]);
    Game.issueCommand([w], null, { x: 128, y: 128 });
  });
  let maxLeg = 0, prevCoarse = Infinity, grew = false;
  done = false;
  for (let i = 0; i < 160 && !done; i++) {
    await page.waitForTimeout(120);
    const s = await worker(0);
    maxLeg = Math.max(maxLeg, s.route ? Math.hypot(s.route.x - s.x, s.route.y - s.y) : 0);
    if (s.coarse > prevCoarse) grew = true;
    if (s.coarse) prevCoarse = s.coarse;
    done = !s.cmd;
  }
  assert(done, 'long trip never finished');
  assert(maxLeg < 9 * 32, `fine leg too long: ${maxLeg.toFixed(0)}px`);
  assert(!grew, 'coarse route grew mid-trip (full replan happened)');

  assert(g.errors.length === 0, 'console errors: ' + g.errors.join(' | '));
  await g.browser.close();
};
