// Radial free fall of a probe released from rest at r0, as seen by a distant
// observer (Schwarzschild coordinate time t). Units: rs = 1, time in rs/c.

/** Specific energy of a geodesic released from rest at r0: E = sqrt(1 - 1/r0). */
export function fallEnergy(r0) {
  return Math.sqrt(1 - 1 / r0);
}

/** dr/dt of the radial infall: -(1 - 1/r) sqrt(1/r - 1/r0) / E. */
export function infallVelocity(r, r0) {
  if (r <= 1) return 0;
  const k = Math.max(0, 1 / r - 1 / r0);
  return (-(1 - 1 / r) * Math.sqrt(k)) / fallEnergy(r0);
}

/** Probe proper-time rate relative to the distant clock: dτ/dt = (1 - 1/r) / E. */
export function probeTimeDilation(r, r0) {
  if (r <= 1) return 0;
  return (1 - 1 / r) / fallEnergy(r0);
}

/**
 * Frequency ratio g = ν_obs / ν_emit for light from the falling probe to a
 * distant observer. cosAlpha is the cosine of the angle between the outward
 * radial direction at the probe and the direction to the observer.
 * Combines gravitational redshift and the Doppler shift of the infall; → 0 at the horizon.
 */
export function probeRedshift(r, r0, cosAlpha = 1) {
  if (r <= 1) return 0;
  const ur = Math.sqrt(Math.max(0, 1 / r - 1 / r0)); // |dr/dτ|
  return (1 - 1 / r) / (fallEnergy(r0) + cosAlpha * ur);
}

/** Visual tidal stretch factor along the radial axis (≥ 1), growing like 1/r³. */
export function tidalStretch(r) {
  return 1 + Math.min(5, 4 / Math.pow(Math.max(r, 1), 3));
}

/**
 * Creates the probe state. r starts a distance δ = 1e-4 r0 inside r0 so the
 * fall can begin; t and τ start at the time needed to fall that far from rest
 * (τ0 = 2 r0 sqrt(δ) from d²r/dτ² = -M/r², t0 = τ0 / E).
 */
export function createProbe(r0) {
  if (!(r0 > 1.5)) throw new RangeError('probe must be released outside 1.5 rs');
  const delta = r0 * 1e-4;
  const tau0 = 2 * r0 * Math.sqrt(delta);
  return { r0, r: r0 - delta, t: tau0 / fallEnergy(r0), tau: tau0 };
}

const MAX_SUBSTEP = 0.05;
const HORIZON_EPS = 1e-12;

/**
 * Advances the probe by dt of distant-observer time (RK4 on r(t), plus proper
 * time). The probe approaches r = 1 asymptotically and never crosses it.
 * Mutates and returns the state.
 */
export function stepProbe(state, dt) {
  const { r0 } = state;
  let remaining = dt;
  while (remaining > 0) {
    const h = Math.min(MAX_SUBSTEP, remaining);
    const r = state.r;
    const k1 = infallVelocity(r, r0);
    const k2 = infallVelocity(r + (h / 2) * k1, r0);
    const k3 = infallVelocity(r + (h / 2) * k2, r0);
    const k4 = infallVelocity(r + h * k3, r0);
    const rNext = Math.max(1 + HORIZON_EPS, r + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4));
    state.tau += (h / 2) * (probeTimeDilation(r, r0) + probeTimeDilation(rNext, r0));
    state.r = rNext;
    state.t += h;
    remaining -= h;
  }
  return state;
}
