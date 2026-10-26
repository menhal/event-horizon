import { describe, it, expect } from 'vitest';
import { sampleCinematic, CINEMATIC_KEYS, CINEMATIC_DURATION } from '../src/camera/cinematic.js';
import { poseFromSpherical, anglesLookingAlong } from '../src/camera/orbit-camera.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(...a);

describe('cinematic path', () => {
  it('passes through every key frame', () => {
    for (const k of CINEMATIC_KEYS) {
      const p = sampleCinematic(k.t);
      expect(p.dist).toBeCloseTo(k.dist, 9);
      expect(p.el).toBeCloseTo(k.el, 9);
      expect(p.az).toBeCloseTo(k.az % 360, 9);
    }
  });

  it('loops seamlessly', () => {
    const a = sampleCinematic(CINEMATIC_DURATION - 1e-6);
    const b = sampleCinematic(0);
    expect(a.dist).toBeCloseTo(b.dist, 3);
    expect(a.el).toBeCloseTo(b.el, 3);
    expect(Math.abs(((a.az - b.az + 540) % 360) - 180)).toBeLessThan(1e-3);
  });

  it('stays well outside the horizon and moves smoothly', () => {
    let prev = sampleCinematic(0);
    for (let t = 0.05; t < CINEMATIC_DURATION * 2; t += 0.05) {
      const p = sampleCinematic(t);
      expect(p.dist).toBeGreaterThan(3);
      expect(Math.abs(p.dist - prev.dist)).toBeLessThan(0.5);
      prev = p;
    }
  });
});

describe('camera pose', () => {
  it('builds an orthonormal basis looking at the origin', () => {
    const p = poseFromSpherical(37, 12, 20, 5);
    expect(len(p.position)).toBeCloseTo(20, 9);
    expect(dot(p.forward, p.position.map((v) => v / 20))).toBeCloseTo(-1, 9);
    for (const v of [p.right, p.up, p.forward]) expect(len(v)).toBeCloseTo(1, 9);
    expect(dot(p.right, p.up)).toBeCloseTo(0, 9);
    expect(dot(p.right, p.forward)).toBeCloseTo(0, 9);
    expect(dot(p.up, p.forward)).toBeCloseTo(0, 9);
  });

  it('anglesLookingAlong places the hole between the camera and a target direction', () => {
    const dir = [-0.55, 0.18, -0.81];
    const n = len(dir);
    const { az, el } = anglesLookingAlong(dir);
    const p = poseFromSpherical(az, el, 30);
    for (let i = 0; i < 3; i++) expect(p.forward[i]).toBeCloseTo(dir[i] / n, 9);
  });
});
