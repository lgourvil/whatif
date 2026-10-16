import {HandKey} from '../../lib/Hands';

type V = [number, number, number];
/** Where the device sits in the right palm frame (fingers +y, palm +z, thumb +x). */
export const VAPE_IN_HAND = {pos: [0.034, 0.078, 0.028] as V, rot: [0, 0, -Math.PI / 2] as V};

// right hand poses (camera space: x right, y up, -z forward)
const SHOW = {pos: [0.066, -0.07, -0.31] as V, fingers: [-1, 0.05, -0.32] as V, palm: [0.3, 0.05, 1] as V, pose: 'show' as const, wrist: 0.35, dev: 0.75};
const CLOSE = {...SHOW, pos: [0.058, -0.045, -0.235] as V};
// device at the lips: below the lens, mouthpiece tipped toward the camera
const MOUTH = {pos: [0.07, -0.175, -0.15] as V, fingers: [-1, 0.25, -0.1] as V, palm: [0.1, -0.75, 1] as V, pose: 'mouth' as const, wrist: 0.2, dev: 0.9};
// carried while walking: low right, top of the device peeking in
const LOW = {pos: [0.15, -0.33, -0.36] as V, fingers: [-1, 0.3, -0.5] as V, palm: [0.25, -0.1, 1] as V, pose: 'show' as const, wrist: 0.3, dev: 0.7};
const OFF_R = {...LOW, pos: [0.2, -0.75, -0.25] as V};

export const HAND_R: HandKey[] = [
  {f: 0, ...SHOW}, {f: 30, ...SHOW},
  {f: 60, ...MOUTH}, {f: 84, ...MOUTH},
  {f: 118, ...SHOW}, {f: 172, ...SHOW},
  {f: 215, ...LOW}, {f: 1035, ...LOW},
  {f: 1080, ...SHOW}, {f: 1132, ...SHOW},
  {f: 1160, ...MOUTH}, {f: 1192, ...MOUTH},
  {f: 1232, ...LOW}, {f: 1360, ...LOW},
  {f: 1405, ...CLOSE}, {f: 1560, ...CLOSE},
  {f: 1610, ...SHOW}, {f: 1640, ...LOW}, {f: 1780, ...LOW},
  {f: 1830, ...SHOW}, {f: 1935, ...SHOW},
  {f: 1972, ...OFF_R}, {f: 2008, ...OFF_R},
  {f: 2060, ...SHOW}, {f: 2250, ...SHOW},
];

// left hand: out of frame except to catch the rain and to wave the fog away
const OFF_L = {pos: [-0.22, -0.75, -0.3] as V, fingers: [0.2, 0.4, -1] as V, palm: [0, 1, 0] as V, pose: 'relaxed' as const, wrist: 0, dev: 0};
const CATCH = {pos: [-0.045, -0.14, -0.34] as V, fingers: [0.25, 0.35, -1] as V, palm: [0.1, 1, 0.25] as V, pose: 'cup' as const, wrist: 0.1, dev: 0};
const WAVE_A = {pos: [-0.16, -0.06, -0.38] as V, fingers: [0.35, 1, -0.3] as V, palm: [0.6, 0, -1] as V, pose: 'open' as const, wrist: 0.2, dev: 0.2};
const WAVE_B = {pos: [0.05, -0.04, -0.38] as V, fingers: [-0.25, 1, -0.3] as V, palm: [0.9, 0, -0.6] as V, pose: 'open' as const, wrist: 0.2, dev: 0.2};

export const HAND_L: HandKey[] = [
  {f: 0, ...OFF_L}, {f: 815, ...OFF_L},
  {f: 860, ...CATCH}, {f: 1000, ...CATCH},
  {f: 1045, ...OFF_L}, {f: 1250, ...OFF_L},
  {f: 1272, ...WAVE_A}, {f: 1294, ...WAVE_B}, {f: 1316, ...WAVE_A}, {f: 1338, ...WAVE_B},
  {f: 1372, ...OFF_L}, {f: 2250, ...OFF_L},
];
