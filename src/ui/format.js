// Number formatting for HUD readouts.

import { AU } from '../physics/blackhole.js';

const SUPERSCRIPT = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

/** "4.30 × 10⁶" style scientific notation. */
export function sci(value, digits = 2) {
  if (value === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(value)));
  const mant = value / Math.pow(10, exp);
  const sup = String(exp)
    .split('')
    .map((c) => SUPERSCRIPT[c])
    .join('');
  return `${mant.toFixed(digits)} × 10${sup}`;
}

/** Length in metres → km below 10 million km, otherwise AU. */
export function formatLength(m) {
  if (m < 1e10) return `${Math.round(m / 1000).toLocaleString('en-US')} km`;
  return `${(m / AU).toFixed(2)} AU`;
}

/** Duration in seconds → "1y 23d 04:05:06" / "04:05:06.7". */
export function formatDuration(s) {
  const sign = s < 0 ? '-' : '';
  s = Math.abs(s);
  const years = Math.floor(s / 31557600);
  s -= years * 31557600;
  const days = Math.floor(s / 86400);
  s -= days * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const pad = (n) => String(n).padStart(2, '0');
  const sec = years || days ? pad(Math.floor(s)) : s.toFixed(1).padStart(4, '0');
  const clock = `${pad(h)}:${pad(m)}:${sec}`;
  if (years) return `${sign}${years}y ${days}d ${clock}`;
  if (days) return `${sign}${days}d ${clock}`;
  return sign + clock;
}

/** Dilation factor with enough precision to show tiny values. */
export function formatFactor(x) {
  if (x === 0) return '0';
  if (x >= 0.001) return x.toFixed(4);
  return sci(x, 2);
}
