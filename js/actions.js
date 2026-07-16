// Named actions, decoupled from gestures. Input recognizes a gesture, looks up
// its action name in CONFIG.GESTURE_MAP, and dispatches here. To remap a
// gesture, edit the table in config.js; to add behavior, register it here.
//
// Discrete actions implement fire(data); continuous ones implement
// start/update/end/cancel(data). data: { w: world pt, s: screen pt } for
// one-finger gestures; { c: centroid, d: finger distance } for two-finger.
const Actions = {
  registry: {
    // Tap: select if nothing is selected, otherwise issue a context command
    // (ground = move, resource = mine, structure/unit = go to).
    smartTap: {
      fire(data) { Game.smartTap(data.w); },
    },

    // Clear the current selection.
    deselect: {
      fire() { Selection.clear(); },
    },

    // One-finger drag: rubber-band box select.
    boxSelect: {
      _anchor: null,
      start(data) { this._anchor = data.w; Game.showBox(data.w, data.w); },
      update(data) { if (this._anchor) Game.showBox(this._anchor, data.w); },
      end(data) {
        if (this._anchor) Game.onBoxEnd(this._anchor, data.w);
        this._anchor = null;
      },
      cancel() { this._anchor = null; Game.hideBox(); },
    },

    // Two-finger drag + pinch: camera pan/zoom.
    camera: {
      _c: null,
      _d: 0,
      start(data) { this._c = data.c; this._d = data.d; },
      update(data) {
        if (!this._c) return;
        const { vw, vh } = Input.viewport();
        if (this._d > 0 && data.d > 0) {
          Camera.setZoom(Camera.zoom * (data.d / this._d), vw, vh, data.c.x, data.c.y);
        }
        Camera.x -= (data.c.x - this._c.x) / Camera.zoom;
        Camera.y -= (data.c.y - this._c.y) / Camera.zoom;
        this._c = data.c;
        this._d = data.d;
        Camera.apply(Input.world);
        Game.updateReadout();
      },
      end() { this._c = null; },
      cancel() { this._c = null; },
    },
  },

  dispatch(gesture, phase, data) {
    const name = CONFIG.GESTURE_MAP[gesture];
    const action = name && this.registry[name];
    if (!action) return;
    const fn = action[phase];
    if (fn) fn.call(action, data);
  },
};
