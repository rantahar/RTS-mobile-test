// Entry point: wires everything together, owns the HUD and command issuing.
const Game = {
  svg: null,
  world: null,
  overlay: null,
  boxEl: null,
  ore: 0,
  placing: null, // structure type being placed (build button armed), or null

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
    Sim.hooks.completed = (s) => {
      this.pulse(s.x, s.y, 'goto');
      this.updateSelInfo(); // a selected site may now offer training
    };
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
    if (this.placing) { this.tryPlace(w); return; } // armed build button
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

  // Train the unit type a specific building's type says it trains.
  trainUnit(b) {
    if (!b || !b.def.trains || b.underConstruction) return;
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

  // ---- Building placement ----

  // Build button tapped: arm (or disarm) placement; the next map tap places.
  togglePlacing(type) {
    this.placing = this.placing === type ? null : type;
    this.updateSelInfo();
  },

  cancelPlacing() {
    if (!this.placing) return;
    this.placing = null;
    this.updateSelInfo();
  },

  // A tap landed while a build button is armed: snap the footprint so its
  // center is under the finger, validate, pay, spawn the site, and send the
  // selected builders to work on it.
  tryPlace(w) {
    const type = this.placing;
    const def = Types[type];
    const tx = Math.round(w.x / CONFIG.TILE - def.w / 2);
    const ty = Math.round(w.y / CONFIG.TILE - def.h / 2);
    if (!Entities.canPlace(type, tx, ty)) {
      this.flashFootprint(def, tx, ty, false); // stay armed, let them re-tap
      return;
    }
    if (this.ore < def.cost) { this.cancelPlacing(); return; }
    this.addOre(-def.cost);
    const site = Entities.spawnStructure(type, tx, ty, 0, true);
    this.placing = null;
    const builders = Selection.entities.filter(u =>
      u.kind === 'unit' && (u.def.builds || []).includes(type));
    for (const u of builders) {
      Sim.clearPath(u);
      u.cmd = { type: 'build', siteId: site.id };
    }
    this.flashFootprint(def, tx, ty, true);
    this.updateSelInfo();
  },

  // Brief footprint outline at a placement attempt (green ok / red invalid).
  flashFootprint(def, tx, ty, ok) {
    const T = CONFIG.TILE;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `place-flash ${ok ? 'ok' : 'bad'}`);
    g.innerHTML = `<rect x="${tx * T}" y="${ty * T}" width="${def.w * T}" height="${def.h * T}" rx="6">
      <animate attributeName="opacity" from="1" to="0" dur="0.6s" fill="freeze"/></rect>`;
    this.overlay.appendChild(g);
    setTimeout(() => g.remove(), 650);
  },

  // ---- Dynamic action bar: buttons come from what is selected ----

  // Describe the buttons the current selection should offer. Structure types
  // that train get a train button; units that build get build buttons; any
  // unit selected gets Stop.
  actionButtons() {
    const btns = [];
    const sel = Selection.entities;
    const units = sel.filter(e => e.kind === 'unit');

    const buildable = new Set();
    for (const u of units) for (const t of u.def.builds || []) buildable.add(t);
    for (const t of buildable) {
      const def = Types[t];
      btns.push({
        id: `btn-build-${t}`,
        label: `${def.name} ◆${def.cost}`,
        pressed: this.placing === t,
        disabled: this.ore < def.cost,
        onTap: () => this.togglePlacing(t),
      });
    }

    const trainers = new Map(); // one button per building type; first one trains
    for (const e of sel) {
      if (e.kind === 'structure' && e.def.trains && !e.underConstruction &&
          !trainers.has(e.type)) trainers.set(e.type, e);
    }
    for (const b of trainers.values()) {
      const def = Types[b.def.trains];
      btns.push({
        id: `btn-train-${b.def.trains}`,
        label: `${def.name} ◆${def.cost}`,
        disabled: this.ore < def.cost,
        onTap: () => this.trainUnit(b),
      });
    }

    if (units.length) {
      btns.push({
        id: 'btn-stop',
        label: 'Stop',
        onTap: () => { for (const u of units) Sim.stopUnit(u); },
      });
    }
    return btns;
  },

  // Rebuild the bar only when the button SET changes; otherwise just refresh
  // disabled/pressed state, so an ore tick mid-tap can't eat the press.
  updateActionBar() {
    const bar = document.getElementById('actions');
    if (!bar) return;
    const btns = this.actionButtons();
    const key = btns.map(b => b.id + b.label).join('|');
    if (key !== this._barKey) {
      this._barKey = key;
      bar.innerHTML = '';
      this._barTaps = btns.map(b => b.onTap);
      btns.forEach((b, i) => {
        const el = document.createElement('button');
        el.className = 'btn';
        el.id = b.id;
        el.textContent = b.label;
        el.addEventListener('click', () => this._barTaps[i]());
        bar.appendChild(el);
      });
    } else {
      this._barTaps = btns.map(b => b.onTap); // rebind to current entities
    }
    btns.forEach((b, i) => {
      const el = bar.children[i];
      el.disabled = !!b.disabled;
      el.setAttribute('aria-pressed', String(!!b.pressed));
    });
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
    this.updateActionBar();
  },

  updateSelInfo() {
    // Disarm placement if the selection can no longer build the armed type.
    if (this.placing) {
      const can = Selection.entities.some(u =>
        u.kind === 'unit' && (u.def.builds || []).includes(this.placing));
      if (!can) this.placing = null;
    }
    this.updateActionBar();
    const el = document.getElementById('selinfo');
    if (!el) return;
    if (this.placing) {
      el.textContent = `Tap map: place ${Types[this.placing].name}`;
      return;
    }
    const es = Selection.entities;
    if (!es.length) { el.textContent = ''; return; }
    const counts = {};
    for (const e of es) {
      const name = e.def.name + (e.underConstruction ? ' (site)' : '');
      counts[name] = (counts[name] || 0) + 1;
    }
    el.textContent = Object.entries(counts)
      .map(([name, n]) => n > 1 ? `${name} ×${n}` : name)
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
    // Deselect: clear the selection (long tap does the same). Also disarms
    // an armed build button. Stop/Train/Build live in the dynamic action bar.
    document.getElementById('btn-deselect').addEventListener('click', () => {
      this.cancelPlacing();
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
