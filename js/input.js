// Pointer/gesture handling.
// Step 1 scope:
//   - 2-finger drag  -> pan camera
//   - pinch          -> zoom
//   - buttons        -> center / zoom in / zoom out / toggle macro
// (1-finger tap / drag / hold are wired in later steps.)
const Input = {
  svg: null,
  world: null,
  pointers: new Map(),   // pointerId -> {x, y} in svg-local px
  gesture: null,         // 'twofinger' | null

  init(svg, world) {
    this.svg = svg;
    this.world = world;

    svg.addEventListener('pointerdown', (e) => this.onDown(e));
    svg.addEventListener('pointermove', (e) => this.onMove(e));
    svg.addEventListener('pointerup', (e) => this.onUp(e));
    svg.addEventListener('pointercancel', (e) => this.onUp(e));
    // Block iOS Safari pinch-zoom of the page.
    svg.addEventListener('gesturestart', (e) => e.preventDefault());
  },

  localPoint(e) {
    const r = this.svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  },

  viewport() {
    return { vw: this.svg.clientWidth, vh: this.svg.clientHeight };
  },

  onDown(e) {
    this.svg.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, this.localPoint(e));
    if (this.pointers.size === 2) {
      this.gesture = 'twofinger';
      this.twoStart();
    }
  },

  onMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, this.localPoint(e));
    if (this.gesture === 'twofinger' && this.pointers.size >= 2) {
      this.twoMove();
    }
  },

  onUp(e) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.gesture = null;
    Game.updateReadout();
  },

  // ---- Two-finger pan + pinch ----
  _prevCentroid: null,
  _prevDist: 0,

  twoPoints() {
    const pts = [...this.pointers.values()];
    return pts.slice(0, 2);
  },

  centroidDist() {
    const [a, b] = this.twoPoints();
    return {
      c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      d: Math.hypot(a.x - b.x, a.y - b.y),
    };
  },

  twoStart() {
    const { c, d } = this.centroidDist();
    this._prevCentroid = c;
    this._prevDist = d;
  },

  twoMove() {
    const { vw, vh } = this.viewport();
    const { c, d } = this.centroidDist();

    // Pinch zoom, anchored at the current centroid.
    if (this._prevDist > 0 && d > 0) {
      const ratio = d / this._prevDist;
      Camera.setZoom(Camera.zoom * ratio, vw, vh, c.x, c.y);
    }

    // Pan by centroid movement (screen px -> world px via zoom).
    const dx = c.x - this._prevCentroid.x;
    const dy = c.y - this._prevCentroid.y;
    Camera.x -= dx / Camera.zoom;
    Camera.y -= dy / Camera.zoom;

    this._prevCentroid = c;
    this._prevDist = d;

    Camera.apply(this.world);
    Game.updateReadout();
  },
};
