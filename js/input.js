// Pointer/gesture handling.
//   - tap            -> select entity under finger (shape hit-test) / clear
//   - 1-finger drag  -> box select (rubber band)
//   - 2-finger drag  -> pan camera
//   - pinch          -> zoom
//   - mouse wheel    -> zoom (desktop convenience)
// (tap-and-hold is a later step.)
const Input = {
  svg: null,
  world: null,
  pointers: new Map(),   // pointerId -> {x, y} in svg-local px
  gesture: null,         // 'pending' | 'box' | 'twofinger' | null
  downPt: null,          // screen pt where the first finger landed
  boxStartWorld: null,   // world pt where box select began
  TAP_SLOP: 10,          // screen px of movement before a tap becomes a drag

  init(svg, world) {
    this.svg = svg;
    this.world = world;

    svg.addEventListener('pointerdown', (e) => this.onDown(e));
    svg.addEventListener('pointermove', (e) => this.onMove(e));
    svg.addEventListener('pointerup', (e) => this.onUp(e));
    svg.addEventListener('pointercancel', (e) => this.onUp(e));
    // Block iOS Safari pinch-zoom of the page.
    svg.addEventListener('gesturestart', (e) => e.preventDefault());
    // Desktop convenience: wheel zoom anchored at the cursor.
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = this.localPoint(e);
      const { vw, vh } = this.viewport();
      Camera.setZoom(Camera.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), vw, vh, p.x, p.y);
      Camera.apply(this.world);
      Game.updateReadout();
    }, { passive: false });
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
    if (this.pointers.size === 1) {
      this.gesture = 'pending';
      this.downPt = this.localPoint(e);
    } else if (this.pointers.size === 2) {
      // Second finger: whatever was happening becomes camera control.
      if (this.gesture === 'box') Game.hideBox();
      this.gesture = 'twofinger';
      this.twoStart();
    }
  },

  onMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.localPoint(e);
    this.pointers.set(e.pointerId, p);

    if (this.gesture === 'pending') {
      if (Math.hypot(p.x - this.downPt.x, p.y - this.downPt.y) > this.TAP_SLOP) {
        this.gesture = 'box';
        this.boxStartWorld = Camera.screenToWorld(this.downPt.x, this.downPt.y);
        Game.showBox(this.boxStartWorld, Camera.screenToWorld(p.x, p.y));
      }
    } else if (this.gesture === 'box') {
      Game.showBox(this.boxStartWorld, Camera.screenToWorld(p.x, p.y));
    } else if (this.gesture === 'twofinger' && this.pointers.size >= 2) {
      this.twoMove();
    }
  },

  onUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.localPoint(e);
    const was = this.gesture;
    this.pointers.delete(e.pointerId);

    if (was === 'pending' && this.pointers.size === 0) {
      this.gesture = null;
      Game.onTap(Camera.screenToWorld(p.x, p.y));
    } else if (was === 'box' && this.pointers.size === 0) {
      this.gesture = null;
      Game.onBoxEnd(this.boxStartWorld, Camera.screenToWorld(p.x, p.y));
    } else if (was === 'twofinger' && this.pointers.size < 2) {
      // Leftover finger from a pan shouldn't start selecting.
      this.gesture = null;
    }
    Game.updateReadout();
  },

  // ---- Two-finger pan + pinch ----
  _prevCentroid: null,
  _prevDist: 0,

  centroidDist() {
    const [a, b] = [...this.pointers.values()].slice(0, 2);
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
      Camera.setZoom(Camera.zoom * (d / this._prevDist), vw, vh, c.x, c.y);
    }

    // Pan by centroid movement (screen px -> world px via zoom).
    Camera.x -= (c.x - this._prevCentroid.x) / Camera.zoom;
    Camera.y -= (c.y - this._prevCentroid.y) / Camera.zoom;

    this._prevCentroid = c;
    this._prevDist = d;

    Camera.apply(this.world);
    Game.updateReadout();
  },
};
