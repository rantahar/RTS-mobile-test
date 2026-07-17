// Map menu: reads the current seed, applies a typed seed, rolls a random map,
// and switches to the legacy layout — each by reloading with ?seed=<value>.
const { launchGame, assert } = require('./helpers');

exports.run = async () => {
  const g = await launchGame({ seed: 1337 });
  const { page } = g;

  // Opening the menu reports the current seed and prefills the input.
  await page.click('#btn-map');
  let m = await page.evaluate(() => ({
    visible: !document.getElementById('mapmenu').classList.contains('hidden'),
    current: document.getElementById('seed-current').textContent,
    input: document.getElementById('seed-input').value,
  }));
  assert(m.visible, 'map menu did not open');
  assert(m.current.includes('1337'), 'current seed not shown: ' + m.current);
  assert(m.input === '1337', 'input not prefilled with current seed: ' + m.input);

  // Close hides it again.
  await page.click('#btn-seed-close');
  assert(await page.evaluate(() => document.getElementById('mapmenu').classList.contains('hidden')),
    'close did not hide the menu');

  // Apply a typed seed -> reloads onto that map.
  await page.click('#btn-map');
  await page.fill('#seed-input', '2024');
  await page.click('#btn-seed-apply');
  await page.waitForTimeout(600);
  let s = await page.evaluate(() => ({
    search: location.search, seed: CONFIG.MAP_SEED,
    terrain: GameMap.hasTerrain,
    base: Entities.list.some(e => e.def.depot && e.owner === 0),
  }));
  assert(s.search === '?seed=2024', 'URL seed not applied: ' + s.search);
  assert(s.seed === 2024, 'CONFIG seed not applied: ' + s.seed);
  assert(s.terrain, 'generated map has no terrain');
  assert(s.base, 'no base after applying a seed');

  // "New map" rolls a different random seed.
  await page.click('#btn-map');
  await page.click('#btn-seed-random');
  await page.waitForTimeout(600);
  const rolled = await page.evaluate(() => CONFIG.MAP_SEED);
  assert(Number.isFinite(rolled) && rolled !== 2024, 'random map did not change the seed: ' + rolled);

  // "none" switches to the legacy hand-placed layout (no terrain).
  await page.click('#btn-map');
  await page.fill('#seed-input', 'none');
  await page.click('#btn-seed-apply');
  await page.waitForTimeout(600);
  const legacy = await page.evaluate(() => ({
    seed: CONFIG.MAP_SEED, terrain: GameMap.hasTerrain,
    entities: document.getElementById('layer-entities').children.length,
    currentText: (document.getElementById('seed-current').textContent || ''),
  }));
  assert(legacy.seed === null, 'legacy layout did not null the seed: ' + legacy.seed);
  assert(!legacy.terrain, 'legacy layout should have no terrain');
  assert(legacy.entities === 6, `legacy layout expected 6 entities, got ${legacy.entities}`);

  // Menu reports "legacy" when no seed is active.
  await page.click('#btn-map');
  const curText = await page.evaluate(() => document.getElementById('seed-current').textContent);
  assert(/legacy/i.test(curText), 'menu should report legacy layout: ' + curText);

  assert(g.errors.length === 0, 'console errors: ' + g.errors.join(' | '));
  await g.browser.close();
};
