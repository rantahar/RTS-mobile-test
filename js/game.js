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

    Hex.init();
    Sim.init();
    Render.init();
    View.init();
    Input.init(this.svg, this.world);

    // Model -> app/view wiring.
    Entities.hooks.spawned = (e) => View.add(e);
    Entities.hooks.removed = (e) => {
      View.remove(e);
      if (e.kind === 'structure' && Render.showHex) Render.drawGrid();
    };
    Sim.hooks.deposit = (n) => this.addOre(n);
    Selection.onChange = () => this.updateSelInfo();

    this.spawnStartLayout();

    Camera.zoom = 1;
    this.centerCamera();

    this.wireButtons();
    this.updateReadout();
    this.updateSelInfo();
    this.updateOre();

    this.startLoop();

    window.addEventListener('resize', () => {
      Camera.apply(this.world);
      this.updateReadout();
    });
  },

  // Frame loop: step the simulation, then mirror model state into the SVG.
  startLoop() {
    let last = null;
    const frame = (ts) => {
      if (last == null) last = ts;
      const dt = Math.min((ts - last) / 1000, 0.05); // clamp tab-sleep jumps
      last = ts;
      Sim.tick(dt);
      View.sync();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  },

  spawnStartLayout() {
    Entities.spawnStructure('hq', 15, 18);
    Entities.spawnStructure('node', 24, 14);
    const tc = (tx, ty) => GameMap.tileToWorldCenter(tx, ty);
    let p = tc(22, 21); Entities.spawnUnit('worker', p.x, p.y);
    p = tc(23, 23); Entities.spawnUnit('worker', p.x, p.y);
    p = tc(21, 24); Entities.spawnUnit('worker', p.x, p.y);
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

  // Route a command tap: each unit's TYPE decides what to do about the
  // target (def.orderAt); units with no specific reaction group-move to it.
  issueCommand(sel, hit, w) {
    const units = sel.filter(e => e.kind === 'unit');

    if (hit) {
      const movers = [];
      let commanded = false;
      for (const u of units) {
        if (u.id === hit.id) continue;
        const cmd = u.def.orderAt && u.def.orderAt(u, hit);
        if (cmd) {
          Sim.clearPath(u);
          u.cmd = cmd;
          commanded = true;
        } else {
          movers.push(u);
        }
      }
      if (movers.length) this.moveGroup(movers, hit.x, hit.y);
      if (commanded || movers.length) {
        this.pulse(hit.x, hit.y, hit.def.mineable ? 'mine' : 'goto');
      }
      return;
    }

    if (units.length) {
      this.moveGroup(units, w.x, w.y);
      this.pulse(w.x, w.y, 'move');
    }
  },

  // Send a group to a point; each unit gets its own free hex near the target,
  // so groups settle into a hex-packed cluster instead of fighting over one spot.
  moveGroup(units, x, y) {
    const h0 = Hex.fromWorld(x, y);
    if (!h0) return;
    const taken = new Set();
    for (const u of units) {
      Sim.clearPath(u);
      const d = Hex.nearestFree(h0.col, h0.row, u, taken);
      if (!d) { u.cmd = null; continue; }
      taken.add(Hex.idx(d.col, d.row));
      u.cmd = { type: 'move', col: d.col, row: d.row };
    }
  },

  // ---- Training ----

  // Train whatever unit the selected building's type says it trains.
  trainUnit() {
    const b = Selection.entities.find(e => e.def.trains);
    if (!b) return;
    const def = Types[b.def.trains];
    if (this.ore < def.cost) return;
    const hc = Hex.fromWorld(b.x, b.y + (b.h / 2) * CONFIG.TILE); // bias toward the door side
    const h = hc && Hex.bestAdjacent(b, hc.col, hc.row, null);
    if (!h) return; // completely walled in
    this.addOre(-def.cost);
    const c = Hex.centerOf(h.col, h.row);
    const u = Entities.spawnUnit(b.def.trains, c.x, c.y, b.owner);
    if (u) this.pulse(u.x, u.y, 'goto');
  },

  updateTrainBtn() {
    const btn = document.getElementById('btn-train');
    if (!btn) return;
    const b = Selection.entities.find(e => e.def && e.def.trains);
    const def = b && Types[b.def.trains];
    if (def) btn.textContent = `${def.name} ◆${def.cost}`;
    btn.disabled = !(def && this.ore >= def.cost);
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
    this.updateTrainBtn();
  },

  updateSelInfo() {
    this.updateTrainBtn();
    const el = document.getElementById('selinfo');
    if (!el) return;
    const es = Selection.entities;
    if (!es.length) { el.textContent = ''; return; }
    const counts = {};
    for (const e of es) counts[e.type] = (counts[e.type] || 0) + 1;
    el.textContent = Object.entries(counts)
      .map(([t, n]) => n > 1 ? `${Types[t].name} ×${n}` : Types[t].name)
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
    document.getElementById('btn-hex').addEventListener('click', (e) => {
      const on = Render.toggleHex();
      e.currentTarget.setAttribute('aria-pressed', String(on));
    });
    // Stop: halt commands of selected units, keep the selection.
    document.getElementById('btn-stop').addEventListener('click', () => {
      for (const e of Selection.entities) if (e.kind === 'unit') Sim.stopUnit(e);
    });
    // Deselect: clear the selection (long tap does the same).
    document.getElementById('btn-deselect').addEventListener('click', () => {
      Selection.clear();
    });
    // Train a unit at the selected building (type-driven).
    document.getElementById('btn-train').addEventListener('click', () => {
      this.trainUnit();
    });
  },

  updateReadout() {
    const el = document.getElementById('readout');
    if (!el) return;
    el.textContent = `z${Camera.zoom.toFixed(2)}  ${Math.round(Camera.x)},${Math.round(Camera.y)}`;
  },
};

window.addEventListener('DOMContentLoaded', () => Game.init());
