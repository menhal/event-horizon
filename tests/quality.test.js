import { describe, it, expect } from 'vitest';
import { QualityController, QUALITY_LEVELS } from '../src/scene/quality.js';

function run(q, fps, seconds) {
  const changes = [];
  const frames = Math.round(fps * seconds);
  for (let i = 0; i < frames; i++) {
    const c = q.frame(1 / fps);
    if (c !== null) changes.push(c);
  }
  return changes;
}

describe('QualityController', () => {
  it('orders levels from most to least expensive', () => {
    for (let i = 1; i < QUALITY_LEVELS.length; i++) {
      expect(QUALITY_LEVELS[i].renderScale).toBeLessThan(QUALITY_LEVELS[i - 1].renderScale);
      expect(QUALITY_LEVELS[i].maxSteps).toBeLessThan(QUALITY_LEVELS[i - 1].maxSteps);
    }
  });

  it('holds the level at a steady 60 fps', () => {
    const q = new QualityController({ level: 1, upgradeFps: 61 });
    expect(run(q, 60, 20)).toEqual([]);
    expect(q.level).toBe(1);
  });

  it('steps down when fps drops below 50', () => {
    const q = new QualityController({ level: 0 });
    run(q, 40, 3.5);
    expect(q.level).toBe(1);
    run(q, 40, 30);
    expect(q.level).toBe(QUALITY_LEVELS.length - 1);
  });

  it('ignores a single slow window (e.g. a GC hitch)', () => {
    const q = new QualityController({ level: 0 });
    run(q, 60, 2);
    run(q, 30, 1);
    run(q, 60, 3);
    expect(q.level).toBe(0);
  });

  it('steps back up after sustained headroom and backs off after a failed upgrade', () => {
    const q = new QualityController({ level: 2, upgradeWindows: 3 });
    run(q, 60, 4.5);
    expect(q.level).toBe(1);
    // the upgrade was too expensive: fps collapses immediately
    run(q, 40, 2.5);
    expect(q.level).toBe(2);
    expect(q.upgradeWindows).toBe(6);
  });

  it('does nothing while disabled', () => {
    const q = new QualityController({ level: 0 });
    q.enabled = false;
    run(q, 20, 10);
    expect(q.level).toBe(0);
    expect(q.fps).toBeCloseTo(20, 5);
  });
});
