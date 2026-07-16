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
  },
};
