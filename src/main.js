import './styles.css';
import * as THREE from 'three';
import { BlackHoleRenderer, BEACON_DIR } from './scene/renderer.js';
import { QualityController, QUALITY_LEVELS } from './scene/quality.js';
import { ProbeController } from './scene/probe-controller.js';
import { OrbitFlyCamera, poseFromSpherical, anglesLookingAlong } from './camera/orbit-camera.js';
import { sampleCinematic } from './camera/cinematic.js';
import { ControlPanel } from './ui/panel.js';
import { Hud } from './ui/hud.js';
import { getPreset, DEFAULT_PRESET } from './ui/params.js';
import { sci, formatLength, formatDuration, formatFactor } from './ui/format.js';
import {
  schwarzschildRadius,
  lightCrossingTime,
  timeDilation,
  iscoRadius,
  visualScale,
  shadowAngularRadius,
} from './physics/blackhole.js';

/** Distant-observer time (in rs/c) that elapses per real second at time scale 1. */
const SIM_RATE = 2;
const DISK_OUTER = 13; // rs
const DISK_INNER_MIN = 1.6; // rs, keeps the disk outside the Schwarzschild photon sphere
const HOME_VIEW = { az: 18, el: 4.5, dist: 26 };

const canvas = document.getElementById('view');
let bh;
try {
  bh = new BlackHoleRenderer(canvas);
} catch (err) {
  document.body.insertAdjacentHTML('beforeend', `<div id="fatal">WebGL 2 is required.<br>${err.message}</div>`);
  throw err;
}

const params = getPreset(DEFAULT_PRESET);
const quality = new QualityController({ level: 1 });
bh.setQuality(quality.current);

const camera = new OrbitFlyCamera(canvas, { ...HOME_VIEW, distRs: HOME_VIEW.dist });
camera.setScale(visualScale(params.mass));
camera.setOrbit(HOME_VIEW.az, HOME_VIEW.el, HOME_VIEW.dist, true);

const probe = new ProbeController();
const hud = new Hud(document.getElementById('hud'));

const sim = { farTime: 0, shipTime: 0 };
const cine = { on: false, time: 0, letterbox: 0 };

const panel = new ControlPanel(document.getElementById('panel'), {
  onParam(key, value) {
    params[key] = value;
  },
  onPreset(name) {
    applyPreset(name);
  },
  onAction: runAction,
  onQuality(value) {
    if (value === 'auto') {
      quality.enabled = true;
    } else {
      quality.enabled = false;
      quality.setLevel(Number(value));
      bh.setQuality(quality.current);
    }
  },
});
panel.setQualityOptions(QUALITY_LEVELS);
panel.setValues(params);
panel.markPreset(DEFAULT_PRESET);

function applyPreset(name) {
  Object.assign(params, getPreset(name));
  panel.setValues(params);
  panel.markPreset(name);
}

function runAction(id) {
  camera.setScale(visualScale(params.mass));
  switch (id) {
    case 'probe': {
      const pose = camera.pose();
      const s = camera.rsScale;
      const ok = probe.drop(pose.position.map((v) => v / s), pose.right, pose.up);
      if (!ok) flash('probe', 'Too deep to release');
      break;
    }
    case 'flyin':
      if (camera.radiusRs < 1.3) camera.flyTo(HOME_VIEW.dist, 0.5);
      else camera.flyTo(1.06, 0.3);
      break;
    case 'ring': {
      const { az, el } = anglesLookingAlong(BEACON_DIR.toArray());
      setCinematic(false);
      camera.setOrbit(az, el, 30);
      break;
    }
    case 'cinematic':
      setCinematic(!cine.on);
      break;
    case 'reset':
      setCinematic(false);
      camera.setOrbit(HOME_VIEW.az, HOME_VIEW.el, HOME_VIEW.dist);
      break;
    case 'hud':
      document.body.classList.toggle('ui-hidden');
      break;
  }
}

function flash(action, text) {
  const b = document.querySelector(`[data-action=${action}] span`);
  if (!b) return;
  const old = b.textContent;
  b.textContent = text;
  setTimeout(() => (b.textContent = old), 1400);
}

function setCinematic(on) {
  if (cine.on === on) return;
  cine.on = on;
  document.body.classList.toggle('cinematic', on);
  panel.setActionActive('cinematic', on);
  const caption = document.getElementById('cine-caption');
  caption.hidden = !on;
  if (on) {
    cine.time = 0;
    // restart the caption animation
    caption.style.animation = 'none';
    void caption.offsetWidth;
    caption.style.animation = '';
  } else {
    // Continue orbiting from wherever the cinematic path left the camera.
    const p = sampleCinematic(cine.time);
    camera.setOrbit(p.az, p.el, p.dist, true);
  }
}

camera.onUserInput = () => setCinematic(false);

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.repeat) return;
  const map = { KeyP: 'probe', KeyF: 'flyin', KeyE: 'ring', KeyC: 'cinematic', KeyR: 'reset', KeyH: 'hud' };
  if (e.code === 'Escape') setCinematic(false);
  else if (map[e.code]) runAction(map[e.code]);
});

const tmpProbe = new THREE.Vector3();
const tmpAxis = new THREE.Vector3();
let last = performance.now();
let hudTimer = 0;

function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;

  if (quality.frame(dt) !== null) bh.setQuality(quality.current);

  const rsScale = visualScale(params.mass);
  camera.setScale(rsScale);

  let pose;
  if (cine.on) {
    cine.time += dt;
    const p = sampleCinematic(cine.time);
    pose = { ...poseFromSpherical(p.az, p.el, p.dist * rsScale, p.roll), fov: p.fov };
  } else {
    pose = camera.update(dt);
  }
  cine.letterbox += ((cine.on ? 1 : 0) - cine.letterbox) * (1 - Math.exp(-dt * 3));

  const camPos = pose.position.map((v) => v / rsScale);
  const rCam = Math.hypot(...camPos);
  const dil = timeDilation(rCam);
  pose = tiltAwayFromShadow(pose, rCam);

  const simDt = dt * params.timeScale * SIM_RATE;
  sim.farTime += simDt;
  sim.shipTime += simDt * dil;
  probe.update(simDt, camPos, dt);

  const rIn = Math.max(iscoRadius(params.spin), DISK_INNER_MIN);
  bh.setView({ camPos, right: pose.right, up: pose.up, forward: pose.forward, fov: pose.fov, tilt: params.diskTilt });

  const u = bh.uniforms;
  u.uTime.value = sim.farTime;
  u.uLensing.value = params.lensing;
  u.uSpin.value = params.spin;
  u.uDiskInner.value = rIn;
  u.uDiskOuter.value = DISK_OUTER;
  u.uDiskTemp.value = params.diskTemp;
  u.uDiskDensity.value = params.diskDensity;
  u.uCamDilation.value = dil;
  u.uStretch.value = Math.min(1 / Math.max(dil, 1e-3), 12);
  u.uProbeOn.value = probe.active ? 1 : 0;
  if (probe.active) {
    u.uProbePos.value.copy(tmpProbe.fromArray(probe.position()).applyMatrix3(u.uWorldToDisk.value));
    u.uProbeAxis.value.copy(tmpAxis.fromArray(probe.dir).applyMatrix3(u.uWorldToDisk.value).normalize());
    u.uProbeSize.value.fromArray(probe.size());
    u.uProbeG.value = probe.g;
    u.uProbeBlink.value = Math.sin(now / 1000 * 5) > 0.55 ? 1 : 0;
  }
  bh.finalPass.uniforms.uLetterbox.value = cine.letterbox;

  bh.render(now / 1000);

  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.1;
    updateHud(rCam, dil, rIn);
  }
  requestAnimationFrame(frame);
}

/**
 * Pitches the view away from the hole once the shadow's angular radius exceeds
 * LOOK_START of the half field of view. The pitch grows linearly so that at the
 * horizon (shadow radius π) the shadow edge sits LOOK_EDGE of the half field
 * of view above centre.
 */
const LOOK_START = 0.9;
const LOOK_EDGE = 0.35;
function tiltAwayFromShadow(pose, rCam) {
  const halfFov = (pose.fov * Math.PI) / 360;
  const gain = (Math.PI - LOOK_EDGE * halfFov) / (Math.PI - LOOK_START * halfFov);
  const theta = Math.max(0, shadowAngularRadius(rCam) - LOOK_START * halfFov) * gain;
  if (theta === 0) return pose;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const forward = pose.forward.map((v, i) => v * c + pose.up[i] * s);
  const up = pose.up.map((v, i) => v * c - pose.forward[i] * s);
  return { ...pose, forward, up };
}

function updateHud(rCam, dil, rIn) {
  const tc = lightCrossingTime(params.mass);
  hud.set('mass', `${sci(params.mass, 2)} M☉`);
  hud.set('rs', formatLength(schwarzschildRadius(params.mass)));
  hud.set('spin', params.spin.toFixed(2));
  hud.set('isco', `${rIn.toFixed(2)} rs`);
  hud.set('camR', `${rCam.toFixed(3)} rs`);
  hud.set('farClock', formatDuration(sim.farTime * tc));
  hud.set('shipClock', formatDuration(sim.shipTime * tc));
  hud.set('camDil', formatFactor(dil));
  hud.setBar('dilBar', dil);
  hud.set('fps', `${quality.fps ? Math.round(quality.fps) : '—'} FPS`);
  hud.set('quality', `${quality.current.name.toUpperCase()}${quality.enabled ? ' · AUTO' : ''}`);

  hud.showProbe(probe.active);
  if (probe.active) {
    const s = probe.state;
    const frozen = probe.frozen;
    hud.setProbeFrozen(frozen);
    hud.set('probeStatus', frozen ? 'FROZEN AT HORIZON (TO YOU)' : 'FALLING');
    hud.set('probeR', `${s.r.toFixed(s.r - 1 < 0.01 ? 6 : 3)} rs`);
    hud.set('probeDil', formatFactor(probe.dilation));
    hud.set('probeZ', probe.g > 0 ? formatFactor(1 / probe.g - 1) : '∞');
    hud.set('probeTau', formatDuration(s.tau * tc));
    hud.set('probeT', formatDuration(s.t * tc));
  }
}

window.__eventHorizon = { params, camera, probe, quality, renderer: bh, sim, applyPreset, runAction };

requestAnimationFrame(frame);
