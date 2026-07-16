// Camera math and tile-map coordinate transforms.
exports.tests = [

  ['screenToWorld/centerOn round trip', ({ loadGame, close }) => {
    const { Camera } = loadGame();
    Camera.zoom = 1.7;
    Camera.centerOnWorld(500, 600, 390, 700);
    const c = Camera.screenToWorld(390 / 2, 700 / 2);
    close(c.x, 500, 1e-6, 'center x');
    close(c.y, 600, 1e-6, 'center y');
  }],

  ['setZoom keeps the anchor point fixed', ({ loadGame, close }) => {
    const { Camera } = loadGame();
    Camera.x = 100; Camera.y = 150; Camera.zoom = 1;
    const before = Camera.screenToWorld(120, 300);
    Camera.setZoom(1.8, 390, 700, 120, 300);
    const after = Camera.screenToWorld(120, 300);
    close(after.x, before.x, 1e-6, 'anchor x moved');
    close(after.y, before.y, 1e-6, 'anchor y moved');
  }],

  ['setZoom clamps to config bounds', ({ loadGame, assert }) => {
    const { Camera, CONFIG } = loadGame();
    Camera.setZoom(99, 390, 700);
    assert(Camera.zoom === CONFIG.MAX_ZOOM, 'max zoom not clamped');
    Camera.setZoom(0.001, 390, 700);
    assert(Camera.zoom === CONFIG.MIN_ZOOM, 'min zoom not clamped');
  }],

  ['clamp keeps the view near the map', ({ loadGame, assert }) => {
    const { Camera, CONFIG } = loadGame();
    Camera.zoom = 1;
    Camera.x = -10000; Camera.y = 10000;
    Camera.clamp(390, 700);
    const pad = CONFIG.TILE * 4;
    assert(Camera.x >= -pad, 'x below lower clamp');
    assert(Camera.y <= CONFIG.MAP_PX_H + pad - 700, 'y above upper clamp');
  }],

  ['tile <-> world round trips', ({ loadGame, assert }) => {
    const { GameMap } = loadGame();
    for (const [tx, ty] of [[0, 0], [5, 7], [41, 41]]) {
      const c = GameMap.tileToWorldCenter(tx, ty);
      const t = GameMap.worldToTile(c.x, c.y);
      assert(t.tx === tx && t.ty === ty, `round trip failed for ${tx},${ty}`);
    }
  }],

  ['micro -> macro mapping', ({ loadGame, assert }) => {
    const { GameMap } = loadGame();
    assert(GameMap.microToMacro(0, 0).mx === 0, 'origin macro');
    assert(GameMap.microToMacro(2, 2).mx === 0, 'still first macro');
    assert(GameMap.microToMacro(3, 0).mx === 1, 'second macro');
    const m = GameMap.microToMacro(41, 41);
    assert(m.mx === 13 && m.my === 13, 'last macro');
  }],
];
