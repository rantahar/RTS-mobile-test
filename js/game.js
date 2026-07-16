// Entry point: wires everything together.
const Game = {
  svg: null,
  world: null,
  overlay: null,
  boxEl: null,

  init() {
    this.svg = document.getElementById('view');
    this.world = document.getElementById('world');
    this.overlay = document.getElementById('layer-overlay');

    Render.init();
    Entities.init();
    Input.init(this.svg, this.world);

    this.spawnStartLayout();

    // Start centered on the map at a comfortable zoom.
    Camera.zoom = 1;
    this.centerCamera();

    this.wireButtons();
    this.updateReadout();
    this.updateSelInfo();

    window.addEventListener('resize', () => {
      Camera.apply(this.world);
      this.updateReadout();
    });
  },

  spawnStartLayout() {
    // Main building 5x5, resource node 2x2, a few workers 1x1.
    Entities.spawnStructure('hq', 15, 18, 5, 5);
    Entities.spawnStructure('node', 24, 14, 2, 2);
    Entities.spawnUnit('worker', 22, 21);
    Entities.spawnUnit('worker', 23, 23);
    Entities.spawnUnit('worker', 21, 24);
  },

  centerCamera() {
    const vw = this.svg.clientWidth, vh = this.svg.clientHeight;
    Camera.centerOnWorld(CONFIG.MAP_PX_W / 2, CONFIG.MAP_PX_H / 2, vw, vh);
    Camera.apply(this.world);
  },

  // ---- Selection interactions ----

  onTap(w) {
    const slop = 12 / Camera.zoom; // finger-friendly hit slop in world px
    const e = Entities.at(w.x, w.y, slop);
    if (e) Selection.setTo([e]);
    else Selection.clear();
  },

  showBox(a, b) {
    if (!this.boxEl) {
      this.boxEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      this.boxEl.id = 'boxsel';
      this.overlay.appendChild(this.boxEl);
    }
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    this.boxEl.setAttribute('x', x);
    this.boxEl.setAttribute('y', y);
    this.boxEl.setAttribute('width', Math.abs(b.x - a.x));
    this.boxEl.setAttribute('height', Math.abs(b.y - a.y));
    this.boxEl.style.display = '';
  },

  hideBox() {
    if (this.boxEl) this.boxEl.style.display = 'none';
  },

  onBoxEnd(a, b) {
    this.hideBox();
    Selection.setTo(Entities.inRect(a.x, a.y, b.x, b.y));
  },

  updateSelInfo() {
    const el = document.getElementById('selinfo');
    if (!el) return;
    const es = Selection.entities;
    if (!es.length) { el.textContent = ''; return; }
    const names = { hq: 'Main Building', node: 'Resource', worker: 'Worker' };
    const counts = {};
    for (const e of es) counts[e.type] = (counts[e.type] || 0) + 1;
    el.textContent = Object.entries(counts)
      .map(([t, n]) => n > 1 ? `${names[t]} ×${n}` : names[t])
      .join(', ');
  },

  // ---- Buttons / readout ----

  wireButtons() {
    const vp = () => ({ vw: this.svg.clientWidth, vh: this.svg.clientHeight });

    document.getElementById('btn-recenter').addEventListener('click', () => {
      this.centerCamera();
      this.updateReadout();
    });
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      const { vw, vh } = vp();
      Camera.setZoom(Camera.zoom * CONFIG.ZOOM_STEP, vw, vh);
      Camera.apply(this.world);
      this.updateReadout();
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      const { vw, vh } = vp();
      Camera.setZoom(Camera.zoom / CONFIG.ZOOM_STEP, vw, vh);
      Camera.apply(this.world);
      this.updateReadout();
    });
    document.getElementById('btn-macro').addEventListener('click', (e) => {
      const on = Render.toggleMacro();
      e.currentTarget.setAttribute('aria-pressed', String(on));
    });
  },

  updateReadout() {
    const el = document.getElementById('readout');
    if (!el) return;
    el.textContent = `z${Camera.zoom.toFixed(2)}  ${Math.round(Camera.x)},${Math.round(Camera.y)}`;
  },
};

window.addEventListener('DOMContentLoaded', () => Game.init());
