// Entity rendering. The ONLY module that touches entity DOM: it owns the
// id -> <g> element map, creates/removes elements via Entities.hooks, and
// once per frame mirrors model state (position, carrying, selected) into
// the SVG. Entities/Sim/Selection stay plain data and stay testable headless.
const View = {
  layer: null,
  els: new Map(),

  init() {
    this.layer = document.getElementById('layer-entities');
  },

  add(e) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `entity ${e.kind} ${e.type}`);
    g.dataset.id = e.id;
    g.innerHTML = e.def.svg(e);
    g.setAttribute('transform', `translate(${e.x} ${e.y})`);
    if (e.kind === 'structure' && e.underConstruction) this._addSiteBar(e, g);
    this.els.set(e.id, g);
    this.layer.appendChild(g);
  },

  // Progress bar floating above a construction site; removed on completion.
  _addSiteBar(e, g) {
    const T = CONFIG.TILE;
    const w = e.w * T - 10;
    const y = -(e.h * T) / 2 - 12;
    const bar = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    bar.setAttribute('class', 'sitebar');
    bar.innerHTML = `
      <rect class="pbg" x="${-w / 2}" y="${y}" width="${w}" height="5" rx="2"/>
      <rect class="pfill" x="${-w / 2}" y="${y}" width="0" height="5" rx="2"/>`;
    g.appendChild(bar);
    g._pfill = bar.lastElementChild;
    g._pbarW = w;
  },

  remove(e) {
    const el = this.els.get(e.id);
    if (el) el.remove();
    this.els.delete(e.id);
  },

  // Called once per frame after Sim.tick.
  sync() {
    for (const e of Entities.list) {
      const el = this.els.get(e.id);
      if (!el) continue;
      if (e.kind === 'unit') {
        el.setAttribute('transform', `translate(${e.x} ${e.y})`);
        el.classList.toggle('carrying', !!e.carrying);
      } else {
        el.classList.toggle('unbuilt', !!e.underConstruction);
        if (el._pfill) {
          if (e.underConstruction) {
            const frac = Math.min(1, e.progress / e.def.buildTime);
            el._pfill.setAttribute('width', el._pbarW * frac);
          } else {
            el._pfill.parentNode.remove();
            el._pfill = null;
          }
        }
      }
      el.classList.toggle('selected', Selection.ids.has(e.id));
    }
  },
};
