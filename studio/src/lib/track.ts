/**
 * Keyframe track with monotone cubic interpolation (Fritsch–Carlson):
 * smooth velocity through keys, no overshoot. Keys: [frame, value][] sorted.
 */
export const track = (frame: number, keys: [number, number][]): number => {
	const n = keys.length;
	if (frame <= keys[0][0]) return keys[0][1];
	if (frame >= keys[n - 1][0]) return keys[n - 1][1];
	let i = 0;
	while (frame > keys[i + 1][0]) i++;
	const d = (k: number) => (keys[k + 1][1] - keys[k][1]) / (keys[k + 1][0] - keys[k][0]);
	const tan = (k: number) => {
		if (k === 0 || k === n - 1) return 0;
		const a = d(k - 1);
		const b = d(k);
		if (a * b <= 0) return 0;
		return (2 * a * b) / (a + b);
	};
	const [f0, v0] = keys[i];
	const [f1, v1] = keys[i + 1];
	const h = f1 - f0;
	const t = (frame - f0) / h;
	const t2 = t * t;
	const t3 = t2 * t;
	return (
		(2 * t3 - 3 * t2 + 1) * v0 +
		(t3 - 2 * t2 + t) * h * tan(i) +
		(-2 * t3 + 3 * t2) * v1 +
		(t3 - t2) * h * tan(i + 1)
	);
};
