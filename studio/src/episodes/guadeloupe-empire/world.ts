import { Vector3 } from "three";
import { keyed } from "../../lib/noise";
import { makePath } from "../../lib/PovCamera";
import timeline from "./timeline.json";

export const TL = timeline;
export const FPS = timeline.fps;
export const DURATION = timeline.durationInFrames;
export const LOOP = DURATION; // every periodic motion uses harmonics of this

// Phase switches (hidden under the two white-outs)
export const SPACE_IN = 1700;
export const SPACE_OUT = 2240;

// World-state frame: after the final dive the world is back at its frame-0 state.
export const worldFrame = (f: number) => (f >= SPACE_OUT ? 0 : f);
export const inSpace = (f: number) => f >= SPACE_IN && f < SPACE_OUT;

export const W = (f: number) => (f / LOOP) * Math.PI * 2; // loop phase

// ---- player boat ---------------------------------------------------------
export const SAIL_START = 280;
export const boatZ = (wf: number) =>
  keyed(wf, [
    [SAIL_START, 0], [420, -55], [600, -170], [780, -330], [1000, -470], [1200, -640], [1420, -900], [1600, -1110], [1700, -1150],
  ]);
export const boatX = (wf: number) => keyed(wf, [[SAIL_START, 0], [600, -6], [900, 4], [1200, -10], [1700, -4]]);
export const boatBob = (f: number) => ({
  y: 0.14 * Math.sin(W(f) * 37) + 0.06 * Math.sin(W(f) * 53 + 1),
  roll: 0.025 * Math.sin(W(f) * 29 + 0.5),
  pitch: 0.018 * Math.sin(W(f) * 41),
});

// ---- camera --------------------------------------------------------------
export const P0: [number, number, number] = [0, 2.5, 13];
export const L0: [number, number, number] = [0, -0.6, -60];

const walkPath = makePath([
  { f: 0, pos: P0, look: L0 },
  { f: 120, pos: P0, look: L0 },
  { f: 190, pos: [0.3, 2.45, 8.2], look: [2, 0.2, -60] },
  { f: 240, pos: [0.45, 2.3, 3.6], look: [0, 0.8, -60] },
  { f: 262, pos: [0.4, 2.1, 0.2], look: [0, 1.4, -60] },
  { f: 280, pos: [0.15, 2.05, -1.4], look: [0, 1.6, -60] },
]);

// Space: globe at origin, radius 60, lat/lon centre faces +z.
export const GLOBE_R = 60;
export const spacePath = makePath([
  { f: SPACE_IN, pos: [6, 14, 102], look: [-8, 4, 0] },
  { f: 1760, pos: [4, 10, 112], look: [-6, 3, 0] },
  { f: 1840, pos: [0, 8, 290], look: [0, 0, 0] },
  { f: 1950, pos: [-16, 12, 282], look: [0, 0, 0] },
  { f: 2100, pos: [-24, 4, 175], look: [-12, -6, 0] },
  { f: SPACE_OUT, pos: [-18, -3, 78], look: [-17, -7, 0] },
]);

const endPath = makePath([
  { f: SPACE_OUT, pos: [0, 16, 30], look: [0, -4, -40] },
  { f: 2300, pos: [0, 4.5, 18], look: [0, 0.2, -60] },
  { f: 2370, pos: P0, look: L0 },
  { f: DURATION, pos: P0, look: L0 },
]);

export type CamState = {
  pos: Vector3; look: Vector3; walk: number; phase: number; yaw: number; pitch: number; fov: number; tension: number; roll: number;
};

export const tension = (f: number) => keyed(f, TL.tension as [number, number][]);

export const camAt = (f: number): CamState => {
  const t = tension(f);
  let pos: Vector3, look: Vector3;
  let walk = 0, phase = 0, roll = 0;
  if (f >= SPACE_OUT) {
    ({ pos, look } = endPath(f));
  } else if (f >= SPACE_IN) {
    ({ pos, look } = spacePath(f));
  } else if (f < SAIL_START) {
    ({ pos, look } = walkPath(f));
    walk = keyed(f, [[118, 0], [132, 1], [262, 1], [280, 0]]);
    phase = Math.max(0, f - 120) / 15; // ~2 steps/s
  } else {
    const bx = boatX(f), bz = boatZ(f);
    const b = boatBob(f);
    // rise into the clouds at the end of the armada
    const rise = keyed(f, [[1600, 0], [1700, 170]]);
    pos = new Vector3(bx + 0.15, 2.2 + b.y * 0.6 + rise, bz - 1.4);
    look = new Vector3(bx, 1.6 + rise * 1.4, bz - 60);
    roll = b.roll;
  }
  // head turns (radians; + = left) and looks up
  const yaw = keyed(f, [
    [170, 0], [195, -0.62], [235, -0.62], [255, 0], // glance right at Tonton Rémy
    [470, 0], [500, 0.5], [580, 0.5], [610, 0], // Marie-Galante (left)
    [630, 0], [655, -0.48], [700, -0.48], [715, 0], // Les Saintes (right)
    [722, 0], [742, -2.75], [778, -2.75], [796, 0], // look back: the fleet
    [1010, 0], [1040, 0.42], [1110, 0.42], [1140, 0], // Martinique (left)
    [1225, 0], [1240, 0.35], [1275, 0.35], [1295, 0], // Ti-Jo + conch
  ]);
  const pitch = keyed(f, [
    [0, -0.04], [820, -0.04], [850, 0.42], [905, 0.42], [940, 0.05], // stars + fireworks
    [1440, 0.0], [1600, 0.0], [1640, 0.75], [1700, 1.05], // look up into the clouds
    [1701, 0], [2241, 0.05], [2370, -0.04], [2400, -0.04],
  ]);
  const fov = keyed(f, [
    [0, 68], [1600, 72], [1700, 84], [1701, 62], [1760, 74], [1840, 40], [1950, 44], [2100, 58], [2240, 76], [2241, 70], [2370, 68], [2400, 68],
  ]);
  return { pos, look, walk, phase, yaw, pitch: f >= SPACE_IN && f < SPACE_OUT ? 0 : pitch, fov, tension: t, roll };
};
