// Adaptive quality: measures fps over fixed windows and steps the render
// quality down when it drops below the target, with backoff on upgrades.

export const QUALITY_LEVELS = [
  { name: 'Ultra', renderScale: 1.0, maxSteps: 320, stepScale: 1.0, octaves: 5 },
  { name: 'High', renderScale: 0.85, maxSteps: 260, stepScale: 1.15, octaves: 4 },
  { name: 'Medium', renderScale: 0.7, maxSteps: 200, stepScale: 1.35, octaves: 4 },
  { name: 'Low', renderScale: 0.55, maxSteps: 150, stepScale: 1.6, octaves: 3 },
  { name: 'Potato', renderScale: 0.42, maxSteps: 110, stepScale: 2.0, octaves: 2 },
];

export class QualityController {
  /**
   * @param {object} [opts]
   * @param {number} [opts.level] starting index into QUALITY_LEVELS (0 = best)
   * @param {number} [opts.minFps] downgrade threshold
   * @param {number} [opts.upgradeFps] fps a window must reach to count toward an upgrade
   * @param {number} [opts.window] measurement window, seconds
   * @param {number} [opts.downgradeWindows] consecutive slow windows before downgrading
   * @param {number} [opts.upgradeWindows] consecutive fast windows before trying an upgrade
   */
  constructor(opts = {}) {
    this.levels = opts.levels ?? QUALITY_LEVELS;
    this.level = opts.level ?? 1;
    this.minFps = opts.minFps ?? 50;
    this.upgradeFps = opts.upgradeFps ?? 58;
    this.window = opts.window ?? 1;
    this.downgradeWindows = opts.downgradeWindows ?? 2;
    this.upgradeWindows = opts.upgradeWindows ?? 6;
    this.stall = opts.stall ?? 0.25;
    this.enabled = true;
    this.fps = 0;
    this._frames = 0;
    this._elapsed = 0;
    this._slow = 0;
    this._fast = 0;
    this._windowsSinceUpgrade = Infinity;
    this._warmup = opts.warmup ?? 1;
  }

  get current() {
    return this.levels[this.level];
  }

  /**
   * Records one frame of duration dt seconds. Returns the new level index when
   * the level changes, otherwise null. A gap longer than `stall` seconds (tab
   * hidden, debugger, window drag) discards the current measurement window.
   */
  frame(dt) {
    if (dt > this.stall) {
      this._frames = 0;
      this._elapsed = 0;
      return null;
    }
    this._frames += 1;
    this._elapsed += dt;
    if (this._elapsed < this.window) return null;
    this.fps = this._frames / this._elapsed;
    this._frames = 0;
    this._elapsed = 0;
    this._windowsSinceUpgrade += 1;
    if (this._warmup > 0) {
      this._warmup -= 1;
      return null;
    }
    if (!this.enabled) return null;

    if (this.fps < this.minFps) {
      this._slow += 1;
      this._fast = 0;
    } else {
      this._slow = 0;
      this._fast = this.fps >= this.upgradeFps ? this._fast + 1 : 0;
    }

    if (this._slow >= this.downgradeWindows && this.level < this.levels.length - 1) {
      // A downgrade shortly after an upgrade doubles the wait before the next upgrade.
      if (this._windowsSinceUpgrade <= this.downgradeWindows + 1) this.upgradeWindows *= 2;
      this.level += 1;
      this._slow = 0;
      this._fast = 0;
      return this.level;
    }
    if (this._fast >= this.upgradeWindows && this.level > 0) {
      this.level -= 1;
      this._fast = 0;
      this._windowsSinceUpgrade = 0;
      return this.level;
    }
    return null;
  }

  /** Forces a level (e.g. from the UI) and resets the counters. */
  setLevel(level) {
    this.level = Math.min(this.levels.length - 1, Math.max(0, level));
    this._slow = 0;
    this._fast = 0;
    this._warmup = 1;
  }
}
