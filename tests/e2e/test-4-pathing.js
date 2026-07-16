// Pathfinding: straight lines on open ground, corner turns at buildings,
// flowing around parked units, and bounded two-level legs on long trips.
const { launchGame, assert } = require('./helpers');

const HQ = { x0: 480, x1: 640, y0: 576, y1: 736 }; // world-px footprint

exports.run = async () => {
  const g = await launchGame();
  const { page } = g;
  await g.center(672, 672); // the framing the coordinates below assume

  // 1. Open ground (no units near the line): route collapses to ~1 waypoint,
  //    movement is collinear.
  await g.tapWorld(720, 679);
  await g.tapWorld(860, 500);
  await page.waitForTimeout(80);
  const dest = await page.evaluate(() => {
    const w = Entities.list.find(e => e.type === 'worker');
    return w.route && w.route[w.route.length - 1];
  });
  assert(dest, 'no route planned');
  let maxDev = 0;
  const a = { x: 720, y: 679 };
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(120);
    const s = await page.evaluate(() => {
      const w = Entities.list.find(e => e.type === 'worker');
      return { x: w.x, y: w.y };
    });
    const dev = Math.abs((s.x - a.x) * (dest.y - a.y) - (s.y - a.y) * (dest.x - a.x)) /
                Math.hypot(dest.x - a.x, dest.y - a.y);
    maxDev = Math.max(maxDev, dev);
  }
  assert(maxDev < 8, `open-ground path deviates ${maxDev.toFixed(1)}px from straight`);
  await page.waitForTimeout(1200);

  // 2. Around the HQ: never enter the footprint.
  await g.tapWorld(490, 560);
  let violated = false, done = false;
  for (let i = 0; i < 60 && !done; i++) {
    await page.waitForTimeout(120);
    const s = await page.evaluate(() => {
      const w = Entities.list.find(e => e.type === 'worker');
      return { x: w.x, y: w.y, done: !w.cmd };
    });
    if (s.x > HQ.x0 && s.x < HQ.x1 && s.y > HQ.y0 && s.y < HQ.y1) violated = true;
    done = s.done;
  }
  assert(done, 'around-HQ trip never finished');
  assert(!violated, 'unit entered the HQ footprint');

  // 3. Parked blocker: second worker holds position; first flows around it.
  //    (Same shape as a ranged attacker holding at range.)
  await page.click('#btn-deselect');
  await g.tapWorld(752, 734);
  await g.tapWorld(752, 850);
  await page.waitForTimeout(2500);
  await page.click('#btn-deselect');
  const blocker = await page.evaluate(() => {
    const w = Entities.list.filter(e => e.type === 'worker')[1];
    return { x: w.x, y: w.y, hex: w.curHex, idle: !w.cmd };
  });
  assert(blocker.idle, 'blocker still moving');
  const mover0 = await page.evaluate(() => {
    const w = Entities.list.filter(e => e.type === 'worker')[0];
    return { x: w.x, y: w.y };
  });
  await g.tapWorld(mover0.x, mover0.y);
  const L = Math.hypot(blocker.x - mover0.x, blocker.y - mover0.y);
  const tgt = { x: blocker.x + (blocker.x - mover0.x) / L * 170,
                y: blocker.y + (blocker.y - mover0.y) / L * 170 };
  await g.tapWorld(tgt.x, tgt.y);
  let minD = Infinity, shared = false;
  done = false;
  for (let i = 0; i < 80 && !done; i++) {
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
  for (let i = 0; i < 140 && !done; i++) {
    await page.waitForTimeout(120);
    const s = await page.evaluate(() => {
      const w = Entities.list.find(e => e.type === 'worker');
      const end = w.route && w.route.length ? w.route[w.route.length - 1] : null;
      return { leg: end ? Math.hypot(end.x - w.x, end.y - w.y) : 0,
               coarse: w.coarse ? w.coarse.length : 0, done: !w.cmd };
    });
    maxLeg = Math.max(maxLeg, s.leg);
    if (s.coarse > prevCoarse) grew = true;
    if (s.coarse) prevCoarse = s.coarse;
    done = s.done;
  }
  assert(done, 'long trip never finished');
  assert(maxLeg < 9 * 32, `fine leg too long: ${maxLeg.toFixed(0)}px`);
  assert(!grew, 'coarse route grew mid-trip (full replan happened)');

  assert(g.errors.length === 0, 'console errors: ' + g.errors.join(' | '));
  await g.browser.close();
};
