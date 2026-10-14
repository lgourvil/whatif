import { random } from "remotion";

// Deterministic 1D value noise built on Remotion's seeded random().
// Smooth (cosine-interpolated) so it can drive handheld shake, flicker, wind…
export const noise1 = (t: number, seed: string | number): number => {
  const i = Math.floor(t);
  const f = t - i;
  const a = random(`${seed}-${i}`) * 2 - 1;
  const b = random(`${seed}-${i + 1}`) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
};

// Fractal (2 octaves) version — more organic camera shake.
export const fbm1 = (t: number, seed: string | number): number =>
  noise1(t, seed) * 0.7 + noise1(t * 2.13 + 17.1, `${seed}b`) * 0.3;

// Cheap deterministic hash for per-instance values (faster than random() in hot loops).
export const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
};

// 2D/3D smooth value noise for terrain / sea (pure function of inputs).
const h3 = (x: number, y: number, z: number) => hash(x * 157 + y * 113 + z * 271);
export const noise3 = (x: number, y: number, z: number): number => {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const x00 = lerp(h3(xi, yi, zi), h3(xi + 1, yi, zi), u);
  const x10 = lerp(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u);
  const x01 = lerp(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u);
  const x11 = lerp(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 2 - 1;
};

// Piecewise-linear lookup over [[frame, value], …] keyframes with smoothstep easing.
export const keyed = (frame: number, keys: [number, number][]): number => {
  if (frame <= keys[0][0]) return keys[0][1];
  for (let k = 0; k < keys.length - 1; k++) {
    const [f0, v0] = keys[k];
    const [f1, v1] = keys[k + 1];
    if (frame <= f1) {
      const t = (frame - f0) / Math.max(1e-6, f1 - f0);
      const s = t * t * (3 - 2 * t);
      return v0 + (v1 - v0) * s;
    }
  }
  return keys[keys.length - 1][1];
};
