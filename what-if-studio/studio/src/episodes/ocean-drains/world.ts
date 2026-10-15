import {PovSpec, pathPoint} from '../../lib/PovCamera';
import {Key, smoothstep} from '../../lib/anim';
import timeline from './timeline.json';

export const TL = timeline;
export const DURATION = timeline.durationInFrames;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const base = (z: number) => (z > 4 ? 1.2 + (z - 4) * 0.05 : 1.2 + (z - 4) * 0.1);

/** Terrain height: beach sloping into the sea, dunes, canyon walls on the sides, flat ruin platform, deep trench. */
export const groundH = (x: number, z: number): number => {
  let h = base(z);
  const amp = 0.25 + Math.min(1, Math.max(0, (4 - z) / 100)) * 0.9;
  h += (Math.sin(x * 0.07 + z * 0.05) * 0.9 + Math.sin(x * 0.19 - z * 0.13) * 0.4 + Math.sin(z * 0.11 + 1.3) * 0.5) * amp;
  const w = smoothstep(46, 22, Math.abs(x)) * smoothstep(-100, -114, z) * smoothstep(-150, -138, z);
  h = lerp(h, -11, w);
  const side = Math.max(0, (Math.abs(x) - 95) / 50);
  h += side * side * 30;
  return Math.max(h, -16);
};

export const PATH: [number, number][] = [
  [0, 12], [0, 6], [2, -10], [-3, -40], [0, -75], [4, -105], [0, -118], [-2, -80], [3, -40], [0, -5], [0, 12],
];

export const SPEC: PovSpec = {
  path: PATH,
  eye: 1.7,
  u: [[0, 0], [100, 0], [240, 0.1], [520, 0.25], [690, 0.38], [900, 0.48], [1110, 0.55], [1380, 0.6], [1620, 0.6], [1800, 0.85], [1950, 0.96], [1990, 1.0], [2250, 1.0]],
  yaw: [[0, 0], [60, 0], [130, 0.12], [240, 0.5], [330, 0], [500, -0.4], [650, 0], [760, 0.3], [900, 0], [1110, 0], [1180, 0.05], [1270, 0.25], [1380, 0.2], [1440, 0], [1560, 0], [1620, 3.14], [1780, 3.14], [1815, 0.8], [1870, 0.8], [1910, 3.14], [1962, 3.0], [1990, 3.14], [2000, 0], [2250, 0]],
  pitch: [[0, 0.03], [60, -0.55], [130, -0.05], [240, 0], [500, -0.2], [650, 0], [760, 0.12], [900, -0.1], [1110, 0], [1180, 0.2], [1270, 0.78], [1380, 0.82], [1440, 0.02], [1560, 0.02], [1620, 0], [1780, 0], [1815, 0.12], [1870, 0.12], [1910, 0], [1962, 0.1], [2000, 0.03], [2250, 0.03]],
  fov: [[0, 70], [1210, 70], [1290, 45], [1350, 45], [1420, 70], [1560, 70], [1640, 82], [1990, 86], [2000, 70], [2250, 70]],
  dolly: [[0, 0], [1210, 0], [1290, 1], [1350, 1], [1420, 0], [2250, 0]],
  tension: timeline.tension as Key[],
  impacts: timeline.impacts,
};

export const WATER: Key[] = [[0, 0], [90, -2.2], [300, -5], [700, -10], [1100, -14], [1990, -14], [2000, 0], [2250, 0]];
export const MOOD: Key[] = [[0, 0], [500, 0.15], [800, 1], [1350, 1], [1480, 2], [1990, 2], [2010, 0], [2250, 0]];
export const SUN: Key[] = [[0, 0.12], [400, 0.06], [700, -0.25], [1000, -0.5], [2000, -0.4], [2020, 0.12], [2250, 0.12]];
export const MOON: Key[] = [[0, -0.4], [600, -0.3], [900, 0.35], [1250, 0.75], [1990, 0.85], [2020, -0.4], [2250, -0.4]];
export const MOON_SCALE: Key[] = [[0, 1], [1100, 1], [1250, 2.2], [1480, 3.4], [1990, 4.0], [2010, 1], [2250, 1]];
export const HANDS: Key[] = [[0, 0], [40, 0], [75, 1], [170, 1], [220, 0.25], [1230, 0.25], [1290, 1], [1420, 0.5], [1600, 0.5], [1640, 1], [1990, 1], [2000, 0], [2250, 0]];
export const POINT: Key[] = [[0, 0], [1260, 0], [1290, 1], [1420, 1], [1450, 0], [1500, 0], [1530, 1], [1600, 1], [1620, 0], [2250, 0]];

export const IMPACT_FRAME = 1962;
const camAtImpact = pathPoint(SPEC, 0.955);
/** Z of the front of the returning wave. */
export const waveZ = (f: number) => camAtImpact.z + (f - IMPACT_FRAME) * 0.72 + 4;
