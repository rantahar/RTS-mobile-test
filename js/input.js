// Gesture recognizer. Detects abstract gestures and dispatches them through
// CONFIG.GESTURE_MAP to js/actions.js — no game logic lives here.
//
// Recognized gestures:
//   tap    quick press + release without moving        -> fire
//   hold   press held still for CONFIG.HOLD_MS         -> fire
//   drag1  one-finger drag                             -> start/update/end
//   drag2  two-finger drag + pinch                     -> start/update/end
// A second finger landing mid-drag1 cancels it and starts drag2.
const Input = {
  svg: null,
  world: null,
  pointers: new Map(),   // pointerId -> {x, y} in svg-local px
  state: null,           // 'pending' | 'drag1' | 'drag2' | 'held' | null
  downPt: null,          // where the first finger landed (screen px)
  holdTimer: null,

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

  oneData(p) {
    return { s: p, w: Camera.screenToWorld(p.x, p.y) };
  },

  twoData() {
    const [a, b] = [...this.pointers.values()].slice(0, 2);
    return {
      c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      d: Math.hypot(a.x - b.x, a.y - b.y),
    };
  },

  clearHold() {
    if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = null; }
  },

  onDown(e) {
    this.svg.setPointerCapture(e.pointerId);
    const p = this.localPoint(e);
    this.pointers.set(e.pointerId, p);

    if (this.pointers.size === 1) {
      this.state = 'pending';
      this.downPt = p;
      this.holdTimer = setTimeout(() => {
        if (this.state === 'pending') {
          this.state = 'held';
          Actions.dispatch('hold', 'fire', this.oneData(this.downPt));
        }
      }, CONFIG.HOLD_MS);
    } else if (this.pointers.size === 2) {
      this.clearHold();
      if (this.state === 'drag1') Actions.dispatch('drag1', 'cancel', {});
      this.state = 'drag2';
      Actions.dispatch('drag2', 'start', this.twoData());
    }
    // 3+ fingers: ignored, drag2 keeps using the first two.
  },

  onMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.localPoint(e);
    this.pointers.set(e.pointerId, p);

    if (this.state === 'pending') {
      if (Math.hypot(p.x - this.downPt.x, p.y - this.downPt.y) > CONFIG.TAP_SLOP) {
        this.clearHold();
        this.state = 'drag1';
        Actions.dispatch('drag1', 'start', this.oneData(this.downPt));
        Actions.dispatch('drag1', 'update', this.oneData(p));
      }
    } else if (this.state === 'drag1') {
      Actions.dispatch('drag1', 'update', this.oneData(p));
    } else if (this.state === 'drag2' && this.pointers.size >= 2) {
      Actions.dispatch('drag2', 'update', this.twoData());
    }
  },

  onUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.localPoint(e);
    const was = this.state;
    this.pointers.delete(e.pointerId);
    this.clearHold();

    if (was === 'pending' && this.pointers.size === 0) {
      this.state = null;
      Actions.dispatch('tap', 'fire', this.oneData(p));
    } else if (was === 'drag1' && this.pointers.size === 0) {
      this.state = null;
      Actions.dispatch('drag1', 'end', this.oneData(p));
    } else if (was === 'drag2' && this.pointers.size < 2) {
      // A leftover finger from a two-finger gesture shouldn't start selecting.
      this.state = null;
      Actions.dispatch('drag2', 'end', {});
    } else if (was === 'held' && this.pointers.size === 0) {
      this.state = null;
    }
    Game.updateReadout();
  },
};
