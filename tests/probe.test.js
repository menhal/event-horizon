import { describe, it, expect } from 'vitest';
import {
  fallEnergy,
  infallVelocity,
  probeTimeDilation,
  probeRedshift,
  tidalStretch,
  createProbe,
  stepProbe,
} from '../src/physics/probe.js';
import { timeDilation } from '../src/physics/blackhole.js';

describe('radial infall', () => {
  it('starts at rest', () => {
    expect(infallVelocity(8, 8)).toBeCloseTo(0, 12);
    expect(fallEnergy(8)).toBeCloseTo(Math.sqrt(7 / 8), 12);
  });

  it('coordinate speed vanishes at the horizon', () => {
    expect(infallVelocity(1, 8)).toBe(0);
    expect(Math.abs(infallVelocity(1.001, 8))).toBeLessThan(1e-3);
  });

  it('never crosses the horizon in distant-observer time and r decreases monotonically', () => {
    const s = createProbe(8);
    let prev = s.r;
    for (let i = 0; i < 2000; i++) {
      stepProbe(s, 0.1);
      expect(s.r).toBeLessThanOrEqual(prev);
      expect(s.r).toBeGreaterThan(1);
      prev = s.r;
    }
    expect(s.r - 1).toBeLessThan(1e-6);
  });

  it('approaches the horizon exponentially (e-folding ≈ 1 rs/c)', () => {
    const s = createProbe(6);
    while (s.r > 1.01) stepProbe(s, 0.05);
    const a = s.r - 1;
    stepProbe(s, 5);
    const b = s.r - 1;
    // d(r-1)/dt → -(r-1) near r = 1 for a release from rest
    expect(Math.log(a / b)).toBeGreaterThan(4);
    expect(Math.log(a / b)).toBeLessThan(5.5);
  });

  it('proper time stays finite while distant time grows without bound', () => {
    const s = createProbe(8);
    const t0 = s.t;
    stepProbe(s, 200);
    const tau1 = s.tau;
    stepProbe(s, 200);
    expect(s.t - t0).toBeCloseTo(400, 6);
    expect(s.tau - tau1).toBeLessThan(1e-6);
    // Free-fall proper time from rest at r0 to the horizon (rs = 1, M = 1/2):
    // τ = sqrt(r0^3 / (2M)) [sqrt(x(1-x)) + arccos sqrt(x)] at x = 1/r0.
    const x = 1 / 8;
    const exact = Math.sqrt(8 ** 3) * (Math.sqrt(x * (1 - x)) + Math.acos(Math.sqrt(x)));
    expect(s.tau).toBeCloseTo(exact, 2);
  });

  it('time dilation of the probe equals the static value at release and → 0 at the horizon', () => {
    expect(probeTimeDilation(8 - 1e-12, 8)).toBeCloseTo(timeDilation(8), 6);
    expect(probeTimeDilation(1, 8)).toBe(0);
    expect(probeTimeDilation(1.0001, 8)).toBeLessThan(1e-3);
  });

  it('redshift at release is pure gravitational and → 0 (infinite z) near the horizon', () => {
    expect(probeRedshift(8 - 1e-12, 8)).toBeCloseTo(timeDilation(8), 6);
    expect(probeRedshift(1.001, 8)).toBeLessThan(1e-3);
    expect(probeRedshift(1, 8)).toBe(0);
  });

  it('light emitted backwards (towards the viewer) is redshifted more than light emitted sideways', () => {
    expect(probeRedshift(2, 8, 1)).toBeLessThan(probeRedshift(2, 8, 0));
  });

  it('tidal stretch grows towards the hole and is capped', () => {
    expect(tidalStretch(20)).toBeCloseTo(1, 2);
    expect(tidalStretch(1.5)).toBeGreaterThan(tidalStretch(3));
    expect(tidalStretch(0.5)).toBeLessThanOrEqual(6);
  });

  it('refuses a release inside the photon sphere', () => {
    expect(() => createProbe(1.2)).toThrow(RangeError);
  });
});
