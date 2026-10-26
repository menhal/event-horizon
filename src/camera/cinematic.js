// Scripted, looping camera path for cinematic mode. Distances are in units of
// rs; angles in degrees. The path is a periodic Catmull–Rom spline.

export const CINEMATIC_KEYS = [
  { t: 0, dist: 34, az: 0, el: 3, roll: 0, fov: 50 },
  { t: 12, dist: 22, az: 45, el: 9, roll: -4, fov: 48 },
  { t: 24, dist: 12, az: 110, el: 2, roll: 3, fov: 58 },
  { t: 34, dist: 6.5, az: 175, el: -5, roll: 8, fov: 68 },
  { t: 44, dist: 15, az: 240, el: 16, roll: -2, fov: 55 },
  { t: 56, dist: 27, az: 310, el: 6, roll: 0, fov: 48 },
];

/** Duration of one loop in seconds; the final segment wraps to the first key with az + 360. */
export const CINEMATIC_DURATION = 68;

const FIELDS = ['dist', 'az', 'el', 'roll', 'fov'];

function catmullRom(p0, p1, p2, p3, u) {
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

/** Key i of the infinite periodic sequence (azimuth unwrapped by 360° per loop). */
function keyAt(keys, duration, i) {
  const n = keys.length;
  const loop = Math.floor(i / n);
  const k = keys[((i % n) + n) % n];
  return { ...k, t: k.t + loop * duration, az: k.az + loop * 360 };
}

/**
 * Samples the camera pose at time `time` (seconds, any real value; wraps).
 * Returns { dist, az, el, roll, fov } with az in [0, 360).
 */
export function sampleCinematic(time, keys = CINEMATIC_KEYS, duration = CINEMATIC_DURATION) {
  const n = keys.length;
  const tt = ((time % duration) + duration) % duration;
  let i = n - 1;
  for (let j = 0; j < n; j++) {
    if (keys[j].t > tt) {
      i = j - 1;
      break;
    }
  }
  const k0 = keyAt(keys, duration, i - 1);
  const k1 = keyAt(keys, duration, i);
  const k2 = keyAt(keys, duration, i + 1);
  const k3 = keyAt(keys, duration, i + 2);
  const u = (tt - k1.t) / (k2.t - k1.t);
  const out = {};
  for (const f of FIELDS) out[f] = catmullRom(k0[f], k1[f], k2[f], k3[f], u);
  out.az = ((out.az % 360) + 360) % 360;
  return out;
}
