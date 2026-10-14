import {random} from 'remotion';

/**
 * Deterministic 1D value noise built on Remotion's random(seed).
 * Smooth (cosine-free quintic interpolation), range ~[-1, 1].
 */
export const noise1 = (seed: string | number, t: number): number => {
	const i = Math.floor(t);
	const f = t - i;
	const a = random(`${seed}:${i}`) * 2 - 1;
	const b = random(`${seed}:${i + 1}`) * 2 - 1;
	const u = f * f * f * (f * (f * 6 - 15) + 10);
	return a + (b - a) * u;
};

/** Fractal noise: 3 octaves, still deterministic and cheap. */
export const fbm1 = (seed: string | number, t: number): number =>
	noise1(seed, t) * 0.6 +
	noise1(`${seed}b`, t * 2.13) * 0.28 +
	noise1(`${seed}c`, t * 4.7) * 0.12;

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (x: number) => {
	const t = clamp01(x);
	return t * t * (3 - 2 * t);
};
/** 0 before a, ramps to 1 at b (smoothstep). */
export const ramp = (frame: number, a: number, b: number) =>
	smooth((frame - a) / Math.max(1e-6, b - a));
/** Window: ramps up over [a,b], holds, ramps down over [c,d]. */
export const windowRamp = (
	frame: number,
	a: number,
	b: number,
	c: number,
	d: number,
) => ramp(frame, a, b) * (1 - ramp(frame, c, d));

/** Pre-computes N random numbers per instance once, keyed by seed. */
const cache = new Map<string, Float32Array>();
export const instanceRandoms = (seed: string, count: number, per = 6) => {
	const key = `${seed}/${count}/${per}`;
	const hit = cache.get(key);
	if (hit) return hit;
	const arr = new Float32Array(count * per);
	for (let i = 0; i < count * per; i++) arr[i] = random(`${seed}-${i}`);
	cache.set(key, arr);
	return arr;
};
