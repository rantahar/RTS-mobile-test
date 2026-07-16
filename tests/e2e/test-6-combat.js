// Combat + group buttons + lab research, driven through the real UI.
const { launchGame, assert } = require('./helpers');

exports.run = async () => {
  const g = await launchGame();
  const { page } = g;

  await page.evaluate(() => { Game.ore = 200; Game.updateOre(); });

  // Two own soldiers and one enemy soldier, out of aggro range of each other.
  await page.evaluate(() => {
    Entities.spawnUnit('soldier', 560, 900, 0);
    Entities.spawnUnit('soldier', 590, 940, 0);
    Entities.spawnUnit('soldier', 790, 900, 1);
  });

  // Box-select the own soldiers; tap the enemy -> attack command.
  await g.dragWorld(510, 850, 650, 970);
  assert((await g.selInfo()).includes('Soldier ×2'),
    'box select missed own soldiers: ' + await g.selInfo());
  await g.tapWorld(790, 900);
  const cmds = await page.evaluate(() =>
    Entities.list.filter(e => e.type === 'soldier' && e.owner === 0)
      .map(e => e.cmd && e.cmd.type));
  assert(cmds.every(c => c === 'attack'), `attack order not issued: ${cmds}`);

  // The enemy soldier dies to focused fire.
  let dead = false;
  for (let i = 0; i < 24 && !dead; i++) {
    await page.waitForTimeout(500);
    dead = await page.evaluate(() =>
      !Entities.list.some(e => e.kind === 'unit' && e.owner === 1));
  }
  assert(dead, 'enemy soldier survived the attack');
  const own = await page.evaluate(() =>
    Entities.list.filter(e => e.type === 'soldier' && e.owner === 0).length);
  assert(own === 2, `own soldiers died fighting one enemy (${own} left)`);

  // Group buttons: Army selects the soldiers, Idle selects the workers.
  await page.click('#btn-deselect');
  await page.click('#groupbar [data-group="army"]');
  assert((await g.selInfo()).includes('Soldier ×2'), 'Army button failed');
  await page.click('#groupbar [data-group="idle"]');
  assert((await g.selInfo()).includes('Worker ×3'), 'Idle button failed');
  await page.click('#groupbar [data-group="mains"]');
  assert((await g.selInfo()).includes('Main Building'), 'HQ button failed');

  // Assignable group: hold "1" to save, recall it after deselecting.
  await page.click('#groupbar [data-group="army"]');
  const b1 = await page.locator('#groupbar [data-group="g1"]').boundingBox();
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await page.click('#btn-deselect');
  assert((await g.selInfo()) === '', 'deselect failed');
  await page.click('#groupbar [data-group="g1"]');
  assert((await g.selInfo()).includes('Soldier ×2'), 'group 1 recall failed');

  // Lab research: select a finished lab, buy Weapons L1, fast-forward.
  await page.evaluate(() => {
    const lab = Entities.spawnStructure('lab', 25, 28, 0);
    Selection.setTo([lab]);
  });
  const oreBefore = await page.evaluate(() => Game.ore);
  await page.click('#btn-up-weapons');
  const started = await page.evaluate(() => ({
    ore: Game.ore,
    researching: !!Entities.list.find(e => e.type === 'lab').research,
    disabled: document.getElementById('btn-up-weapons').disabled,
  }));
  assert(started.researching, 'research did not start');
  assert(started.ore === oreBefore - 30, `research cost wrong (${oreBefore} -> ${started.ore})`);
  assert(started.disabled, 'upgrade button still enabled while researching');
  await page.evaluate(() => {
    const lab = Entities.list.find(e => e.type === 'lab');
    lab.research.t = lab.research.total - 0.2;
  });
  await page.waitForTimeout(800);
  const lvl = await page.evaluate(() => Sim.upgradeLevel(0, 'weapons'));
  assert(lvl === 1, `expected weapons level 1, got ${lvl}`);
  assert((await page.evaluate(() =>
    document.getElementById('btn-up-weapons').textContent)).includes('L2'),
    'upgrade button did not advance to L2');

  assert(g.errors.length === 0, 'console errors: ' + g.errors.join(' | '));
  await g.browser.close();
};
