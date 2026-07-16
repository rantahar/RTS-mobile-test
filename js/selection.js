// Current selection: a set of entity ids, no DOM. View.sync renders the
// highlight; onChange (assigned by Game) refreshes the HUD.
const Selection = {
  ids: new Set(),
  onChange() {}, // assigned by the app layer

  get entities() {
    return [...this.ids].map(id => Entities.byId.get(id)).filter(Boolean);
  },

  clear() {
    if (!this.ids.size) return;
    this.ids.clear();
    this.onChange();
  },

  setTo(list) {
    this.ids.clear();
    for (const e of list) this.ids.add(e.id);
    this.onChange();
  },

  // Drop one id (e.g. the entity was removed from the game).
  remove(id) {
    if (this.ids.delete(id)) this.onChange();
  },
};
