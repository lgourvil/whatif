import {random} from 'remotion';
import {PovSpec} from '../../lib/PovCamera';
import {Hair} from '../../lib/Citizens';
import {Key} from '../../lib/anim';
import timeline from './timeline.json';

export const TL = timeline;
export const DURATION = timeline.durationInFrames;
/** frame at which the world is reset under the white-out (camera back to the start, crowd on "loop time") */
export const RESET = 1470;
export const CAM_X = 5.8;

export const SPEC: PovSpec = {
  path: [[CAM_X, 0], [CAM_X, -40]],
  eye: 1.68,
  u: [[0, 0], [185, 0], [470, 0.34], [490, 0.35], [780, 0.35], [1080, 0.47], [1380, 0.56], [1469, 0.58], [1470, 0], [2250, 0]],
  yaw: [[0, 0], [205, 0], [250, -0.5], [312, -0.5], [345, 0], [375, 0.24], [445, 0.24], [480, 0.08], [780, 0.08], [830, 0], [1080, 0],
    [1150, -0.38], [1250, 0.35], [1330, 0], [1469, 0], [1470, 0], [1800, 0], [1850, -0.5], [1905, 0.48], [1950, 0], [2250, 0]],
  pitch: [[0, -0.05], [180, -0.05], [250, -0.02], [480, 0], [540, 0.95], [720, 0.95], [780, 0.05], [850, -0.22], [1000, -0.22], [1060, 0],
    [1380, -0.04], [1560, -0.04], [1640, 0.82], [1760, 0.82], [1820, 0.02], [1950, -0.04], [2130, -0.05], [2250, -0.05]],
  fov: [[0, 70], [228, 70], [258, 58], [312, 58], [345, 70], [372, 70], [392, 58], [445, 58], [475, 70], [480, 70], [600, 74], [780, 70], [1080, 72], [1380, 80], [1550, 86], [1562, 60], [1640, 74], [1800, 70], [2250, 70]],
  tension: timeline.tension as Key[],
  impacts: timeline.impacts,
};

export const HAZE: Key[] = timeline.haze as Key[];
export const MOOD: Key[] = [[0, 0], [480, 0.15], [650, 0.45], [780, 1], [1080, 1.5], [1380, 2], [1560, 2], [1700, 0.4], [1800, 0], [2250, 0]];
export const DECK: Key[] = [[0, 0], [480, 0.05], [720, 1], [1560, 1], [1720, 0], [2250, 0]];
export const WHITE: Key[] = [[0, 0], [1300, 0], [1430, 0.86], [1545, 0.86], [1600, 0.35], [1700, 0], [2250, 0]];
export const RAIN: Key[] = [[0, 0], [790, 0], [850, 1], [1300, 1], [1420, 0], [2250, 0]];
export const LAMPS: Key[] = [[0, 0], [790, 0], [860, 1], [1560, 1], [1640, 0], [2250, 0]];
export const SUNBURST: Key[] = [[0, 0], [1580, 0], [1640, 1], [1760, 0.15], [1850, 0], [2250, 0]];

/** battery shown on the device */
export const pctAt = (f: number) => {
  if (f >= 2000) return 100;
  if (f >= 1560) return 0;
  const k: [number, number][] = [[0, 100], [180, 99], [480, 95], [780, 80], [1080, 48], [1380, 12], [1540, 1], [1559, 1]];
  let i = 0;
  while (i < k.length - 2 && f >= k[i + 1][0]) i++;
  const [a, va] = k[i], [b, vb] = k[i + 1];
  return Math.round(va + (vb - va) * Math.min(1, Math.max(0, (f - a) / (b - a))));
};

/** crowd clock: real frame before the reset, then "frame - DURATION" so the last frame flows into frame 0 */
export const crowdTime = (f: number) => (f < RESET ? f : f - DURATION);

export type Cit = {
  x: number; z: number; yaw: number; v: number; hair: Hair; coat: string; skin: string; hairColor: string;
  scale: number; stoop?: number; cane?: boolean; seated?: boolean; puffs: number[]; id: string;
};

const COATS = ['#e85d75', '#3fa7d6', '#f7b32b', '#59cd90', '#7d5ba6', '#ee6c4d', '#2e86ab', '#f4a259', '#5c946e', '#c2678d'];
const SKINS = ['#f2c7a5', '#d9a07a', '#a8714f', '#7a4b31', '#f6d5bd'];
const HAIRC = ['#2a1c14', '#4b2e1e', '#111111', '#c9a26b', '#8a8a8a'];
const HAIRS: Hair[] = ['none', 'cap', 'beanie', 'bob', 'hood', 'none', 'cap'];

/** puff times on the crowd clock: everyone exhales together at 120, then faster and faster */
const schedule = (id: string, first = 120): number[] => {
  const out: number[] = [];
  let t = first + Math.round((random(`${id}-s`) - 0.5) * 6);
  while (t < RESET - 10) {
    out.push(t);
    const k = Math.min(1, t / 1400);
    t += Math.round((170 - 100 * k) * (0.75 + random(`${id}-${t}`) * 0.5));
  }
  return out;
};

const mk = (i: number, x: number, z: number, yaw: number, v = 0, extra: Partial<Cit> = {}): Cit => ({
  id: `c${i}`, x, z, yaw, v,
  hair: HAIRS[Math.floor(random(`h${i}`) * HAIRS.length)],
  coat: COATS[i % COATS.length],
  skin: SKINS[Math.floor(random(`s${i}`) * SKINS.length)],
  hairColor: HAIRC[Math.floor(random(`hc${i}`) * HAIRC.length)],
  scale: 0.92 + random(`sc${i}`) * 0.16,
  puffs: schedule(`c${i}`),
  ...extra,
});

const N = Math.PI / 2;
export const CITIZENS: Cit[] = [
  // right sidewalk: standing in front of shops, facing the street
  mk(0, 7.6, -7, -N - 0.4), mk(1, 7.7, -9.5, -N + 0.5), mk(2, 7.5, -26, -N - 0.2),
  // grandma (signature: bun + cane + lilac cardigan)
  {...mk(3, 7.3, -18.5, -2.6, 0, {hair: 'bun', hairColor: '#e8e8ee', coat: '#b39ddb', skin: '#f2c7a5', stoop: 0.5, cane: true, scale: 0.9}), puffs: [121, 268, 418, 600, 760, 900, 1030, 1150, 1260, 1370]},
  // oncoming walkers (right sidewalk, toward camera) and people walking ahead
  mk(4, 7.6, -30, 0, 0.042), mk(5, 7.7, -52, 0, 0.038), mk(6, 6.7, -12, Math.PI, -0.035), mk(7, 6.6, -40, Math.PI, -0.04),
  // left sidewalk
  mk(8, -6.2, -4, N, 0), mk(9, -6.6, -14, N + 0.6), mk(10, -6.4, -24, N - 0.3), mk(11, -5.6, -34, 0, 0.04), mk(12, -6.0, -8, Math.PI, -0.04),
  mk(13, -7.2, -44, N), mk(14, -5.8, 6, Math.PI, -0.036), mk(15, -6.8, -60, N),
  // far right / near the crosswalk
  mk(16, 7.8, -40, -N), mk(17, 6.9, -46, -N + 1.0), mk(18, 7.6, -58, -N), mk(19, 7.2, 4, -N - 0.8),
  // across the crosswalk
  mk(20, 1.5, -37, N, 0), mk(21, -1.2, -38, -N),
];
/** the bus driver (seated, upper body through the window) */
export const DRIVER = {...mk(30, -1.7, -12.6, N, 0, {hair: 'cap', hairColor: '#1f3a5f', coat: '#1f3a5f', seated: true}), puffs: [122, 272, 520, 700, 880, 1040, 1180, 1300, 1420]};
/** Pip, the series' recurring companion, cameo on the right sidewalk */
export const PIP = {x: 7.3, z: -33, yaw: -N - 0.5, puffs: schedule('pip', 130)};

/** walker position on the crowd clock (wraps along the street) */
export const citPos = (c: Cit, t: number): [number, number] => {
  if (!c.v) return [c.x, c.z];
  const span = 140, z0 = -110;
  const z = c.z + c.v * t;
  return [c.x, ((((z - z0) % span) + span) % span) + z0];
};

/** right-arm raise for a puff schedule: lift, inhale at the mouth, drop after the exhale */
export const raiseAt = (puffs: number[], t: number) => {
  let r = 0;
  for (const p of puffs) {
    if (t < p - 50 || t > p + 30) continue;
    const up = Math.min(1, Math.max(0, (t - (p - 48)) / 20));
    const down = 1 - Math.min(1, Math.max(0, (t - (p + 4)) / 22));
    r = Math.max(r, Math.min(up, down));
  }
  return r * r * (3 - 2 * r);
};
