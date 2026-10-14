import {RigConfig, CamKey} from '../../lib/PovCamera';
import {keys, keysLin} from '../../lib/curve';
import tl from './timeline.json';
import {terrainH} from './world';

const E = (x: number, z: number) => terrainH(x, z) + 1.7;
const bump = (f: number, c: number, w: number) => Math.exp(-Math.pow((f - c) / w, 2));

type Y = number | 'e';
const K = (f: number, p: [number, Y, number], t: [number, number | 'e' | [number], number]): CamKey => {
	const py = p[1] === 'e' ? E(p[0], p[2]) : p[1];
	let ty: number;
	if (Array.isArray(t[1])) ty = terrainH(t[0], t[2]) + t[1][0];
	else ty = t[1] === 'e' ? E(t[0], t[2]) : t[1];
	return {f, pos: [p[0], py, p[2]], target: [t[0], ty, t[2]]};
};
// target y given as [dy] = height above the seabed at the target point

export const camKeys: CamKey[] = [
	// 1 hook-pier: calm sunset, sea starts to leave; glance down at the retreating waterline
	K(0, [0, 3.3, 2.0], [0, 2.8, -40]),
	K(100, [0.05, 3.35, 1.6], [0.3, 2.0, -30]),
	K(170, [0, 3.3, 1.2], [-0.8, -1.5, -9]),
	K(240, [0, 3.3, 0.2], [0, 1.5, -45]),
	// 2 ladder-down: walk to the end, turn, climb down hand over hand
	K(300, [0, 3.3, -1.6], [0, 1.0, -40]),
	K(350, [0, 3.3, -2.6], [0, -1.0, -25]),
	K(385, [0, 3.2, -2.9], [0, -3.5, -20]),
	K(570, [0, 'e', -3.0], [0, -3.0, -26]),
	K(600, [0, 'e', -4.5], [0.5, [1.2], -30]),
	// 3 seabed-walk
	K(700, [1, 'e', -22], [4, [3.2], -45]),
	K(790, [3, 'e', -38], [-12, [4.5], -48]),
	K(870, [4, 'e', -52], [8, [3.2], -70]),
	K(960, [4, 'e', -64], [2, [4], -90]),
	// 4 look-up: stop, tilt the head back to the moon, hold
	K(1040, [4, 'e', -68], [2, [6], -100]),
	K(1120, [4, 'e', -70], [0, 50, -95]),
	K(1200, [4, 'e', -70.5], [-10, 120, -140]),
	K(1260, [4, 'e', -71], [-12, 125, -140]),
	K(1320, [4, 'e', -71], [6.5, 5, -77]),
	// 5 run-back
	K(1360, [4, 'e', -69], [0, [2.5], 10]),
	K(1450, [3, 'e', -52], [0, 11, 0]),
	K(1540, [1.5, 'e', -36], [0, [2.5], 0]),
	K(1630, [0.5, 'e', -18], [0, [2], 10]),
	K(1700, [0, 'e', -8], [0, [2], 10]),
	K(1740, [0, -7.4, -4], [0, -2, 10]),
	// 6 snap: water lifts the camera, tumbling, until it breaks the surface at the pier
	K(1780, [0, -7.3, -3.6], [0, 10, -10]),
	K(1830, [0, -7.0, -3.5], [0, 20, 5]),
	K(1900, [0, -1.5, -3.0], [4, 25, -12]),
	K(1960, [0, 2.4, -0.5], [0, 3, -40]),
	// 7 calm-loop: settle on exactly the opening frame
	K(2010, [0, 3.3, 0.8], [0, 2.8, -40]),
	K(2090, [0, 3.3, 1.6], [0, 2.8, -40]),
	K(2159, [0, 3.3, 2.0], [0, 2.8, -40]),
];

export const rig: RigConfig = {
	keys: camKeys,
	loopFrames: tl.duration,
	fps: tl.fps,
	impacts: tl.impacts,
	tension: (f) => keysLin(tl.tension as [number, number][], f),
	walk: (f) => {
		const amp = keysLin([[0, 0], [330, 0], [350, 1], [570, 1.2], [600, 1], [950, 1], [980, 0.1], [1330, 0.1], [1350, 1.5], [1400, 2.2], [1735, 2.4], [1745, 0], [2159, 0]], f);
		const hz = keysLin([[0, 1.6], [570, 3.6], [600, 1.9], [1330, 1.9], [1360, 3.1], [1740, 3.3], [2159, 1.6]], f);
		return {hz, amp};
	},
	head: (f) => {
		const t = keysLin(tl.tension as [number, number][], f);
		const n = (s: number) => Math.sin(f * s) * Math.sin(f * s * 0.43 + 1);
		const yaw = 0.34 * bump(f, 135, 14) - 0.3 * bump(f, 330, 14) + 0.28 * bump(f, 705, 16) - 0.35 * bump(f, 960, 18) + 0.25 * n(0.11) * t * t;
		const pitch = 0.09 * n(0.09) * t - 0.25 * bump(f, 1330, 10) + 0.1 * bump(f, 745, 16);
		const roll = 0.18 * bump(f, 1745, 18) * Math.sin(f * 0.37) + 0.05 * n(0.07) * t;
		return {yaw, pitch, roll};
	},
	fov: (f) => {
		const t = keysLin(tl.tension as [number, number][], f);
		return 70 + 15 * Math.pow(t, 1.6) + 12 * bump(f, 1762, 14) - 16 * bump(f, 1740, 7) + 4 * bump(f, 1946, 10);
	},
};

export {keys, bump};
