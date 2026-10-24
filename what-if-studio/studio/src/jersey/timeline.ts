import {Key, smooth, smoothNoise, smoothstep} from '../lib/anim';

export const FPS = 60;
export const DURATION_S = 9.5;
const TAU = Math.PI * 2;

/** Beats (seconds). Shared with the soundtrack. */
export const BEATS = {
  flash: 0.25,
  spinStart: 0.9,
  spinStop: 2.15,
  zoomLogo: 3.0,
  zoomSponsor: 4.05,
  turnBack: 5.3,
  backStop: 6.2,
  recenter: 7.25,
  endFlash: 9.0,
};

// Jersey yaw (rad). 0 = front faces camera, PI = back.
const YAW: Key[] = [
  [0, -0.55], [0.9, -0.28],
  // fast 360 with a brutal brake onto the front
  [1.08, 0.25], [1.95, 5.75], [2.15, 6.2], [2.9, TAU],
  [3.6, TAU - 0.08], [4.4, TAU + 0.06], [5.3, TAU],
  // fluid turn to the back, hard stop with a tiny settle
  [5.95, TAU + 2.75], [6.2, TAU + Math.PI + 0.035], [6.45, TAU + Math.PI],
  [7.25, TAU + Math.PI - 0.04],
  // recentre: slow turn back to a hero three-quarter front
  [8.9, 2 * TAU - 0.32], [9.5, 2 * TAU - 0.2],
];
export const yaw = (t: number) => smooth(t, YAW);

type V3 = [number, number, number];
const vkeys = (keys: [number, V3][]) => [0, 1, 2].map((i) => keys.map(([t, v]) => [t, v[i]] as Key));
const vsmooth = (t: number, k: Key[][]): V3 => [smooth(t, k[0]), smooth(t, k[1]), smooth(t, k[2])];

// Logo crest ~ uv(0.50, 0.71), sponsor ~ uv(0.51, 0.59), number ~ uv(0.5, 0.64) on a 2-unit-tall jersey.
const CAM = vkeys([
  [0, [0, 0.05, 8.2]], [0.9, [0, 0.05, 6.1]],
  [1.5, [0.25, -0.1, 5.6]], [2.15, [0, 0.05, 5.5]], [2.9, [0, 0.0, 5.3]],
  [3.0, [0, 0.05, 5.1]], [3.3, [0.32, 0.5, 1.75]], [4.0, [0.18, 0.47, 1.45]],
  [4.25, [-0.45, 0.2, 1.9]], [5.0, [0.35, 0.17, 1.8]],
  [5.35, [0, 0.05, 5.4]], [6.2, [0, 0.2, 4.3]], [7.25, [0, 0.22, 3.9]],
  [8.6, [0.15, 0.05, 6.0]], [9.5, [0, 0.05, 5.7]],
]);
const TGT = vkeys([
  [0, [0, 0, 0]], [2.9, [0, 0, 0]],
  [3.0, [0, 0.05, 0]], [3.3, [0, 0.42, 0.3]], [4.0, [0.02, 0.42, 0.3]],
  [4.25, [-0.25, 0.18, 0.3]], [5.0, [0.25, 0.18, 0.3]],
  [5.35, [0, 0, 0]], [6.2, [0, 0.22, 0]], [7.25, [0, 0.24, 0]],
  [8.6, [0, 0, 0]], [9.5, [0, 0, 0]],
]);
const ROLL: Key[] = [[0, 0], [0.9, 0], [1.3, -0.07], [1.8, 0.05], [2.2, 0], [3.0, 0], [3.3, 0.04], [4.0, 0.02], [4.25, -0.03], [5.0, 0.02], [5.35, 0], [5.9, -0.025], [6.3, 0], [9.5, 0]];
const FOV: Key[] = [[0, 40], [0.9, 38], [1.4, 44], [2.2, 38], [3.0, 38], [3.3, 34], [5.0, 34], [5.35, 38], [9.5, 38]];

const IMPACTS: [number, number][] = [[BEATS.flash, 0.09], [BEATS.spinStop, 0.05], [3.3, 0.02], [BEATS.backStop, 0.05], [BEATS.endFlash, 0.04]];
export const shake = (t: number) => {
  let a = 0;
  for (const [t0, amp] of IMPACTS) if (t >= t0) a += amp * Math.exp(-(t - t0) * 9);
  return a;
};

export const camera = (t: number) => {
  const s = shake(t);
  const p = vsmooth(t, CAM);
  const q = vsmooth(t, TGT);
  // close-ups get a slower, floating handheld drift
  const drift = 0.012 * smoothstep(2.9, 3.4, t) * (1 - smoothstep(5.0, 5.4, t));
  p[0] += smoothNoise('cx', t * 30) * s + smoothNoise('dx', t * 0.8) * drift;
  p[1] += smoothNoise('cy', t * 30) * s + smoothNoise('dy', t * 0.7) * drift;
  return {pos: p, target: q, roll: smooth(t, ROLL) + smoothNoise('cr', t * 26) * s * 0.4, fov: smooth(t, FOV)};
};

/** Jersey entrance: scale/z pop at the flash. */
export const entrance = (t: number) => {
  const k = smoothstep(BEATS.flash - 0.05, BEATS.flash + 0.55, t);
  const pop = t > BEATS.flash ? Math.exp(-(t - BEATS.flash) * 7) * Math.sin((t - BEATS.flash) * 22) * 0.025 : 0;
  return {scale: 0.86 + 0.14 * k + pop, z: -1.4 * (1 - k), visible: t >= BEATS.flash - 0.02};
};

export const flash = (t: number) => {
  const f = (t0: number, a: number, d: number) => (t >= t0 ? a * Math.exp(-(t - t0) / d) : 0);
  return Math.min(1, f(BEATS.flash, 1, 0.07) + f(BEATS.spinStop, 0.18, 0.05) + f(BEATS.backStop, 0.22, 0.06) + f(BEATS.endFlash, 0.95, 0.09));
};
export const fadeOut = (t: number) => smoothstep(BEATS.endFlash + 0.05, DURATION_S - 0.05, t);
export const shock = (t: number) => {
  const dt = t - BEATS.flash;
  if (dt < 0 || dt > 0.9) return {r: 0, a: 0};
  return {r: 0.05 + dt * 1.6, a: Math.exp(-dt * 3.2)};
};

/** Glow burst behind the jersey (opening + back reveal). */
export const burst = (t: number) => {
  const f = (t0: number, a: number, d: number) => (t >= t0 ? a * Math.exp(-(t - t0) / d) : 0);
  return f(BEATS.flash, 9, 0.18) + f(BEATS.backStop - 0.03, 2.6, 0.22) + f(BEATS.endFlash, 4, 0.2) + 0.05 * smoothstep(0.3, 1.2, t);
};

/** Light levels and the travelling specular sweep. */
export const lights = (t: number) => {
  const on = smoothstep(BEATS.flash - 0.02, BEATS.flash + 0.02, t);
  const key = on * smoothstep(BEATS.flash, 1.1, t);
  const rim = on * (1 + 1.4 * Math.exp(-Math.max(0, t - BEATS.flash) * 4));
  const sweepX = smooth(t, [[0, -3], [0.4, -3], [1.0, 3], [3.05, -1.6], [3.9, 1.6], [4.1, -1.8], [5.0, 1.8], [5.3, -3], [6.15, -2], [7.1, 2.5], [8.6, -2.5], [9.5, 2.5]]);
  const sweep = on * (0.4 + smoothstep(2.95, 3.2, t) * (1 - smoothstep(5.0, 5.3, t)) * 1.2 + smoothstep(6.1, 6.3, t) * (1 - smoothstep(7.2, 7.6, t)) * 0.8);
  return {key, rim, sweep, sweepX};
};

/** Motion-blur shutter, in frames (wider during the spin for a deliberate streak). */
export const shutter = (t: number) => 0.55 + 1.4 * smoothstep(0.95, 1.15, t) * (1 - smoothstep(1.95, 2.2, t)) + 0.6 * smoothstep(5.4, 5.6, t) * (1 - smoothstep(6.0, 6.2, t));
