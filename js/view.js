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
    const owner = e.owner != null ? ` p${e.owner}` : '';
    g.setAttribute('class', `entity ${e.kind} ${e.type}${owner}`);
    g.dataset.id = e.id;
    g.innerHTML = e.def.svg(e);
    g.setAttribute('transform', `translate(${e.x} ${e.y})`);
    if (e.maxHp) this._addHpBar(e, g);
    this.els.set(e.id, g);
    this.layer.appendChild(g);
  },

  // Progress bar above a structure (construction or research); created
  // lazily by sync(), removed when the work finishes.
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

  // HP bar; hidden via CSS until the entity is damaged.
  _addHpBar(e, g) {
    const T = CONFIG.TILE;
    const w = e.kind === 'unit' ? e.r * 2 : e.w * T - 10;
    const y = e.kind === 'unit' ? -e.r - 9 : -(e.h * T) / 2 - 19;
    const bar = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    bar.setAttribute('class', 'hpbar');
    bar.innerHTML = `
      <rect class="bg" x="${-w / 2}" y="${y}" width="${w}" height="3.5" rx="1.5"/>
      <rect class="fill" x="${-w / 2}" y="${y}" width="${w}" height="3.5" rx="1.5"/>`;
    g.appendChild(bar);
    g._hpfill = bar.lastElementChild;
    g._hpW = w;
  },

  // Fraction of structure work in progress (construction, research, or
  // unit production).
  _progressFrac(e) {
    if (e.underConstruction) return Math.min(1, e.progress / e.def.buildTime);
    if (e.research) return Math.min(1, e.research.t / e.research.total);
    if (e.queue && e.queue.length) {
      return 1 - e.trainT / Types[e.queue[0]].trainTime;
    }
    return null;
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
        const frac = this._progressFrac(e);
        if (frac != null) {
          if (!el._pfill) this._addSiteBar(e, el);
          el._pfill.setAttribute('width', el._pbarW * frac);
        } else if (el._pfill) {
          el._pfill.parentNode.remove();
          el._pfill = null;
        }
      }
      if (el._hpfill) {
        const hurt = e.hp < e.maxHp;
        el.classList.toggle('damaged', hurt);
        if (hurt) el._hpfill.setAttribute('width', el._hpW * Math.max(0, e.hp / e.maxHp));
      }
      el.classList.toggle('selected', Selection.ids.has(e.id));
    }
  },
};
