// UI smoke: page loads clean, bars fit, toggles and zoom buttons work.
const { launchGame, assert } = require('./helpers');

exports.run = async () => {
  const g = await launchGame();
  const { page } = g;

  const bars = await page.evaluate(() => ({
    topOverflow: document.getElementById('topbar').scrollWidth >
                 document.getElementById('topbar').clientWidth,
    grid: document.getElementById('layer-grid').children.length,
    entities: document.getElementById('layer-entities').children.length,
  }));
  assert(!bars.topOverflow, 'top bar overflows viewport');
  assert(bars.grid >= 2, 'grid not drawn');
  assert(bars.entities === 6, `expected 6 entities, got ${bars.entities}`);
  assert(await page.evaluate(() => !!document.querySelector('.entity.barracks.p1')),
    'enemy barracks missing or not styled as enemy');

  const z0 = await page.evaluate(() => Camera.zoom);
  await page.click('#btn-zoom-in');
  const z1 = await page.evaluate(() => Camera.zoom);
  assert(z1 > z0, 'zoom-in did not zoom');
  await page.click('#btn-zoom-out');
  await page.click('#btn-recenter');

  await page.click('#btn-hex');
  assert(await page.evaluate(() => !!document.querySelector('.hexdots')), 'hex overlay missing');
  await page.click('#btn-hex');
  await page.click('#btn-macro');
  assert(await page.evaluate(() => document.querySelectorAll('.macro').length === 0),
    'macro overlay still drawn after toggle off');
  await page.click('#btn-macro');

  assert(g.errors.length === 0, 'console errors: ' + g.errors.join(' | '));
  await g.browser.close();
};
