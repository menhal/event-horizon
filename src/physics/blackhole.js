// Schwarzschild black hole physics. Geometric helpers take radii in units of
// the Schwarzschild radius (rs = 1) unless a parameter says otherwise.

export const G = 6.6743e-11; // m^3 kg^-1 s^-2
export const C = 299792458; // m/s
export const M_SUN = 1.98847e30; // kg
export const AU = 1.495978707e11; // m

/** Schwarzschild radius rs = 2GM/c^2, in metres, for a mass given in solar masses. */
export function schwarzschildRadius(massSolar) {
  if (!(massSolar >= 0)) throw new RangeError('mass must be a non-negative number');
  return (2 * G * massSolar * M_SUN) / (C * C);
}

/** Light-crossing time of the Schwarzschild radius, rs / c, in seconds. */
export function lightCrossingTime(massSolar) {
  return schwarzschildRadius(massSolar) / C;
}

/**
 * Gravitational time dilation for a static observer at radius r:
 * dτ/dt = sqrt(1 - rs/r). Returns 0 at or inside the horizon.
 */
export function timeDilation(r, rs = 1) {
  if (r <= rs) return 0;
  return Math.sqrt(1 - rs / r);
}

/** Lorentz factor γ = 1/sqrt(1 - β²) for speed β = v/c, |β| < 1. */
export function lorentzFactor(beta) {
  if (Math.abs(beta) >= 1) throw new RangeError('|beta| must be < 1');
  return 1 / Math.sqrt(1 - beta * beta);
}

/**
 * Relativistic Doppler factor δ = ν_obs / ν_emit = 1 / (γ (1 - β cosθ)),
 * where θ is the angle between the emitter's velocity and the direction
 * from emitter to observer (cosθ = 1: approaching head-on).
 */
export function dopplerFactor(beta, cosTheta) {
  return 1 / (lorentzFactor(beta) * (1 - beta * cosTheta));
}

/**
 * Speed (fraction of c) of a circular geodesic orbit at radius r, measured by a
 * local static observer: β = sqrt(rs / (2 (r - rs))). Reaches 1 at the photon
 * sphere r = 1.5 rs; undefined inside it.
 */
export function keplerBeta(r, rs = 1) {
  if (r < 1.5 * rs) throw new RangeError('no circular orbits inside the photon sphere');
  return Math.sqrt(rs / (2 * (r - rs)));
}

/** Photon sphere radius, 1.5 rs. */
export const PHOTON_SPHERE = 1.5;

/** Critical impact parameter b_c = (3√3/2) rs: apparent radius of the shadow. */
export const CRITICAL_IMPACT = (3 * Math.sqrt(3)) / 2;

/**
 * Angular radius (radians) of the black hole shadow seen by a static observer
 * at radius r (units of rs): sin α = b_c sqrt(1 - 1/r) / r, with α > 90° inside
 * the photon sphere. Tends to b_c / r far away and to π at the horizon.
 */
export function shadowAngularRadius(r) {
  if (r <= 1) return Math.PI;
  const s = Math.min(1, (CRITICAL_IMPACT * Math.sqrt(1 - 1 / r)) / r);
  const a = Math.asin(s);
  return r < PHOTON_SPHERE ? Math.PI - a : a;
}

/**
 * Prograde innermost stable circular orbit of a Kerr black hole with
 * dimensionless spin a ∈ [0, 1) (Bardeen, Press & Teukolsky 1972), in units of rs.
 * a = 0 gives the Schwarzschild value 3 rs.
 */
export function iscoRadius(spin) {
  const a = Math.min(Math.max(spin, 0), 0.9999);
  const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const z2 = Math.sqrt(3 * a * a + z1 * z1);
  const rM = 3 + z2 - Math.sqrt((3 - z1) * (3 + z1 + 2 * z2)); // units of M
  return rM / 2; // rs = 2M
}

/** Kerr outer horizon r+ = M (1 + sqrt(1 - a²)), in units of rs. */
export function kerrHorizon(spin) {
  const a = Math.min(Math.abs(spin), 1);
  return (1 + Math.sqrt(1 - a * a)) / 2;
}

/** Radius of the peak of the thin-disk temperature profile, in units of r_in. */
export const DISK_PEAK_X = 49 / 36;

/**
 * Thin-disk effective temperature (Shakura–Sunyaev / Novikov–Thorne shape,
 * zero-torque inner edge): T ∝ x^(-3/4) (1 - x^(-1/2))^(1/4), x = r / r_in,
 * normalised so the maximum equals peakTemp. Zero at or inside r_in.
 */
export function diskTemperature(r, rIn, peakTemp) {
  const shape = (x) => Math.pow(x, -0.75) * Math.pow(1 - Math.pow(x, -0.5), 0.25);
  const x = r / rIn;
  if (x <= 1) return 0;
  return (peakTemp * shape(x)) / shape(DISK_PEAK_X);
}

/**
 * Total frequency shift g = ν_obs / ν_emit for disk light reaching a static
 * camera: Doppler × gravitational redshift at the emitter ÷ the one at the camera.
 * r and rCam in units of rs; cosTheta as in dopplerFactor.
 */
export function diskRedshift(r, cosTheta, rCam = Infinity) {
  const beta = keplerBeta(r);
  const camTerm = Number.isFinite(rCam) ? timeDilation(rCam) : 1;
  return (dopplerFactor(beta, cosTheta) * timeDilation(r)) / camTerm;
}

/**
 * Scene-space size of rs for a given mass. Real sizes span many orders of
 * magnitude, so the visual scale is compressed as (M / 1e8 M☉)^(1/4).
 */
export function visualScale(massSolar) {
  return Math.pow(massSolar / 1e8, 0.25);
}
