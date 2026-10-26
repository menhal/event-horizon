// Control-panel parameter definitions and presets.

/**
 * Slider definitions. `scale: 'log'` sliders move in log10 space; values stored
 * in params are always in natural units (mass in solar masses, tilt in degrees).
 */
export const PARAM_DEFS = [
  { key: 'mass', label: 'Mass', min: 1e5, max: 3e10, scale: 'log', unit: 'M☉' },
  { key: 'spin', label: 'Spin a*', min: 0, max: 0.99, step: 0.01 },
  { key: 'diskTemp', label: 'Disk temperature', min: 1500, max: 25000, step: 100, unit: 'K' },
  { key: 'diskTilt', label: 'Disk tilt', min: -40, max: 40, step: 0.5, unit: '°' },
  { key: 'diskDensity', label: 'Disk density', min: 0.1, max: 1.5, step: 0.01 },
  { key: 'lensing', label: 'Lensing strength', min: 0, max: 1.5, step: 0.01 },
  { key: 'timeScale', label: 'Time scale', min: 0, max: 5, step: 0.05, unit: '×' },
];

export const PRESETS = {
  Gargantua: {
    mass: 1e8,
    spin: 0.6,
    diskTemp: 4600,
    diskTilt: 3,
    diskDensity: 1.0,
    lensing: 1,
    timeScale: 1,
  },
  'Sagittarius A*': {
    mass: 4.3e6,
    spin: 0.9,
    diskTemp: 9500,
    diskTilt: 22,
    diskDensity: 0.55,
    lensing: 1,
    timeScale: 1.6,
  },
  Quiet: {
    mass: 2e7,
    spin: 0,
    diskTemp: 2600,
    diskTilt: -8,
    diskDensity: 0.3,
    lensing: 1,
    timeScale: 0.3,
  },
};

export const DEFAULT_PRESET = 'Gargantua';

/** Returns a copy of a preset's parameters; throws for unknown names. */
export function getPreset(name) {
  const preset = PRESETS[name];
  if (!preset) throw new Error(`Unknown preset: ${name}`);
  return { ...preset };
}

/** Clamps a value into a parameter's [min, max] range. */
export function clampParam(key, value) {
  const def = PARAM_DEFS.find((d) => d.key === key);
  if (!def) throw new Error(`Unknown parameter: ${key}`);
  return Math.min(def.max, Math.max(def.min, value));
}

/** Converts a natural value to the slider position (log10 for log sliders). */
export function toSlider(def, value) {
  return def.scale === 'log' ? Math.log10(value) : value;
}

/** Converts a slider position back to the natural value. */
export function fromSlider(def, position) {
  return def.scale === 'log' ? Math.pow(10, position) : position;
}
