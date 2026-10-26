import { describe, it, expect } from 'vitest';
import {
  schwarzschildRadius,
  lightCrossingTime,
  timeDilation,
  lorentzFactor,
  dopplerFactor,
  keplerBeta,
  iscoRadius,
  kerrHorizon,
  diskTemperature,
  diskRedshift,
  visualScale,
  shadowAngularRadius,
  DISK_PEAK_X,
  CRITICAL_IMPACT,
  C,
} from '../src/physics/blackhole.js';

describe('schwarzschildRadius', () => {
  it('is about 2.95 km for one solar mass', () => {
    expect(schwarzschildRadius(1)).toBeCloseTo(2953.3, 0);
  });

  it('is about 1.27e10 m for Sagittarius A* (4.3e6 M☉)', () => {
    expect(schwarzschildRadius(4.3e6) / 1e10).toBeCloseTo(1.27, 2);
  });

  it('scales linearly with mass', () => {
    expect(schwarzschildRadius(1e8) / schwarzschildRadius(1e4)).toBeCloseTo(1e4, 6);
    expect(schwarzschildRadius(0)).toBe(0);
  });

  it('rejects negative or non-numeric masses', () => {
    expect(() => schwarzschildRadius(-1)).toThrow(RangeError);
    expect(() => schwarzschildRadius(NaN)).toThrow(RangeError);
  });

  it('light-crossing time is rs / c', () => {
    expect(lightCrossingTime(4.3e6)).toBeCloseTo(schwarzschildRadius(4.3e6) / C, 9);
    expect(lightCrossingTime(4.3e6)).toBeCloseTo(42.4, 0);
  });
});

describe('timeDilation', () => {
  it('approaches 1 far away', () => {
    expect(timeDilation(1e9)).toBeCloseTo(1, 8);
  });

  it('matches sqrt(1 - rs/r)', () => {
    expect(timeDilation(2)).toBeCloseTo(Math.SQRT1_2, 12);
    expect(timeDilation(4)).toBeCloseTo(Math.sqrt(0.75), 12);
    expect(timeDilation(3e3, 1e3)).toBeCloseTo(Math.sqrt(2 / 3), 12);
  });

  it('is 0 at and inside the horizon', () => {
    expect(timeDilation(1)).toBe(0);
    expect(timeDilation(0.5)).toBe(0);
  });

  it('decreases monotonically towards the horizon', () => {
    let prev = 1;
    for (let r = 50; r > 1.0001; r *= 0.9) {
      const d = timeDilation(r);
      expect(d).toBeLessThan(prev);
      prev = d;
    }
  });
});

describe('dopplerFactor', () => {
  it('is 1 for an emitter at rest', () => {
    expect(dopplerFactor(0, 0.3)).toBe(1);
  });

  it('matches the longitudinal formula sqrt((1+β)/(1-β)) head-on', () => {
    const b = 0.5;
    expect(dopplerFactor(b, 1)).toBeCloseTo(Math.sqrt((1 + b) / (1 - b)), 12);
    expect(dopplerFactor(b, -1)).toBeCloseTo(Math.sqrt((1 - b) / (1 + b)), 12);
  });

  it('approaching and receding factors are reciprocal', () => {
    expect(dopplerFactor(0.7, 1) * dopplerFactor(0.7, -1)).toBeCloseTo(1, 12);
  });

  it('gives the transverse redshift 1/γ at 90°', () => {
    expect(dopplerFactor(0.6, 0)).toBeCloseTo(1 / lorentzFactor(0.6), 12);
    expect(dopplerFactor(0.6, 0)).toBeCloseTo(0.8, 12);
  });

  it('lorentzFactor rejects |β| >= 1', () => {
    expect(() => lorentzFactor(1)).toThrow(RangeError);
  });
});

describe('orbits and disk', () => {
  it('circular orbit speed is c/2 at the Schwarzschild ISCO and c at the photon sphere', () => {
    expect(keplerBeta(3)).toBeCloseTo(0.5, 12);
    expect(keplerBeta(1.5)).toBeCloseTo(1, 12);
    expect(() => keplerBeta(1.2)).toThrow(RangeError);
  });

  it('ISCO is 3 rs without spin and shrinks towards M = 0.5 rs for maximal spin', () => {
    expect(iscoRadius(0)).toBeCloseTo(3, 10);
    expect(iscoRadius(0.5)).toBeCloseTo(4.233 / 2, 3);
    expect(iscoRadius(0.9999)).toBeLessThan(0.65);
    expect(iscoRadius(0.3)).toBeLessThan(iscoRadius(0.1));
  });

  it('Kerr horizon is rs without spin and rs/2 at maximal spin', () => {
    expect(kerrHorizon(0)).toBe(1);
    expect(kerrHorizon(1)).toBe(0.5);
  });

  it('critical impact parameter is 3√3/2 rs', () => {
    expect(CRITICAL_IMPACT).toBeCloseTo(2.598, 3);
  });

  it('shadow angular radius: b_c/r far away, 90° at the photon sphere, 180° at the horizon', () => {
    expect(shadowAngularRadius(1e4)).toBeCloseTo(CRITICAL_IMPACT / 1e4, 7);
    expect(shadowAngularRadius(1.5)).toBeCloseTo(Math.PI / 2, 6);
    expect(shadowAngularRadius(1.0001)).toBeGreaterThan(Math.PI * 0.97);
    expect(shadowAngularRadius(1)).toBe(Math.PI);
    let prev = 0;
    for (let r = 100; r > 1.001; r *= 0.95) {
      const a = shadowAngularRadius(r);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });

  it('disk temperature peaks at the requested value at r = (49/36) r_in', () => {
    expect(diskTemperature(3 * DISK_PEAK_X, 3, 6000)).toBeCloseTo(6000, 6);
    expect(diskTemperature(3 * 1.2, 3, 6000)).toBeLessThan(6000);
    expect(diskTemperature(3 * 2, 3, 6000)).toBeLessThan(6000);
    expect(diskTemperature(3, 3, 6000)).toBe(0);
  });

  it('disk temperature falls as r^-3/4 far out', () => {
    const t1 = diskTemperature(1000, 1, 1);
    const t2 = diskTemperature(16000, 1, 1);
    expect(t1 / t2).toBeCloseTo(8, 1);
  });

  it('approaching side of the disk is blueshifted, receding side redshifted', () => {
    const r = 6;
    expect(diskRedshift(r, 1)).toBeGreaterThan(1);
    expect(diskRedshift(r, -1)).toBeLessThan(diskRedshift(r, 0));
    // face-on: pure transverse Doppler × gravitational redshift
    expect(diskRedshift(r, 0)).toBeCloseTo(timeDilation(r) / lorentzFactor(keplerBeta(r)), 12);
  });

  it('a camera deep in the well sees the disk blueshifted', () => {
    expect(diskRedshift(6, 0, 1.2)).toBeGreaterThan(diskRedshift(6, 0));
  });

  it('visual scale is 1 for 1e8 M☉ and grows as M^(1/4)', () => {
    expect(visualScale(1e8)).toBeCloseTo(1, 12);
    expect(visualScale(1.6e9)).toBeCloseTo(2, 12);
  });
});
