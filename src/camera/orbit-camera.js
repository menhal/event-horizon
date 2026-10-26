// Orbit / zoom / fly-in camera around the black hole at the origin.
// Distances are in scene units; `rsScale` is the scene size of rs.

const DEG = Math.PI / 180;
const MIN_R = 1.025; // closest approach, in units of rs
const MAX_R = 120;

/**
 * Camera pose for spherical coordinates around the origin, looking at the origin.
 * az/el/roll in degrees. Returns { position, right, up, forward } as [x, y, z] arrays.
 */
export function poseFromSpherical(az, el, dist, roll = 0) {
  const ca = Math.cos(az * DEG);
  const sa = Math.sin(az * DEG);
  const ce = Math.cos(el * DEG);
  const se = Math.sin(el * DEG);
  const position = [dist * ce * sa, dist * se, dist * ce * ca];
  const forward = [-ce * sa, -se, -ce * ca];
  // right = normalize(forward × worldUp), worldUp = +y
  let right = [-forward[2], 0, forward[0]];
  const rl = Math.hypot(right[0], right[2]) || 1;
  right = [right[0] / rl, 0, right[2] / rl];
  // up = right × forward
  let up = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  if (roll) {
    const cr = Math.cos(roll * DEG);
    const sr = Math.sin(roll * DEG);
    const r2 = right.map((v, i) => v * cr + up[i] * sr);
    up = up.map((v, i) => v * cr - right[i] * sr);
    right = r2;
  }
  return { position, right, up, forward };
}

/** Spherical angles (degrees) of the camera position that looks along `dir` through the origin. */
export function anglesLookingAlong(dir) {
  const [x, y, z] = dir;
  const len = Math.hypot(x, y, z);
  return { az: Math.atan2(-x, -z) / DEG, el: Math.asin(-y / len) / DEG };
}

export class OrbitFlyCamera {
  constructor(element, { az = 20, el = 4, distRs = 26, fov = 55 } = {}) {
    this.element = element;
    this.rsScale = 1;
    this.target = { az, el, dist: distRs };
    this.current = { ...this.target };
    this.fov = fov;
    this.flySpeed = 0; // > 0 while flying in / out with keys
    this.autoFly = null; // { dist, rate } while an automatic fly-in runs
    this.onUserInput = null;
    this._drag = null;
    this._keys = new Set();
    this._bind();
  }

  /** Sets the scene size of rs; distances stay fixed in scene units. */
  setScale(rsScale) {
    this.rsScale = rsScale;
  }

  /** Current distance from the singularity in units of rs. */
  get radiusRs() {
    return this.current.dist / this.rsScale;
  }

  setOrbit(az, el, distRs, immediate = false) {
    this.target.az = az;
    this.target.el = el;
    this.target.dist = distRs * this.rsScale;
    this.autoFly = null;
    if (immediate) this.current = { ...this.target };
  }

  /** Starts a smooth automatic flight to `distRs` (units of rs). */
  flyTo(distRs, rate = 0.35) {
    this.autoFly = { dist: distRs, rate };
  }

  update(dt) {
    const rs = this.rsScale;
    if (this._keys.size) {
      let dir = 0;
      if (this._keys.has('in')) dir -= 1;
      if (this._keys.has('out')) dir += 1;
      this.target.dist *= Math.exp(dir * dt * 0.9);
      if (this._keys.has('left')) this.target.az -= 40 * dt;
      if (this._keys.has('right')) this.target.az += 40 * dt;
    }
    if (this.autoFly) {
      const goal = this.autoFly.dist * rs;
      const k = 1 - Math.exp(-this.autoFly.rate * dt);
      this.target.dist = Math.exp(Math.log(this.target.dist) + (Math.log(goal) - Math.log(this.target.dist)) * k);
      if (Math.abs(this.target.dist / goal - 1) < 1e-3) this.autoFly = null;
    }
    this.target.dist = Math.min(MAX_R * rs, Math.max(MIN_R * rs, this.target.dist));
    this.target.el = Math.min(85, Math.max(-85, this.target.el));

    const k = 1 - Math.exp(-dt * 6);
    this.current.az += (this.target.az - this.current.az) * k;
    this.current.el += (this.target.el - this.current.el) * k;
    const ld = Math.log(this.current.dist);
    this.current.dist = Math.exp(ld + (Math.log(this.target.dist) - ld) * k);
    this.current.dist = Math.max(MIN_R * rs, this.current.dist);
    return this.pose();
  }

  pose() {
    return { ...poseFromSpherical(this.current.az, this.current.el, this.current.dist), fov: this.fov };
  }

  _input() {
    this.autoFly = null;
    if (this.onUserInput) this.onUserInput();
  }

  _bind() {
    const el = this.element;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this._drag = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      this._input();
    });
    el.addEventListener('pointermove', (e) => {
      if (!this._drag) return;
      const dx = e.clientX - this._drag.x;
      const dy = e.clientY - this._drag.y;
      this._drag = { x: e.clientX, y: e.clientY };
      this.target.az -= dx * 0.25;
      this.target.el += dy * 0.2;
    });
    const end = () => (this._drag = null);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this._input();
        this.target.dist *= Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 200) * 0.0012);
      },
      { passive: false },
    );
    const keyMap = { KeyW: 'in', ArrowUp: 'in', KeyS: 'out', ArrowDown: 'out', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = keyMap[e.code];
      if (!k) return;
      this._keys.add(k);
      this._input();
    });
    window.addEventListener('keyup', (e) => {
      const k = keyMap[e.code];
      if (k) this._keys.delete(k);
    });
    window.addEventListener('blur', () => this._keys.clear());
  }
}
