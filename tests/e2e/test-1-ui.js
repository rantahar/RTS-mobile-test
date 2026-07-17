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
    nova: document.getElementById('nova').textContent,
    score: document.getElementById('score').textContent,
  }));
  assert(!bars.topOverflow, 'top bar overflows viewport');
  assert(bars.grid >= 2, 'grid not drawn');
  // Start layout: 1 command center + 6 ore veins + 3 workers.
  assert(bars.entities === 10, `expected 10 entities, got ${bars.entities}`);
  assert(/\d:\d\d/.test(bars.nova), 'nova countdown not shown: ' + bars.nova);
  assert(bars.score.includes('0'), 'score readout missing');

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
