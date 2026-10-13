import React from 'react';
import {spring, interpolate, Easing} from 'remotion';
import * as THREE from 'three';
import {useThree} from '@react-three/fiber';
import {smoothNoise, fbm} from './noise';

export type Key = {f: number; pos: [number, number, number]; look: [number, number, number]; fov?: number};
export type WalkSeg = {from: number; to: number; cadence: number; amp: number};
export type Impact = {frame: number; strength: number};

export type PovConfig = {
  keys: Key[];
  walk: WalkSeg[];
  impacts: Impact[];
  fps: number;
  tension: (f: number) => number;
  /** Optional: replace camera Y by ground-following height. blend 0..1 */
  ground?: (f: number, x: number, z: number) => {y: number; blend: number};
  /** extra roll in radians (tumbling underwater, head tilt) */
  roll?: (f: number) => number;
};

export type Pose = {pos: THREE.Vector3; quat: THREE.Quaternion; fov: number; shake: number};

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Catmull-Rom path over keyframes with eased local time per segment. */
const buildCurves = (keys: Key[]) => {
  const pos = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.pos)), false, 'centripetal');
  const look = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.look)), false, 'centripetal');
  return {pos, look};
};
const curveCache = new WeakMap<Key[], ReturnType<typeof buildCurves>>();

const stepPhase = (f: number, walk: WalkSeg[]) => walk.reduce((acc, w) => acc + Math.max(0, Math.min(f, w.to) - w.from) / w.cadence, 0);
const walkAmp = (f: number, walk: WalkSeg[]) => {
  let a = 0;
  for (const w of walk) {
    const e = interpolate(f, [w.from, w.from + 18, w.to - 18, w.to], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    a = Math.max(a, e * w.amp);
  }
  return a;
};

/** Pure function: pose of the subjective camera at a frame (walk bob + handheld + head motion + spring impacts). */
export const povPose = (frame: number, cfg: PovConfig): Pose => {
  let c = curveCache.get(cfg.keys);
  if (!c) {
    c = buildCurves(cfg.keys);
    curveCache.set(cfg.keys, c);
  }
  const keys = cfg.keys;
  let i = 0;
  while (i < keys.length - 2 && frame >= keys[i + 1].f) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const lt = Math.min(1, Math.max(0, (frame - k0.f) / (k1.f - k0.f)));
  // ease only on slow segments; keep continuity of speed by blending between linear and smoothstep
  const e = lt * 0.55 + smooth(lt) * 0.45;
  const u = (i + e) / (keys.length - 1);
  const pos = c.pos.getPoint(Math.min(1, u));
  const look = c.look.getPoint(Math.min(1, u));
  const fov0 = k0.fov ?? 70;
  const fov1 = k1.fov ?? 70;
  let fov = fov0 + (fov1 - fov0) * smooth(lt);

  if (cfg.ground) {
    const g = cfg.ground(frame, pos.x, pos.z);
    pos.y = pos.y + (g.y - pos.y) * g.blend;
  }

  const ten = cfg.tension(frame);
  const phase = stepPhase(frame, cfg.walk);
  const amp = walkAmp(frame, cfg.walk);
  // walking sway: vertical bounce at step rate + roll/lateral at half rate
  const bob = Math.abs(Math.sin(phase * Math.PI)) * amp;
  const sway = Math.sin(phase * Math.PI) * amp * 0.45;
  const breath = Math.sin(frame / (cfg.fps * (1.6 - ten * 0.8)) * Math.PI * 2) * (0.012 + ten * 0.02);
  pos.y += bob + breath;

  const hand = 0.25 + ten * 1.1;
  const hx = fbm('hx', frame / 9) * 0.012 * hand;
  const hy = fbm('hy', frame / 9) * 0.012 * hand;
  const hz = fbm('hz', frame / 11) * 0.02 * hand;

  // impacts: damped spring shake
  let shake = 0;
  for (const im of cfg.impacts) {
    if (frame >= im.frame) {
      const s = spring({frame: frame - im.frame, fps: cfg.fps, config: {damping: 6, stiffness: 160, mass: 0.6}, from: 1, to: 0, durationInFrames: 40});
      shake += s * im.strength * Math.sin((frame - im.frame) * 1.7);
    }
  }
  pos.x += hx + shake * 0.12 * Math.sin(frame * 0.9);
  pos.y += hy + shake * 0.1;
  const target = look.clone().add(new THREE.Vector3(smoothNoise('lx', frame / 20) * 0.05 * hand, smoothNoise('ly', frame / 20) * 0.04 * hand, 0));

  const m = new THREE.Matrix4().lookAt(pos, target, new THREE.Vector3(0, 1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  const roll = sway * 0.35 + hz + shake * 0.05 + (cfg.roll ? cfg.roll(frame) : 0);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));

  fov += ten * 10 + Math.abs(shake) * 4;
  return {pos, quat: q, fov, shake};
};

/** Applies a pose to the active camera. Children (e.g. hands) are rendered in camera space. */
export const PovRig: React.FC<{pose: Pose; children?: React.ReactNode}> = ({pose, children}) => {
  const {camera} = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  cam.position.copy(pose.pos);
  cam.quaternion.copy(pose.quat);
  cam.fov = pose.fov;
  cam.near = 0.1;
  cam.far = 1600;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return (
    <group position={pose.pos} quaternion={pose.quat}>
      {children}
    </group>
  );
};

export {Easing};
