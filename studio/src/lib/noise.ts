import {random} from 'remotion';

/** Deterministic smooth 1D noise in [-1,1] built from Remotion's random(). */
export const smoothNoise = (seed: string, t: number) => {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  const a = random(`${seed}-${i}`) * 2 - 1;
  const b = random(`${seed}-${i + 1}`) * 2 - 1;
  return a + (b - a) * u;
};

export const fbm = (seed: string, t: number) => smoothNoise(seed, t) * 0.6 + smoothNoise(seed + 'b', t * 2.3) * 0.3 + smoothNoise(seed + 'c', t * 5.1) * 0.1;

/** Cheap 2D value noise from sin hashes (static terrain; no randomness involved). */
const h2 = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
export const noise2 = (x: number, y: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi);
  const b = h2(xi + 1, yi);
  const c = h2(xi, yi + 1);
  const d = h2(xi + 1, yi + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
};
