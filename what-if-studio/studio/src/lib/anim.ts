import {random} from 'remotion';

export type Key = [number, number];

/** Monotone cubic (PCHIP) interpolation through keys: smooth, no overshoot, holds on equal values. */
export const smooth = (f: number, keys: Key[]): number => {
  const n = keys.length;
  if (f <= keys[0][0]) return keys[0][1];
  if (f >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (f >= keys[i + 1][0]) i++;
  const d = (k: number) => (keys[k + 1][1] - keys[k][1]) / (keys[k + 1][0] - keys[k][0]);
  const slope = (k: number) => {
    if (k === 0) return d(0);
    if (k === n - 1) return d(n - 2);
    const a = d(k - 1), b = d(k);
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  };
  const [x0, y0] = keys[i], [x1, y1] = keys[i + 1];
  const h = x1 - x0, t = (f - x0) / h;
  const m0 = slope(i) * h, m1 = slope(i + 1) * h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
};

/** Deterministic smooth 1D noise in [-1,1]. */
export const smoothNoise = (seed: string, t: number): number => {
  const i = Math.floor(t);
  const s = t - i;
  const a = random(`${seed}-${i}`) * 2 - 1;
  const b = random(`${seed}-${i + 1}`) * 2 - 1;
  const k = s * s * (3 - 2 * s);
  return a + (b - a) * k;
};

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
