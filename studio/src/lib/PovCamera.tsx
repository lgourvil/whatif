import { useThree } from "@react-three/fiber";
import React, { useLayoutEffect } from "react";
import { CatmullRomCurve3, PerspectiveCamera, Vector3 } from "three";
import { fbm1, keyed } from "./noise";

export type V3 = [number, number, number];
export type CamKey = { f: number; pos: V3; look: V3 };

// Smooth path through camera keys: positions AND look targets each ride a centripetal
// Catmull-Rom spline; frame → curve parameter is piecewise-linear with easing at both ends.
export const makePath = (keys: CamKey[]) => {
  const pc = new CatmullRomCurve3(keys.map((k) => new Vector3(...k.pos)), false, "centripetal");
  const lc = new CatmullRomCurve3(keys.map((k) => new Vector3(...k.look)), false, "centripetal");
  const n = keys.length;
  const first = keys[0].f;
  const last = keys[n - 1].f;
  return (frame: number) => {
    const f = Math.min(last, Math.max(first, frame));
    let k = 0;
    while (k < n - 2 && f > keys[k + 1].f) k++;
    const span = Math.max(1e-6, keys[k + 1].f - keys[k].f);
    let t = (f - keys[k].f) / span;
    // ease only at the very start and end of the whole path
    if (k === 0) t = t * t * (3 - 2 * t) * 0.5 + t * 0.5;
    if (k === n - 2) t = 1 - (1 - t) * (1 - t) * 0.5 - (1 - t) * 0.5;
    const u = (k + t) / (n - 1);
    return { pos: pc.getPoint(u), look: lc.getPoint(u) };
  };
};

export type Impact = { frame: number; strength: number };

type Props = {
  frame: number;
  pos: Vector3;
  look: Vector3;
  walk?: number; // 0..1 walk-bob amount
  stepPhase?: number; // steps elapsed (float); one bob per step
  tension?: number; // 0..1 → handheld shake + FOV
  head?: { yaw: number; pitch: number }; // radians, additive "head turn"
  impacts?: Impact[];
  fov?: number; // base FOV (deg); tension adds up to +fovGain
  fovGain?: number;
  roll?: number;
  seed?: string;
};

const fwd = new Vector3();
const right = new Vector3();
const up = new Vector3(0, 1, 0);
const p = new Vector3();

// Damped spring "kick" for impacts: closed form, frame-addressable.
export const impactShake = (frame: number, impacts: Impact[]) => {
  let v = 0;
  for (const im of impacts) {
    const d = frame - im.frame;
    if (d < 0 || d > 45) continue;
    v += im.strength * Math.exp(-d / 7) * Math.sin(d * 1.4);
  }
  return v;
};

export const PovCamera: React.FC<Props> = ({
  frame, pos, look, walk = 0, stepPhase = 0, tension = 0, head = { yaw: 0, pitch: 0 },
  impacts = [], fov = 70, fovGain = 15, roll = 0, seed = "pov",
}) => {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  useLayoutEffect(() => {
    // walk: vertical bob each step + lateral sway every stride + a hint of roll
    const ph = stepPhase * Math.PI;
    const bobY = -Math.abs(Math.sin(ph)) * 0.07 * walk + 0.035 * walk;
    const swayX = Math.sin(ph) * 0.035 * walk;
    const walkRoll = Math.sin(ph) * 0.012 * walk;

    // handheld: smoothed noise, amplitude rises with tension
    const t = frame / 30;
    const amp = 0.004 + tension * 0.018;
    const hy = fbm1(t * 1.3, `${seed}y`) * amp;
    const hp = fbm1(t * 1.1, `${seed}p`) * amp * 0.8;
    const hr = fbm1(t * 0.9, `${seed}r`) * amp * 0.6;

    const kick = impactShake(frame, impacts);

    fwd.copy(look).sub(pos).normalize();
    right.crossVectors(fwd, up).normalize();
    p.copy(pos).addScaledVector(right, swayX);
    p.y += bobY + kick * 0.06;
    fwd.applyAxisAngle(up, head.yaw + hy);
    right.crossVectors(fwd, up).normalize();
    fwd.applyAxisAngle(right, head.pitch + hp + kick * 0.03);

    camera.position.copy(p);
    camera.up.set(0, 1, 0);
    camera.lookAt(p.clone().add(fwd));
    camera.rotateZ(roll + walkRoll + hr + kick * 0.01);
    camera.fov = fov + tension * fovGain;
    camera.near = 0.05;
    camera.far = 6000;
    camera.updateProjectionMatrix();
  });
  return null;
};

export { keyed };
