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
    this.els.set(e.id, g);
    this.layer.appendChild(g);
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
      }
      el.classList.toggle('selected', Selection.ids.has(e.id));
    }
  },
};
