import * as THREE from 'three';
import {random} from 'remotion';
import {PovSpec} from '../../lib/PovCamera';
import {Key, smoothstep} from '../../lib/anim';
import {Body, Clock} from '../../lib/ZeroG';
import timeline from './timeline.json';

export const TL = timeline;
export const DURATION = timeline.durationInFrames;
export const R = timeline.restoreFrame;
export const CLOCK: Clock = {restore: R, g: 0.06};

export const PLAZA_R = 22;
export const POND = {x: -1, z: -14, r: 6.6};

/** Gently rolling meadow, perfectly flat under the plaza and the ring road. */
export const groundH = (x: number, z: number): number => {
  const d = Math.hypot(x, z);
  const hills = Math.sin(x * 0.03) * Math.cos(z * 0.027) * 1.6 + Math.sin(x * 0.09 + z * 0.07) * 0.5 + Math.sin(z * 0.05 - x * 0.04) * 1.1;
  return hills * smoothstep(46, 70, d);
};

export const SPAWN = {x: 0, z: 8};
export const PIP = {x: 1.9, z: 1.6};

// ---- bodies -------------------------------------------------------------------
const rr = (k: string) => random(k);
const ring = (seed: string, i: number, r0: number, r1: number) => {
  const a = rr(`${seed}a${i}`) * Math.PI * 2, r = r0 + rr(`${seed}r${i}`) * (r1 - r0);
  return {x: Math.cos(a) * r, z: Math.sin(a) * r, d: r};
};
const lift = (d: number, i: string, delay = 0) => 120 + d * 2.2 + rr(`t${i}`) * 40 + delay;
const body = (x: number, z: number, s: number, t0: number, vy: number, spin = 1, yaw = 0, seed = ''): Body => ({
  x, y: groundH(x, z), z, s, yaw, t0, vy,
  spin: [(rr(`sx${seed}`) - 0.5) * 0.012 * spin, (rr(`sy${seed}`) - 0.5) * 0.02 * spin, (rr(`sz${seed}`) - 0.5) * 0.012 * spin],
});

const make = (n: number, f: (i: number) => Body | null): Body[] => {
  const a: Body[] = [];
  for (let i = 0; i < n; i++) { const b = f(i); if (b) a.push(b); }
  return a;
};

export const TREES = make(90, (i) => {
  const p = ring('tr', i, 27, 135);
  if (p.d > 33 && p.d < 45) return null; // ring road
  const s = 0.9 + rr(`trs${i}`) * 0.8;
  return body(p.x, p.z, s, lift(p.d, `tr${i}`), 0.06 + rr(`trv${i}`) * 0.1, 0.6, rr(`try${i}`) * 6, `tr${i}`);
});
export const ROCKS = make(46, (i) => {
  const p = ring('rk', i, 8, 120);
  if (Math.hypot(p.x - POND.x, p.z - POND.z) < POND.r + 2.5 || (p.d > 33 && p.d < 45)) return null;
  const s = 0.4 + rr(`rks${i}`) * rr(`rks2${i}`) * 1.8;
  return body(p.x, p.z, s, lift(p.d, `rk${i}`), 0.08 + rr(`rkv${i}`) * 0.17, 2, rr(`rky${i}`) * 6, `rk${i}`);
});
export const CRATES = make(30, (i) => {
  const p = ring('cr', i, 5, 60);
  if (Math.hypot(p.x - POND.x, p.z - POND.z) < POND.r + 3 || (p.d > 33 && p.d < 45) || Math.hypot(p.x - PIP.x, p.z - PIP.z) < 3 || Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z) < 3) return null;
  return body(p.x, p.z, 0.6 + rr(`crs${i}`) * 0.5, lift(p.d, `cr${i}`), 0.07 + rr(`crv${i}`) * 0.12, 1.4, rr(`cry${i}`) * 6, `cr${i}`);
});
export const BENCHES = make(10, (i) => {
  if (i >= 8) { // two benches right next to the player so the foreground has something to lose
    const [x, z, yw] = i === 8 ? [-4.4, 5.2, 0.5] : [4.6, 9.5, -1.2];
    return body(x, z, 1, 135 + i * 12, 0.14, 1.2, yw, `bn${i}`);
  }
  const a = (i / 8) * Math.PI * 2 + 0.2, r = 18;
  return body(Math.cos(a) * r, Math.sin(a) * r, 1, lift(r, `bn${i}`), 0.1 + rr(`bnv${i}`) * 0.08, 1.2, -a + Math.PI / 2, `bn${i}`);
});
export const LAMPS = make(8, (i) => {
  const a = (i / 8) * Math.PI * 2 + 0.6, r = 21;
  return body(Math.cos(a) * r, Math.sin(a) * r, 1, lift(r, `lp${i}`, 10), 0.08 + rr(`lpv${i}`) * 0.07, 0.8, 0, `lp${i}`);
});
export const CARS = make(7, (i) => {
  const a = (i / 7) * Math.PI * 2 + 0.3, r = 38.5;
  return body(Math.cos(a) * r, Math.sin(a) * r, 1, lift(r, `car${i}`, 40), 0.05 + rr(`carv${i}`) * 0.05, 0.9, -a, `car${i}`);
});
export const HOUSES = make(22, (i) => {
  const p = ring('hs', i, 62, 125);
  return body(p.x, p.z, 0.8 + rr(`hss${i}`) * 0.6, lift(p.d, `hs${i}`, 120), 0.04 + rr(`hsv${i}`) * 0.05, 0.5, rr(`hsy${i}`) * 6, `hs${i}`);
});
export const TUFTS = make(700, (i) => {
  const p = ring('tf', i, 3, 55);
  if (p.d < PLAZA_R && p.d > 0) { /* plaza joints grow weeds too */ }
  return body(p.x, p.z, 0.35 + rr(`tfs${i}`) * 0.5, 55 + p.d * 2.4 + rr(`tft${i}`) * 50, 0.04 + rr(`tfv${i}`) * 0.16, 4, rr(`tfy${i}`) * 6, `tf${i}`);
});
export const BLOBS = make(260, (i) => {
  const a = rr(`bba${i}`) * Math.PI * 2, r = Math.sqrt(rr(`bbr${i}`)) * (POND.r - 0.8);
  const x = POND.x + Math.cos(a) * r, z = POND.z + Math.sin(a) * r;
  const b = body(x, z, 0.35 + rr(`bbs${i}`) * 0.65, 150 + rr(`bbt${i}`) * 330, 0.05 + rr(`bbv${i}`) * 0.2, 0.5, 0, `bb${i}`);
  b.y = -0.1;
  return b;
});
export const PIP_BODY: Body = {x: PIP.x, y: 0, z: PIP.z, s: 1, yaw: 0, t0: 170, vy: 0.05, spin: [0.0032, 0, 0.0045]};

// ---- camera -------------------------------------------------------------------
const G = CLOCK.g;
const liftPre: Key[] = [[0, 0], [150, 0], [300, 5], [520, 40], [700, 95], [820, 125], [930, 160], [1150, 250], [R, 330]];
const vR = (330 - 250) / (R - 1150) * 1.05; // matches the PCHIP end slope closely enough
const yR = 330;
const tL = (vR + Math.sqrt(vR * vR + 2 * G * yR)) / G;
export const LAND = Math.round(R + tL);
const fallKeys: Key[] = [];
for (let dt = 4; dt < tL; dt += 4) fallKeys.push([R + dt, yR + vR * dt - 0.5 * G * dt * dt]);
const liftKeys: Key[] = [...liftPre, ...fallKeys, [LAND, 0], [2160, 0]];

export const SPEC: PovSpec = {
  path: [[SPAWN.x, SPAWN.z], [SPAWN.x, SPAWN.z - 3], [SPAWN.x + 1, SPAWN.z - 7]],
  eye: 1.7,
  u: [[0, 0], [150, 0], [R, 1], [LAND + 20, 1], [LAND + 62, 0], [2160, 0]],
  yaw: [[0, 0.12], [90, 0.12], [170, 0.52], [240, 0.4], [300, 0.05], [420, -0.25], [520, 0.2], [610, 0], [700, 0], [790, 0.3], [860, 0.9], [960, 1.6], [1080, 2.4], [1200, 3.0], [1300, 3.4], [1400, 3.4], [R, 3.4], [1560, 4.6], [LAND, 5.6], [LAND + 30, 5.6],
    [LAND + 60, 6.283 + 0.12], [1850, 6.283 + 0.4], [1950, 6.283 - 0.3], [2060, 6.283 + 0.12], [2160, 6.283 + 0.12]],
  pitch: [[0, -0.04], [90, -0.04], [170, 0.02], [240, -0.12], [300, -0.45], [420, -0.8], [520, -0.6], [610, 0.1], [700, 0.25], [790, 0.05], [860, -0.15], [960, -0.35], [1080, -0.1], [1200, 0.4], [1300, 0.0], [1380, -0.75], [R, -0.95], [1560, -1.25], [LAND, -1.4], [LAND + 30, -1.4],
    [LAND + 60, -0.04], [1850, 0.0], [1950, -0.3], [2060, -0.04], [2160, -0.04]],
  fov: [[0, 70], [700, 72], [1100, 76], [1300, 70], [1360, 46], [1440, 46], [R, 92], [LAND, 90], [LAND + 50, 70], [2160, 70]],
  tension: TL.tension as Key[],
  impacts: TL.impacts,
  dolly: [[0, 0], [1300, 0], [1360, 1], [1440, 1], [R, 0], [2160, 0]],
  lift: liftKeys,
  float: [[0, 0], [150, 0], [230, 1], [R + 40, 1], [LAND - 4, 0.4], [LAND, 0], [2160, 0]],
  roll: [[0, 0], [1100, 0], [1250, 0.18], [1400, 0.1], [R, 0.4], [1560, 1.8], [LAND, 3.14], [LAND + 30, 3.14], [LAND + 60, 0], [2160, 0]],
};

export const MOOD: Key[] = [[0, 0], [560, 0], [1000, 0.9], [1200, 1], [1330, 1], [R, 2], [LAND, 2], [LAND + 150, 0], [2160, 0]];
export const HANDS: Key[] = [[0, 0.95], [200, 1], [500, 0.7], [900, 0.5], [1300, 0.4], [R, 1], [LAND, 1], [LAND + 60, 0.95], [1900, 1], [2060, 0.95], [2160, 0.95]];
export const POINT: Key[] = [[0, 0.9], [150, 0.9], [260, 0], [LAND, 0], [1850, 0], [1880, 0.9], [2160, 0.9]];
export const FLASH: Key[] = [[0, 0], [715, 0], [740, 0.85], [790, 0.0], [R - 1, 0], [R, 0.45], [R + 8, 0], [LAND - 2, 0], [LAND, 1], [LAND + 60, 1], [LAND + 150, 0], [2160, 0]];
export const POND_FILL: Key[] = [[0, 1], [200, 1], [560, 0.1], [R, 0.1], [LAND, 0.2], [LAND + 60, 1], [2160, 1]];
