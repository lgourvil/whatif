import {random} from 'remotion';
import {keysLin, lerp} from '../../lib/curve';

const N = 48;
const lattice = Array.from({length: N * N}, (_, i) => random(`terrain${i}`) * 2 - 1);
const lat = (ix: number, iz: number) => lattice[((iz % N) + N) % N * N + (((ix % N) + N) % N)];

const vnoise = (x: number, z: number) => {
	const ix = Math.floor(x), iz = Math.floor(z);
	const tx = x - ix, tz = z - iz;
	const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
	return lerp(lerp(lat(ix, iz), lat(ix + 1, iz), sx), lerp(lat(ix, iz + 1), lat(ix + 1, iz + 1), sx), sz);
};

/** Seabed / beach height. Pier runs from z=-3 (end) to z=+46; the sea is -z. */
export const terrainH = (x: number, z: number) => {
	const base = keysLin([[-400, -13.4], [-120, -13.4], [-30, -12.2], [-6, -9.4], [4, -5.6], [20, -0.2], [34, 1.2], [60, 2.6], [400, 4]], z);
	const n = vnoise(x * 0.045 + 11, z * 0.045 + 5) * 1.3 + vnoise(x * 0.13, z * 0.13) * 0.45 + vnoise(x * 0.4, z * 0.4) * 0.12;
	const flat = z > 12 ? 0.25 : 1; // keep the beach calmer
	// a shallow trench around the walking route keeps the walk from clipping rocks
	return base + n * flat;
};

export const PIER = {endZ: -3, startZ: 46, deckY: 2.2, halfW: 1.6};
