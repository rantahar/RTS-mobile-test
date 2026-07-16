// Camera maps world (px) <-> screen (px).
// screen = (world - cam) * zoom     |     world = screen / zoom + cam
// cam.x / cam.y are the world coords shown at the top-left of the viewport.
const Camera = {
  x: 0,
  y: 0,
  zoom: 1,

  // Apply the current transform to the <g id="world"> element.
  apply(worldEl) {
    worldEl.setAttribute(
      'transform',
      `translate(${-this.x * this.zoom} ${-this.y * this.zoom}) scale(${this.zoom})`
    );
  },

  // Convert a screen point (relative to the svg element) into world coords.
  screenToWorld(sx, sy) {
    return { x: sx / this.zoom + this.x, y: sy / this.zoom + this.y };
  },

  // Center the camera on a world point given the viewport size in px.
  centerOnWorld(wx, wy, vw, vh) {
    this.x = wx - (vw / this.zoom) / 2;
    this.y = wy - (vh / this.zoom) / 2;
  },

  setZoom(z, vw, vh, anchorSx, anchorSy) {
    z = Math.max(CONFIG.MIN_ZOOM, Math.min(CONFIG.MAX_ZOOM, z));
    if (anchorSx == null) { anchorSx = vw / 2; anchorSy = vh / 2; }
    // Keep the world point under the anchor fixed while zooming.
    const before = this.screenToWorld(anchorSx, anchorSy);
    this.zoom = z;
    const after = this.screenToWorld(anchorSx, anchorSy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp(vw, vh);
  },

  // Keep the view near the map: at most ~4 tiles of void on any side.
  // If the whole map (plus padding) fits on the axis, center it instead.
  clamp(vw, vh) {
    const pad = CONFIG.TILE * 4;
    const w = vw / this.zoom, h = vh / this.zoom;
    if (w >= CONFIG.MAP_PX_W + 2 * pad) this.x = (CONFIG.MAP_PX_W - w) / 2;
    else this.x = Math.max(Math.min(this.x, CONFIG.MAP_PX_W + pad - w), -pad);
    if (h >= CONFIG.MAP_PX_H + 2 * pad) this.y = (CONFIG.MAP_PX_H - h) / 2;
    else this.y = Math.max(Math.min(this.y, CONFIG.MAP_PX_H + pad - h), -pad);
  },
};
