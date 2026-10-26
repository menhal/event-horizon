import { describe, it, expect } from 'vitest';
import { sci, formatLength, formatDuration, formatFactor } from '../src/ui/format.js';

describe('HUD formatting', () => {
  it('scientific notation with superscript exponent', () => {
    expect(sci(4.3e6)).toBe('4.30 × 10⁶');
    expect(sci(1e8, 1)).toBe('1.0 × 10⁸');
    expect(sci(2.5e-4)).toBe('2.50 × 10⁻⁴');
  });

  it('lengths switch from km to AU', () => {
    expect(formatLength(2953)).toBe('3 km');
    expect(formatLength(1.27e10)).toBe('0.08 AU');
  });

  it('durations', () => {
    expect(formatDuration(65.25)).toBe('00:01:05.3');
    expect(formatDuration(90061)).toBe('1d 01:01:01');
  });

  it('factors', () => {
    expect(formatFactor(0.70710678)).toBe('0.7071');
    expect(formatFactor(0)).toBe('0');
    expect(formatFactor(2e-5)).toBe('2.00 × 10⁻⁵');
  });
});
