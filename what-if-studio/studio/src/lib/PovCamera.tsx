import React, {useLayoutEffect} from 'react';
import * as THREE from 'three';
import {useThree} from '@react-three/fiber';
import {spring} from 'remotion';
import {Key, smooth, smoothNoise} from './anim';

export type PovSpec = {
  /** x,z waypoints of the path (y comes from the ground) */
  path: [number, number][];
  /** frame -> progress along path (0..1) */
  u: Key[];
  yaw: Key[];
  pitch: Key[];
  fov: Key[];
  /** metres per second above which the walk bob turns into a run */
  eye: number;
  tension: Key[];
  impacts: {frame: number; amp: number}[];
  /** keyed dolly-zoom strength (0 = off, 1 = full compensation) */
  dolly?: Key[];
  /** altitude above the ground in metres (zero-g / falling episodes) */
  lift?: Key[];
  /** 0..1 how weightless the body is: kills the walk bob, adds slow drifting sway + roll */
  float?: Key[];
  /** extra roll in radians (tumbling) */
  roll?: Key[];
};

export type Pose = {
  pos: THREE.Vector3; quat: THREE.Quaternion; fov: number;
  speed: number; phase: number; yaw: number; shock: number; heading: THREE.Vector3;
};

const curves = new WeakMap<PovSpec, {c: THREE.CatmullRomCurve3; len: number}>();
const curveOf = (s: PovSpec) => {
  let e = curves.get(s);
  if (!e) {
    const c = new THREE.CatmullRomCurve3(s.path.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.5);
    e = {c, len: c.getLength()};
    curves.set(s, e);
  }
  return e;
};

export const pathPoint = (s: PovSpec, u: number) => curveOf(s).c.getPoint(Math.min(1, Math.max(0, u)));

/** Pure function: full POV pose for a frame (walk bob + handheld + head + impact shakes + dolly zoom). */
export const computePose = (
  frame: number, fps: number, s: PovSpec, ground: (x: number, z: number) => number,
): Pose => {
  const {c, len} = curveOf(s);
  const u = smooth(frame, s.u);
  const p = c.getPoint(Math.min(1, Math.max(0, u)));
  const u1 = smooth(frame - 1, s.u);
  const speed = Math.abs(u - u1) * len * fps; // m/s
  const phase = u * len / 0.75 * Math.PI; // one step per 0.75 m
  const tension = smooth(frame, s.tension);

  const fl = s.float ? smooth(frame, s.float) : 0;
  const moving = Math.min(1, speed / 1.2) * (1 - fl);
  const run = Math.min(1, speed / 7);
  const bobAmp = moving * (0.045 + run * 0.1);
  const bob = Math.abs(Math.sin(phase)) * bobAmp;
  const sway = Math.sin(phase) * bobAmp * 0.6;
  const roll0 = Math.sin(phase) * moving * (0.008 + run * 0.02);

  const hh = 0.004 * (1 + tension * 3.5);
  const nYaw = smoothNoise('hy', frame / 9) * hh + smoothNoise('hy2', frame / 3) * hh * 0.25;
  const nPit = smoothNoise('hp', frame / 9) * hh + smoothNoise('hp2', frame / 3) * hh * 0.25;
  const nRol = smoothNoise('hr', frame / 11) * hh * 0.8;

  let shock = 0;
  for (const im of s.impacts) {
    const k = frame - im.frame;
    if (k >= 0 && k < 90) {
      shock += im.amp * spring({frame: k, fps, from: 1, to: 0, config: {damping: 6, stiffness: 150}});
    }
  }

  const yaw = smooth(frame, s.yaw) + nYaw + sway * 0.02;
  const pitch = smooth(frame, s.pitch) + nPit + shock * 0.09;
  const roll = roll0 + nRol + shock * 0.05 + (s.roll ? smooth(frame, s.roll) : 0) + Math.sin(frame * 0.017) * 0.05 * fl;
  const fov = smooth(frame, s.fov);

  const fwd = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  const dolly = s.dolly ? smooth(frame, s.dolly) : 0;
  const dz = -((Math.tan((35 * Math.PI) / 180) / Math.tan((fov / 2) * (Math.PI / 180))) - 1) * 10 * dolly;
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);

  const pos = new THREE.Vector3(p.x, 0, p.z).addScaledVector(fwd, dz).addScaledVector(right, sway);
  pos.y = ground(pos.x, pos.z) + s.eye + bob + shock * 0.12 + (s.lift ? smooth(frame, s.lift) : 0)
    + Math.sin(frame * 0.021) * 0.3 * fl;
  pos.addScaledVector(right, Math.sin(frame * 0.013 + 1) * 0.4 * fl);

  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const m = new THREE.Matrix4().lookAt(pos, pos.clone().add(dir), new THREE.Vector3(0, 1, 0));
  const quat = new THREE.Quaternion().setFromRotationMatrix(m);
  quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
  return {pos, quat, fov, speed, phase, yaw, shock, heading: fwd};
};

export const PovCamera: React.FC<{pose: Pose}> = ({pose}) => {
  const camera = useThree((st) => st.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    camera.position.copy(pose.pos);
    camera.quaternion.copy(pose.quat);
    camera.fov = pose.fov;
    camera.near = 0.1;
    camera.far = 2500;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  });
  return null;
};
