import {random} from 'remotion';

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (x: number) => {
	const t = clamp01(x);
	return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Piecewise curve through [frame, value] keys, smoothstep-eased between keys. */
export const keys = (k: ReadonlyArray<readonly [number, number]>, f: number) => {
	if (f <= k[0][0]) return k[0][1];
	for (let i = 1; i < k.length; i++) {
		if (f <= k[i][0]) {
			const [f0, v0] = k[i - 1];
			const [f1, v1] = k[i];
			return lerp(v0, v1, smooth((f - f0) / (f1 - f0)));
		}
	}
	return k[k.length - 1][1];
};

/** Same, but linear between keys. */
export const keysLin = (k: ReadonlyArray<readonly [number, number]>, f: number) => {
	if (f <= k[0][0]) return k[0][1];
	for (let i = 1; i < k.length; i++) {
		if (f <= k[i][0]) {
			const [f0, v0] = k[i - 1];
			const [f1, v1] = k[i];
			return lerp(v0, v1, (f - f0) / (f1 - f0));
		}
	}
	return k[k.length - 1][1];
};

/** Smooth deterministic 1D noise in [-1,1]; wraps every `period` cells so a loop is seamless. */
export const noise1 = (x: number, seed: string, period = 1e9) => {
	const i = Math.floor(x);
	const t = x - i;
	const a = random(`${seed}-${((i % period) + period) % period}`) * 2 - 1;
	const b = random(`${seed}-${(((i + 1) % period) + period) % period}`) * 2 - 1;
	const s = t * t * (3 - 2 * t);
	return a + (b - a) * s;
};

/** Impact envelope: damped oscillation after `at`. */
export const shock = (f: number, at: number, strength: number, decay = 14, freq = 0.9) => {
	const d = f - at;
	if (d < 0) return 0;
	return strength * Math.exp(-d / decay) * Math.cos(d * freq);
};
