// Renders static/world SVG. Step 1: the tile grid + macro overlay.
const Render = {
  gridEl: null,
  showMacro: true,

  init() {
    this.gridEl = document.getElementById('layer-grid');
    this.drawGrid();
  },

  drawGrid() {
    const T = CONFIG.TILE;
    const W = GameMap.w, H = GameMap.h;
    const pxW = W * T, pxH = H * T;

    // Background rect for the playable area.
    let svg = `<rect class="mapbg" x="0" y="0" width="${pxW}" height="${pxH}" />`;

    // Micro grid lines (skip lines that coincide with macro lines when macro on).
    const macro = GameMap.macro;
    let micro = '';
    for (let x = 0; x <= W; x++) {
      if (this.showMacro && x % macro === 0) continue;
      micro += `M${x * T} 0V${pxH}`;
    }
    for (let y = 0; y <= H; y++) {
      if (this.showMacro && y % macro === 0) continue;
      micro += `M0 ${y * T}H${pxW}`;
    }
    svg += `<path class="micro" d="${micro}" />`;

    // Macro grid lines (bolder).
    if (this.showMacro) {
      let mac = '';
      for (let x = 0; x <= W; x += macro) mac += `M${x * T} 0V${pxH}`;
      for (let y = 0; y <= H; y += macro) mac += `M0 ${y * T}H${pxW}`;
      svg += `<path class="macro" d="${mac}" />`;
    }

    this.gridEl.innerHTML = svg;
  },

  toggleMacro() {
    this.showMacro = !this.showMacro;
    this.drawGrid();
    return this.showMacro;
  },
};
