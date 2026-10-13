import {noise2} from '../../lib/noise';
import {interpolate} from 'remotion';
import T from './timeline.json';

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Sea floor / beach height. Land at z>12, slope to -12 by z=-50, ripples in the sand. */
export const bedH = (x: number, z: number) => {
  const t = Math.min(1, Math.max(0, (12 - z) / 62));
  const base = -12 * (t * t * (3 - 2 * t));
  const land = z > 12 ? (z - 12) * 0.1 + Math.max(0, noise2(x * 0.05, z * 0.05) - 0.4) * 6 : 0;
  const rip = (noise2(x * 0.09, z * 0.09) - 0.5) * 3.2 * sm(0, 0.35, t) + (noise2(x * 0.4, z * 0.4) - 0.5) * 0.35 * sm(0, 0.2, t);
  const sandbar = Math.sin(z * 0.45 + noise2(x * 0.05, 3) * 5) * 0.12 * sm(0.1, 0.5, t);
  return base + land + rip + sandbar;
};

/** Sea level over time: calm, drains to well below the floor, big surge at impact, settles back to 0. */
export const waterLevel = (f: number) => {
  if (f < T.wall.hit) {
    const p = Math.min(1, Math.max(0, (f - T.drain.start) / (T.drain.end - T.drain.start)));
    return -15 * p * p * (3 - 2 * p);
  }
  if (f < T.wall.hit + 20) return interpolate(f, [T.wall.hit, T.wall.hit + 20], [-15, 6]);
  if (f < 1700) return 6;
  return interpolate(f, [1700, 1850], [6, 0], {extrapolateRight: 'clamp'});
};

export const wallZ = (f: number) => {
  const p = Math.min(1, Math.max(0, (f - T.wall.appear) / (T.wall.hit - T.wall.appear)));
  return -520 + 510 * Math.pow(p, 1.4);
};

export const isUnderwater = (f: number) => f >= T.underwater.from && f < T.underwater.to;
