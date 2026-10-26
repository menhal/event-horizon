// Lifecycle of the dropped probe: release point, coordinate-time fall,
// observed redshift and the shader uniforms that draw it.

import { createProbe, stepProbe, probeRedshift, probeTimeDilation, tidalStretch } from '../physics/probe.js';

const BASE_SIZE = [0.3, 0.14]; // radial, transverse semi-axes in rs
const FROZEN_EPS = 2e-3; // r - 1 below which the probe counts as frozen
const FADE_TIMEOUT = 5; // real seconds after g drops below FADE_G before removal
const FADE_G = 2e-3;

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export class ProbeController {
  constructor() {
    this.state = null;
    this.dir = [1, 0, 0];
    this.g = 1;
    this.dilation = 1;
    this.fadeTime = 0;
  }

  get active() {
    return this.state !== null;
  }

  get frozen() {
    return this.active && this.state.r - 1 < FROZEN_EPS;
  }

  /**
   * Releases a probe from rest beside the camera's line of sight.
   * camPos, right, up: world frame, rs units. Returns false when the camera is
   * too deep in the well to release one.
   */
  drop(camPos, right, up) {
    const rCam = Math.hypot(camPos[0], camPos[1], camPos[2]);
    if (rCam < 2.4) return false;
    const r0 = Math.min(10, Math.max(2.2, rCam * 0.55));
    const toCam = normalize(camPos);
    // Offset the release direction so the probe is seen beside the shadow, not over it.
    const dir = normalize([
      toCam[0] - right[0] * 0.5 + up[0] * 0.32,
      toCam[1] - right[1] * 0.5 + up[1] * 0.32,
      toCam[2] - right[2] * 0.5 + up[2] * 0.32,
    ]);
    this.dir = dir;
    this.state = createProbe(r0);
    this.fadeTime = 0;
    this.update(0, camPos, 0);
    return true;
  }

  /** Advances by simDt (rs/c of distant time) and realDt (seconds). */
  update(simDt, camPos, realDt) {
    if (!this.state) return;
    stepProbe(this.state, simDt);
    const { r, r0 } = this.state;
    const p = this.position();
    const toCam = normalize([camPos[0] - p[0], camPos[1] - p[1], camPos[2] - p[2]]);
    const cosAlpha = this.dir[0] * toCam[0] + this.dir[1] * toCam[1] + this.dir[2] * toCam[2];
    this.g = probeRedshift(r, r0, cosAlpha);
    this.dilation = probeTimeDilation(r, r0);
    if (this.g < FADE_G) {
      this.fadeTime += realDt;
      if (this.fadeTime > FADE_TIMEOUT) this.state = null;
    }
  }

  position() {
    const r = this.state ? this.state.r : 0;
    return [this.dir[0] * r, this.dir[1] * r, this.dir[2] * r];
  }

  /** Ellipsoid semi-axes [radial, transverse] including tidal stretching. */
  size() {
    const s = tidalStretch(this.state ? this.state.r : 10);
    return [BASE_SIZE[0] * s, BASE_SIZE[1] / Math.sqrt(s)];
  }

  remove() {
    this.state = null;
  }
}
