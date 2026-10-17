import * as THREE from 'three';
import {PovSpec} from '../../lib/PovCamera';
import {Key, smooth} from '../../lib/anim';
import timeline from './timeline.json';

export const TL = timeline;
export const DURATION = timeline.durationInFrames;
export const LOOP = timeline.loopFlash;

/** World time: the whole world rewinds to its frame-0 state behind the loop flash. */
export const sceneFrame = (f: number) => (f < LOOP ? f : (f - LOOP) * 0.15);

/** Price at a frame (step function, one step per 50 cents). */
export const priceAt = (f: number) => {
  let p = TL.prices[0][1];
  for (const [fr, v] of TL.prices) if (f >= fr) p = v;
  return p;
};
export const priceIndexAt = (f: number) => TL.prices.filter(([fr]) => f >= fr).length - 1;

// ---- layout (metres). -Z = "north" (toward the road), +X = east ----
export const CAR_N = new THREE.Vector3(1.35, 0, -2.0); // narrator's car (filler flap on its -X side)
export const FILLER = new THREE.Vector3(0.47, 0.86, -0.915);
export const PUMP1 = new THREE.Vector3(-0.95, 0, -0.9);
export const TOTEM = new THREE.Vector3(6.5, 0, -15.5);
export const TOTEM_YAW = Math.atan2(-6.5, 15.5);
export const ROUNDABOUT = new THREE.Vector3(-24, 0, -24);
export const ROAD_Z = -24;
export const PALLET_FIRE = new THREE.Vector3(-16.5, 0, -21.5);
export const CAR_FIRE = new THREE.Vector3(3, 0, -22.4);
export const POLICE = new THREE.Vector3(-23, 0, -44);

export const SPEC: PovSpec = {
  path: [[0, 0], [0.04, -2.5], [0.1, -4.7], [-1.2, -8.5], [-4.2, -12.4], [-7.4, -16.0], [-6.3, -14.6], [-5.6, -13.6]],
  eye: 1.66,
  u: [[0, 0], [990, 0], [1080, 0.17], [1200, 0.45], [1330, 0.714], [1600, 0.714], [1720, 0.86], [1800, 0.93], [2000, 0.96], [2380, 0.96]],
  yaw: [
    [0, 0.32], [40, 0.33], [110, 0.5], [150, 0.47], [205, -0.15], [255, -0.72], [400, -0.7], [470, 0.36], [540, 0.38],
    [600, 0.05], [660, -0.25], [705, -0.2], [760, 0.06], [900, 0.04], [945, 0.0], [990, -0.08], [1060, -0.42], [1110, -0.62],
    [1200, -0.82], [1290, -0.95], [1330, -0.9], [1395, 1.45], [1420, 1.5], [1470, 1.15], [1530, 0.9], [1580, -0.5], [1650, -0.58],
    [1700, -0.45], [1730, 0.3], [1800, 1.0], [1840, 1.05], [1890, 1.5], [2050, 1.55], [2172, 1.56], [2182, 1.18], [2215, 1.0],
    [2300, 0.85], [2335, 1.5], [2384, 1.55],
  ],
  pitch: [
    [0, 0.02], [40, -0.02], [110, -0.42], [150, -0.4], [205, -0.25], [255, -0.22], [400, -0.24], [470, 0.0], [540, 0.02],
    [600, -0.02], [660, -0.04], [705, -0.1], [760, -0.42], [900, -0.36], [945, -1.0], [975, -0.9], [1010, -0.08], [1060, -0.05],
    [1290, -0.02], [1330, -0.02], [1395, 0.06], [1420, 0.08], [1470, 0.55], [1530, 0.58], [1580, 0.03], [1650, 0.04],
    [1700, -0.05], [1730, -0.32], [1800, -0.02], [1840, 0.0], [1890, 0.14], [2050, 0.13], [2172, 0.12], [2182, 0.05],
    [2215, 0.3], [2260, 0.85], [2300, 0.8], [2335, 0.14], [2384, 0.12],
  ],
  // vertical FOV: 24 mm equivalent on 9:16 ≈ 76°, widens in the panic, dolly zoom before 10 €
  fov: [[0, 76], [1500, 76], [1680, 82], [2100, 82], [2172, 58], [2178, 92], [2330, 92], [2384, 80]],
  dolly: [[0, 0], [2100, 0], [2172, 0.6], [2178, 0], [2460, 0]],
  tension: timeline.tension as Key[],
  impacts: timeline.impacts,
};

/** Sun elevation / azimuth (deg) — golden hour time-lapsing into night. */
export const SUN_ELEV: Key[] = [[0, 13], [990, 10], [1290, 5], [1420, 1.5], [1500, -2.5], [1560, -6], [1700, -11], [2400, -11]];
export const SUN_AZ = 64;

/** Light level (drives auto-exposure target); 1 = golden hour. */
export const LIGHT: Key[] = [[0, 1], [990, 0.9], [1290, 0.6], [1420, 0.32], [1500, 0.12], [1580, 0.06], [1700, 0.05], [1760, 0.08], [2175, 0.14], [2250, 0.12]];

export const FOG: Key[] = [[0, 0.0032], [990, 0.0045], [1420, 0.008], [1640, 0.014], [1700, 0.022], [1780, 0.012], [1900, 0.012], [2175, 0.016], [2260, 0.022], [2384, 0.02]];

export const GRADE_TRACK: [number, 'goldenCalm' | 'coolUnease' | 'blueNight' | 'sodiumRiot' | 'warSmoke'][] = [
  [0, 'goldenCalm'], [700, 'goldenCalm'], [1100, 'coolUnease'], [1420, 'coolUnease'], [1560, 'blueNight'], [1760, 'blueNight'],
  [1900, 'sodiumRiot'], [2175, 'sodiumRiot'], [2230, 'warSmoke'], [2384, 'warSmoke'],
];

/** Narrator body turns with the head but lags (and the vest is on after ~930). */
export const VEST_ON = 930;

export const keys = (f: number, k: Key[]) => smooth(f, k);
