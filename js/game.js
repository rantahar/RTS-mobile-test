// Entry point: wires everything together, owns the HUD and command issuing.
const Game = {
  svg: null,
  world: null,
  overlay: null,
  boxEl: null,
  ore: 0,

  init() {
    this.svg = document.getElementById('view');
    this.world = document.getElementById('world');
    this.overlay = document.getElementById('layer-overlay');

    Render.init();
    Entities.init();
    Input.init(this.svg, this.world);

    this.spawnStartLayout();

    Camera.zoom = 1;
    this.centerCamera();

    this.wireButtons();
    this.updateReadout();
    this.updateSelInfo();
    this.updateOre();

    Sim.start();

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

  // ---- Tap: select when nothing is selected, otherwise command ----

  smartTap(w) {
    const slop = 12 / Camera.zoom; // finger-friendly hit slop in world px
    const hit = Entities.at(w.x, w.y, slop);
    const sel = Selection.entities;

    if (!sel.length) {
      if (hit) Selection.setTo([hit]);
      return;
    }
    this.issueCommand(sel, hit, w);
  },

  issueCommand(sel, hit, w) {
    const units = sel.filter(e => e.kind === 'unit');

    // Resource node: workers mine it, other units just walk to it.
    if (hit && hit.type === 'node') {
      const hq = Entities.list.find(e => e.type === 'hq');
      let any = false;
      for (const u of units) {
        if (u.type === 'worker') {
          u.cmd = { type: 'mine', nodeId: hit.id, hqId: hq && hq.id, phase: 'toNode' };
        } else {
          u.cmd = { type: 'moveRect', targetId: hit.id };
        }
        any = true;
      }
      if (any) this.pulse(hit.x, hit.y, 'mine');
      return;
    }

    // Structure: walk to its edge. (Later: rally, garrison, repair...)
    if (hit && hit.kind === 'structure') {
      for (const u of units) u.cmd = { type: 'moveRect', targetId: hit.id };
      if (units.length) this.pulse(hit.x, hit.y, 'goto');
      return;
    }

    // Unit: go to it. (Later: attack if enemy, follow if friendly.)
    if (hit && hit.kind === 'unit') {
      const movers = units.filter(u => u.id !== hit.id);
      this.moveGroup(movers, hit.x, hit.y);
      if (movers.length) this.pulse(hit.x, hit.y, 'goto');
      return;
    }

    // Ground: move command.
    if (units.length) {
      this.moveGroup(units, w.x, w.y);
      this.pulse(w.x, w.y, 'move');
    }
  },

  // Send a group to a point, spread over neighboring tiles so they don't stack.
  moveGroup(units, x, y) {
    const T = CONFIG.TILE;
    const offs = this.groupOffsets(units.length);
    units.forEach((u, i) => {
      u.cmd = { type: 'move', x: x + offs[i][0] * T, y: y + offs[i][1] * T };
    });
  },

  groupOffsets(n) {
    const offs = [[0, 0]];
    for (let ring = 1; offs.length < n; ring++) {
      for (let dx = -ring; dx <= ring && offs.length < n; dx++)
        for (let dy = -ring; dy <= ring && offs.length < n; dy++)
          if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) offs.push([dx, dy]);
    }
    return offs;
  },

  // Brief expanding-ring feedback at a command target.
  pulse(x, y, kind) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.innerHTML = `
      <circle class="pulse ${kind}" cx="${x}" cy="${y}" r="6">
        <animate attributeName="r" from="6" to="24" dur="0.45s" fill="freeze"/>
        <animate attributeName="opacity" from="1" to="0" dur="0.45s" fill="freeze"/>
      </circle>`;
    this.overlay.appendChild(g);
    setTimeout(() => g.remove(), 500);
  },

  // ---- Box select ----

  showBox(a, b) {
    if (!this.boxEl) {
      this.boxEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      this.boxEl.id = 'boxsel';
      this.overlay.appendChild(this.boxEl);
    }
    this.boxEl.setAttribute('x', Math.min(a.x, b.x));
    this.boxEl.setAttribute('y', Math.min(a.y, b.y));
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

  // ---- HUD ----

  addOre(n) {
    this.ore += n;
    this.updateOre();
  },

  updateOre() {
    const el = document.getElementById('ore');
    if (el) el.textContent = `◆ ${this.ore}`;
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
    // Stop: halt commands of selected units, keep the selection.
    document.getElementById('btn-stop').addEventListener('click', () => {
      for (const e of Selection.entities) if (e.kind === 'unit') e.cmd = null;
    });
    // Deselect: clear the selection (long tap does the same).
    document.getElementById('btn-deselect').addEventListener('click', () => {
      Selection.clear();
    });
  },

  updateReadout() {
    const el = document.getElementById('readout');
    if (!el) return;
    el.textContent = `z${Camera.zoom.toFixed(2)}  ${Math.round(Camera.x)},${Math.round(Camera.y)}`;
  },
};

window.addEventListener('DOMContentLoaded', () => Game.init());
