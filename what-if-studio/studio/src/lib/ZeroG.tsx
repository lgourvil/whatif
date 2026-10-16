import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {clamp01, smoothstep} from './anim';
import {outlineMaterial, toonProps} from './ToonMaterial';

/** One rigid thing that can lose its weight: resting transform + lift-off schedule. */
export type Body = {
  x: number; y: number; z: number; s: number; yaw: number;
  /** frame at which it starts to rise */
  t0: number;
  /** final climb speed, units per frame */
  vy: number;
  /** tumble rate (rad per "accel-frame") on x,y,z */
  spin: [number, number, number];
};
/** `restore` = frame where gravity comes back, `g` = units / frame^2 once it does. */
export type Clock = {restore: number; g: number};

const RAMP = 70;
const accel = (dt: number) => (dt <= 0 ? 0 : dt < RAMP ? (dt * dt) / (2 * RAMP) : dt - RAMP / 2);

export type BodyState = {y: number; ax: number; ay: number; az: number; landed: boolean; falling: boolean};

/** Closed-form state of a body: weightless drift before `restore`, ballistic fall + upright settle after. No accumulated simulation. */
export const bodyState = (b: Body, frame: number, c: Clock): BodyState => {
  const fe = Math.min(frame, c.restore);
  const up = b.vy * accel(fe - b.t0);
  const vR = b.vy * clamp01((fe - b.t0) / RAMP);
  let y = b.y + up;
  let k = 0;
  let landed = false;
  const falling = frame > c.restore;
  if (falling) {
    const dt = frame - c.restore;
    const yR = y;
    y = yR + vR * dt - 0.5 * c.g * dt * dt;
    const tL = (vR + Math.sqrt(vR * vR + 2 * c.g * (yR - b.y))) / c.g;
    k = tL > 0 ? clamp01(dt / tL) : 1;
    if (y <= b.y || k >= 1) { y = b.y; k = 1; landed = true; }
  }
  const settle = (a: number) => {
    const t = smoothstep(0, 1, k);
    return a + (Math.round(a / (2 * Math.PI)) * 2 * Math.PI - a) * t;
  };
  const A = accel(fe - b.t0);
  return {y, ax: settle(b.spin[0] * A), ay: settle(b.spin[1] * A), az: settle(b.spin[2] * A), landed, falling};
};

type Props = {
  frame: number;
  geometry: THREE.BufferGeometry;
  bodies: Body[];
  clock: Clock;
  /** one colour or one per body */
  color: THREE.ColorRepresentation | THREE.Color[];
  /** local matrix of this part inside the body (so trees = trunk set + crown set) */
  local?: THREE.Matrix4;
  outline?: boolean;
  thickness?: number;
  emissive?: THREE.ColorRepresentation;
  castShadow?: boolean;
};

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _h = new THREE.Matrix4();

/** Zero-g props: InstancedMesh (+ inverted-hull outline) driven by bodyState(). Deterministic, one draw call per part. */
export const ZeroG: React.FC<Props> = ({frame, geometry, bodies, clock, color, local, outline = true, thickness = 0.05, emissive, castShadow}) => {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const hull = useRef<THREE.InstancedMesh>(null);
  const L = local ?? new THREE.Matrix4();
  const colors = useMemo(() => {
    if (Array.isArray(color)) return color;
    const c = new THREE.Color(color as THREE.ColorRepresentation);
    return bodies.map(() => c);
  }, [color, bodies]);

  useLayoutEffect(() => {
    const m = mesh.current!;
    bodies.forEach((b, i) => {
      const st = bodyState(b, frame, clock);
      _p.set(b.x, st.y, b.z);
      _e.set(st.ax, b.yaw + st.ay, st.az, 'YXZ');
      _q.setFromEuler(_e);
      _s.setScalar(b.s);
      _m.compose(_p, _q, _s).multiply(L);
      m.setMatrixAt(i, _m);
      m.setColorAt(i, colors[i]);
      if (hull.current) {
        _h.copy(_m).multiply(new THREE.Matrix4().makeScale(1 + thickness, 1 + thickness, 1 + thickness));
        hull.current.setMatrixAt(i, _h);
      }
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (hull.current) hull.current.instanceMatrix.needsUpdate = true;
  }, [frame, bodies, clock.restore, clock.g]);

  return (
    <>
      <instancedMesh ref={mesh} args={[geometry, undefined, bodies.length]} frustumCulled={false} castShadow={castShadow}>
        <meshToonMaterial {...toonProps('#ffffff')} emissive={emissive ?? '#000000'} />
      </instancedMesh>
      {outline && <instancedMesh ref={hull} args={[geometry, outlineMaterial(), bodies.length]} frustumCulled={false} />}
    </>
  );
};
