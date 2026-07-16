// Current selection (set of entity ids) + highlight visuals.
const Selection = {
  ids: new Set(),

  get entities() {
    return [...this.ids].map(id => Entities.byId.get(id)).filter(Boolean);
  },

  clear() {
    for (const id of this.ids) {
      const e = Entities.byId.get(id);
      if (e) e.el.classList.remove('selected');
    }
    this.ids.clear();
    Game.updateSelInfo();
  },

  setTo(list) {
    this.clear();
    for (const e of list) {
      this.ids.add(e.id);
      e.el.classList.add('selected');
    }
    Game.updateSelInfo();
  },
};
