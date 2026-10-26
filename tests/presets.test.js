import { describe, it, expect } from 'vitest';
import { PARAM_DEFS, PRESETS, DEFAULT_PRESET, getPreset, clampParam, toSlider, fromSlider } from '../src/ui/params.js';
import { schwarzschildRadius, iscoRadius } from '../src/physics/blackhole.js';

const KEYS = PARAM_DEFS.map((d) => d.key);

describe('presets', () => {
  it('provides Gargantua, Sagittarius A* and Quiet', () => {
    expect(Object.keys(PRESETS)).toEqual(['Gargantua', 'Sagittarius A*', 'Quiet']);
    expect(PRESETS[DEFAULT_PRESET]).toBeDefined();
  });

  it('includes the required controls', () => {
    for (const k of ['mass', 'spin', 'diskTemp', 'diskTilt', 'lensing', 'timeScale']) expect(KEYS).toContain(k);
  });

  for (const [name, preset] of Object.entries(PRESETS)) {
    describe(name, () => {
      it('sets exactly every slider parameter', () => {
        expect(Object.keys(preset).sort()).toEqual([...KEYS].sort());
      });

      it('keeps every value inside its slider range', () => {
        for (const def of PARAM_DEFS) {
          const v = preset[def.key];
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(def.min);
          expect(v).toBeLessThanOrEqual(def.max);
          expect(clampParam(def.key, v)).toBe(v);
        }
      });
    });
  }

  it('Sagittarius A* uses the measured mass (~4.3 million M☉, rs ≈ 0.085 AU)', () => {
    const m = PRESETS['Sagittarius A*'].mass;
    expect(m).toBeGreaterThan(4.0e6);
    expect(m).toBeLessThan(4.4e6);
    expect(schwarzschildRadius(m) / 1.496e11).toBeCloseTo(0.085, 2);
  });

  it('Gargantua is a 10^8 M☉ fast spinner with a near edge-on disk, as in Interstellar', () => {
    const g = PRESETS.Gargantua;
    expect(g.mass).toBe(1e8);
    expect(g.spin).toBeGreaterThan(0.5);
    expect(Math.abs(g.diskTilt)).toBeLessThan(10);
    expect(iscoRadius(g.spin)).toBeLessThan(iscoRadius(0));
  });

  it('Quiet is the dimmest, coolest and slowest preset', () => {
    const q = PRESETS.Quiet;
    for (const [name, p] of Object.entries(PRESETS)) {
      if (name === 'Quiet') continue;
      expect(q.diskTemp).toBeLessThan(p.diskTemp);
      expect(q.diskDensity).toBeLessThan(p.diskDensity);
      expect(q.timeScale).toBeLessThan(p.timeScale);
    }
  });

  it('getPreset returns an independent copy and rejects unknown names', () => {
    const a = getPreset('Gargantua');
    a.mass = 1;
    expect(PRESETS.Gargantua.mass).toBe(1e8);
    expect(() => getPreset('Nope')).toThrow();
  });
});

describe('slider mapping', () => {
  it('log sliders round-trip through log10 space', () => {
    const mass = PARAM_DEFS.find((d) => d.key === 'mass');
    expect(toSlider(mass, 1e8)).toBeCloseTo(8, 12);
    expect(fromSlider(mass, toSlider(mass, 4.3e6))).toBeCloseTo(4.3e6, 3);
  });

  it('linear sliders are identity', () => {
    const tilt = PARAM_DEFS.find((d) => d.key === 'diskTilt');
    expect(toSlider(tilt, 12.5)).toBe(12.5);
    expect(fromSlider(tilt, -3)).toBe(-3);
  });

  it('clampParam clamps into range', () => {
    expect(clampParam('spin', 5)).toBe(0.99);
    expect(clampParam('lensing', -1)).toBe(0);
    expect(() => clampParam('bogus', 1)).toThrow();
  });
});
