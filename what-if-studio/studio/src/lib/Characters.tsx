import React, {useLayoutEffect, useMemo} from 'react';
import * as THREE from 'three';
import {outlineMaterial, toonProps} from './ToonMaterial';

type OProps = {
  geometry: THREE.BufferGeometry;
  color: THREE.ColorRepresentation;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
  thickness?: number;
  shadow?: boolean;
  emissive?: THREE.ColorRepresentation;
};

/** Toon mesh + inverted-hull outline (duplicate mesh, BackSide, slightly larger, black). */
export const Outlined: React.FC<OProps> = ({geometry, color, position, rotation, scale = 1, thickness = 0.06, shadow = true, emissive}) => {
  const s: [number, number, number] = typeof scale === 'number' ? [scale, scale, scale] : scale;
  return (
    <group position={position} rotation={rotation} scale={s}>
      <mesh geometry={geometry} castShadow={shadow}>
        <meshToonMaterial {...toonProps(color)} emissive={emissive ?? '#000000'} />
      </mesh>
      <mesh geometry={geometry} material={outlineMaterial()} scale={1 + thickness} />
    </group>
  );
};

const G = {
  body: new THREE.CylinderGeometry(0.3, 0.34, 0.85, 6),
  head: new THREE.IcosahedronGeometry(0.28, 0),
  leg: new THREE.BoxGeometry(0.15, 0.62, 0.17),
  arm: new THREE.BoxGeometry(0.12, 0.55, 0.12),
  ant: new THREE.CylinderGeometry(0.015, 0.015, 0.4, 4),
  bulb: new THREE.OctahedronGeometry(0.07, 0),
  scarf: new THREE.BoxGeometry(0.2, 0.08, 0.45),
  visor: new THREE.BoxGeometry(0.34, 0.1, 0.12),
};

type PipProps = {
  position: [number, number, number];
  yaw: number;
  phase: number; // walk phase
  moving: number; // 0..1
  point: number; // 0..1 arm raised toward the horizon
  scale?: number;
  body: THREE.ColorRepresentation;
  scarf: THREE.ColorRepresentation;
  glow: THREE.ColorRepresentation;
  frame: number;
};

/** Pip: original recurring companion. Round low-poly body, visor, long scarf and a glowing antenna. */
export const Pip: React.FC<PipProps> = ({position, yaw, phase, moving, point, scale = 1, body, scarf, glow, frame}) => {
  const sw = Math.sin(phase) * 0.7 * moving;
  const bob = Math.abs(Math.sin(phase)) * 0.05 * moving;
  return (
    <group position={position} rotation={[0, -yaw, 0]} scale={scale}>
      <group position={[0, bob, 0]}>
        <Outlined geometry={G.body} color={body} position={[0, 0.95, 0]} />
        <Outlined geometry={G.head} color={body} position={[0, 1.6, 0]} />
        <Outlined geometry={G.visor} color="#111111" position={[0, 1.62, -0.2]} thickness={0.03} />
        <mesh position={[0, 1.95, 0]} geometry={G.ant}><meshBasicMaterial color="#222" /></mesh>
        <mesh position={[0, 2.17, 0]} geometry={G.bulb}><meshBasicMaterial color={glow} /></mesh>
        {[0, 1, 2].map((i) => (
          <Outlined key={i} geometry={G.scarf} color={scarf} thickness={0.1}
            position={[0.02 * i, 1.34 - 0.03 * i, 0.4 + i * 0.4]}
            rotation={[Math.sin(frame * 0.2 + i) * 0.25, Math.sin(frame * 0.13 + i * 1.3) * 0.3, 0]} />
        ))}
        <group position={[-0.22, 0.62, 0]} rotation={[sw, 0, 0]}>
          <Outlined geometry={G.leg} color="#2b2b3a" position={[0, -0.3, 0]} />
        </group>
        <group position={[0.22, 0.62, 0]} rotation={[-sw, 0, 0]}>
          <Outlined geometry={G.leg} color="#2b2b3a" position={[0, -0.3, 0]} />
        </group>
        <group position={[-0.42, 1.28, 0]} rotation={[-sw * 0.8, 0, 0.15]}>
          <Outlined geometry={G.arm} color={body} position={[0, -0.25, 0]} />
        </group>
        <group position={[0.42, 1.28, 0]} rotation={[sw * 0.8 - point * 2.9, 0, -0.15]}>
          <Outlined geometry={G.arm} color={body} position={[0, -0.25, 0]} />
        </group>
      </group>
    </group>
  );
};

const H = {
  palm: new THREE.BoxGeometry(0.16, 0.05, 0.17),
  finger: new THREE.BoxGeometry(0.035, 0.03, 0.12),
  fore: new THREE.BoxGeometry(0.1, 0.1, 0.55),
};

/** First-person hands, placed in world space from the camera pose (so they sit "on" the camera). */
export const PovHands: React.FC<{
  position: THREE.Vector3; quaternion: THREE.Quaternion;
  glove: THREE.ColorRepresentation; sleeve: THREE.ColorRepresentation;
  raise: number; swing: number; frame: number;
}> = ({position, quaternion, glove, sleeve, raise, swing, frame}) => {
  const hand = (side: number) => {
    const sw = Math.sin(frame * 0.0 + swing * side) * 0.12;
    return (
      <group position={[side * 0.2, -0.3 - (1 - raise) * 0.6 + sw, -0.7 + sw * 0.5]} scale={0.7} rotation={[0.35 + (1 - raise) * 0.4, -side * 0.12, side * 0.18]}>
        <Outlined geometry={H.fore} color={sleeve} position={[0, 0, 0.3]} thickness={0.05} shadow={false} />
        <Outlined geometry={H.palm} color={glove} thickness={0.1} shadow={false} />
        {[-0.055, -0.018, 0.018, 0.055].map((x, i) => (
          <Outlined key={i} geometry={H.finger} color={glove} position={[x, 0, -0.12]} thickness={0.12} shadow={false} />
        ))}
      </group>
    );
  };
  return (
    <group position={position} quaternion={quaternion}>
      {hand(-1)}
      {hand(1)}
    </group>
  );
};

/* ================================================================================================
 * Realistic secondary characters (seen at distance, from behind / in profile / backlit).
 * One seamless SDF body polygonized once, skinned by primitive ownership, posed per frame.
 * Regions (aRegion): 0 skin, 1 top (jacket), 2 trousers, 3 shoes, 4 hair/beanie.
 * A per-person hi-vis vest ("gilet jaune") is painted over the torso in the shader.
 * ============================================================================================== */
import {SDF as _SDF, V3 as _V3, ellipsoid as _ell, polygonize as _poly, roundBox as _rbox, smin as _smin, taperCapsule as _cap} from './sdf';
import {NOISE_GLSL as _NOISE} from './glsl';

type BPrim = {f: _SDF; bone: number; k: number; region: number};
export const BODY_BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'lUp', 'lFore', 'lHand', 'rUp', 'rFore', 'rHand', 'lThigh', 'lShin', 'lFoot', 'rThigh', 'rShin', 'rFoot'] as const;
const BB = Object.fromEntries(BODY_BONES.map((b, i) => [b, i])) as Record<(typeof BODY_BONES)[number], number>;
const JOINTS: Record<string, [_V3, number]> = {
  hips: [[0, 0.95, 0], -1], spine: [[0, 1.08, 0], BB.hips], chest: [[0, 1.26, 0], BB.spine], neck: [[0, 1.5, 0], BB.chest], head: [[0, 1.6, 0], BB.neck],
  // A-pose rest (arms ~20° out, legs slightly apart) so limbs never fuse with the torso in the SDF
  lUp: [[0.19, 1.42, 0], BB.chest], lFore: [[0.29, 1.165, 0.0], BB.lUp], lHand: [[0.335, 0.925, 0.01], BB.lFore],
  rUp: [[-0.19, 1.42, 0], BB.chest], rFore: [[-0.29, 1.165, 0.0], BB.rUp], rHand: [[-0.335, 0.925, 0.01], BB.rFore],
  lThigh: [[0.1, 0.92, 0], BB.hips], lShin: [[0.115, 0.5, 0.0], BB.lThigh], lFoot: [[0.12, 0.085, 0.0], BB.lShin],
  rThigh: [[-0.1, 0.92, 0], BB.hips], rShin: [[-0.115, 0.5, 0.0], BB.rThigh], rFoot: [[-0.12, 0.085, 0.0], BB.rShin],
};

let BODY: THREE.BufferGeometry | null = null;
export const getBodyGeo = () => {
  if (BODY) return BODY;
  const P: BPrim[] = [];
  const add = (f: _SDF, bone: number, k: number, region: number) => P.push({f, bone, k, region});
  add(_ell([0, 0.95, 0.005], [0.165, 0.12, 0.11]), BB.hips, 0.04, 2);
  add(_ell([0, 1.12, 0.0], [0.15, 0.13, 0.1]), BB.spine, 0.05, 1);
  add(_ell([0, 1.32, 0.0], [0.185, 0.16, 0.115]), BB.chest, 0.05, 1);
  add(_cap([-0.16, 1.43, 0.01], [0.16, 1.43, 0.01], 0.062, 0.062), BB.chest, 0.04, 1);
  add(_cap([0, 1.46, 0], [0, 1.6, -0.01], 0.05, 0.045), BB.neck, 0.03, 0);
  add(_ell([0, 1.69, -0.012], [0.083, 0.108, 0.098]), BB.head, 0.03, 0);
  add(_ell([0, 1.735, 0.012], [0.088, 0.075, 0.098]), BB.head, 0.012, 4);
  for (const s of [1, -1]) {
    const L = s > 0;
    add(_cap([s * 0.19, 1.42, 0], [s * 0.29, 1.165, 0.0], 0.052, 0.043), L ? BB.lUp : BB.rUp, 0.025, 1);
    add(_cap([s * 0.29, 1.165, 0.0], [s * 0.33, 0.94, 0.01], 0.042, 0.034), L ? BB.lFore : BB.rFore, 0.012, 1);
    add(_ell([s * 0.34, 0.87, 0.012], [0.026, 0.07, 0.045]), L ? BB.lHand : BB.rHand, 0.015, 0);
    add(_cap([s * 0.1, 0.92, 0], [s * 0.115, 0.5, 0.0], 0.08, 0.06), L ? BB.lThigh : BB.rThigh, 0.02, 2);
    add(_cap([s * 0.115, 0.5, 0.0], [s * 0.12, 0.1, 0.01], 0.056, 0.042), L ? BB.lShin : BB.rShin, 0.012, 2);
    add(_rbox([s * 0.12, 0.05, -0.045], [0.048, 0.05, 0.13], 0.035), L ? BB.lFoot : BB.rFoot, 0.02, 3);
  }
  const field: _SDF = (x, y, z) => {
    let d = 1e9;
    for (const p of P) { const v = p.f(x, y, z); d = d > 1 ? v : _smin(d, v, p.k); }
    return d;
  };
  const g = _poly(field, {min: [-0.42, -0.01, -0.2], max: [0.42, 1.82, 0.16], step: 0.011});
  const pos = g.attributes.position as THREE.BufferAttribute;
  const si = new Uint16Array(pos.count * 4), sw = new Float32Array(pos.count * 4), reg = new Float32Array(pos.count);
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    const per = new Map<number, number>();
    let best = 1e9, region = 0;
    for (const p of P) {
      const d = p.f(x, y, z);
      if (d < best) { best = d; region = p.region; }
      per.set(p.bone, Math.max(per.get(p.bone) ?? 0, Math.exp(-Math.max(0, d) / 0.02)));
    }
    // hands & feet & head stay with their limb; region tweaks: sleeves end at the wrist, collar
    if (region === 1 && y < 0.95 && Math.abs(x) > 0.28) region = 0;
    const top = [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = top.reduce((a, [, w]) => a + w, 0);
    top.forEach(([b, w], k) => { si[v * 4 + k] = b; sw[v * 4 + k] = w / tot; });
    reg[v] = region;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setAttribute('aRegion', new THREE.Float32BufferAttribute(reg, 1));
  g.computeBoundingSphere();
  BODY = g;
  return g;
};

export type Outfit = {skin: THREE.ColorRepresentation; top: THREE.ColorRepresentation; pants: THREE.ColorRepresentation; shoes: THREE.ColorRepresentation; hair: THREE.ColorRepresentation; vest: number};

/** `pov`: cut away head, neck and arms (the narrator's own body under the POV camera). */
export const makeBodyMaterial = (o: Outfit, pov = false) => {
  const m = new THREE.MeshPhysicalMaterial({color: '#ffffff', roughness: 0.8, sheen: 0.6, sheenRoughness: 0.7, sheenColor: new THREE.Color('#888888')});
  const u = {
    uSkin: {value: new THREE.Color(o.skin)}, uTop: {value: new THREE.Color(o.top)}, uPants: {value: new THREE.Color(o.pants)},
    uShoes: {value: new THREE.Color(o.shoes)}, uHair: {value: new THREE.Color(o.hair)}, uVest: {value: o.vest},
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRegion;\nvarying float vRegion;\nvarying vec3 vBody;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = aRegion; vBody = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uSkin, uTop, uPants, uShoes, uHair; uniform float uVest;
varying float vRegion; varying vec3 vBody;
${_NOISE}
float vestMask() {
  float torso = step(0.5, vRegion) * step(vRegion, 1.5) * step(0.97, vBody.y) * step(vBody.y, 1.5) * step(abs(vBody.x), 0.2);
  return torso * uVest;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float r = vRegion;
  vec3 c = r < 0.5 ? uSkin : r < 1.5 ? uTop : r < 2.5 ? uPants : r < 3.5 ? uShoes : uHair;
  c *= 0.85 + 0.3 * wiFbm(vBody * 40.0);
  // cloth folds darkening around joints
  c *= 1.0 - 0.18 * smoothstep(0.55, 0.9, wiNoise(vBody * vec3(30.0, 12.0, 30.0)));
  float vm = vestMask();
  vec3 hv = vec3(0.85, 0.95, 0.02);
  float band = (smoothstep(0.012, 0.0, abs(vBody.y - 1.07) - 0.022) + smoothstep(0.012, 0.0, abs(vBody.y - 1.2) - 0.022));
  c = mix(c, mix(hv, vec3(0.75), band), vm);
  diffuseColor.rgb = c;
  ${pov ? 'if (vBody.y > 1.53 || (vRegion < 0.5 && vBody.y > 1.4) || (abs(vBody.x) > 0.2 && vBody.y > 0.8)) discard;' : ''}
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = vRegion < 0.5 ? 0.5 : vRegion > 3.5 ? 0.7 : vRegion > 2.5 ? 0.45 : 0.85;
roughnessFactor = mix(roughnessFactor, 0.55, vestMask());`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// fluorescent vest: a little "self-glow" under any light, retro-reflective bands
totalEmissiveRadiance += vestMask() * vec3(0.05, 0.06, 0.0);`);
  };
  if (pov) m.side = THREE.DoubleSide;
  m.customProgramCacheKey = () => `wi-body-v1-${pov}`;
  return m;
};

export type BodyPose = {
  /** walk phase (radians) and amount 0..1 */
  walk: number; walkAmt: number;
  /** both arms raised (chanting / protest) 0..1, and fist pump phase */
  armsUp: number; pump: number;
  /** right arm throwing 0..1 */
  throw?: number;
  /** torso turn and lean */
  turn: number; lean: number;
  /** cough / doubled over (tear gas) 0..1 */
  hunch?: number;
};

const D2R = Math.PI / 180;

export const Person: React.FC<{position: THREE.Vector3; yaw: number; pose: BodyPose; material: THREE.Material; scale?: number; hidden?: string[]}> = ({position, yaw, pose, material, scale = 1, hidden}) => {
  const {mesh, bones, rest} = useMemo(() => {
    const geo = getBodyGeo();
    const bones = BODY_BONES.map(() => new THREE.Bone());
    BODY_BONES.forEach((name, i) => {
      const [p, parent] = JOINTS[name];
      if (parent < 0) bones[i].position.set(...p);
      else {
        const pp = JOINTS[BODY_BONES[parent]][0];
        bones[i].position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
        bones[parent].add(bones[i]);
      }
    });
    const mesh = new THREE.SkinnedMesh(geo, material);
    mesh.add(bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return {mesh, bones, rest: bones.map((b) => b.quaternion.clone())};
  }, [material]);

  useLayoutEffect(() => {
    const e = new THREE.Euler();
    const set = (b: number, x: number, y = 0, z = 0) => bones[b].quaternion.copy(rest[b]).multiply(new THREE.Quaternion().setFromEuler(e.set(x, y, z)));
    const w = pose.walk, a = pose.walkAmt;
    const sw = Math.sin(w) * a;
    const hunch = pose.hunch ?? 0;
    set(BB.hips, 0, sw * 0.12, 0);
    bones[BB.hips].position.y = 0.95 - Math.abs(Math.cos(w)) * 0.02 * a - hunch * 0.06;
    set(BB.spine, pose.lean * 0.5 - hunch * 0.35, pose.turn * 0.4 - sw * 0.1, 0);
    set(BB.chest, pose.lean * 0.5 - hunch * 0.3, pose.turn * 0.6 - sw * 0.12, 0);
    set(BB.neck, hunch * 0.2, 0, 0);
    set(BB.head, -pose.lean * 0.6 + hunch * 0.2, pose.turn * 0.3, 0);
    // legs
    set(BB.lThigh, -sw * 0.55 * 1 - hunch * 0.2, 0, 0);
    set(BB.rThigh, sw * 0.55 - hunch * 0.2, 0, 0);
    set(BB.lShin, Math.max(0, Math.sin(w - 1.4)) * 0.9 * a + hunch * 0.3);
    set(BB.rShin, Math.max(0, Math.sin(w + Math.PI - 1.4)) * 0.9 * a + hunch * 0.3);
    set(BB.lFoot, -sw * 0.2);
    set(BB.rFoot, sw * 0.2);
    // arms: walk counter-swing, raised for chanting with fist pumps
    const up = pose.armsUp;
    const pump = Math.max(0, Math.sin(pose.pump)) * up;
    const th = pose.throw ?? 0;
    set(BB.lUp, sw * 0.45 * (1 - up) - up * (150 * D2R) - pump * 0.25, 0, (-14 + up * 18) * D2R);
    set(BB.lFore, -(15 + up * 40) * D2R + pump * 0.4, 0, 0);
    set(BB.rUp, -sw * 0.45 * (1 - up) - up * (150 * D2R) - pump * 0.25 - th * 2.6, 0, -(-14 + up * 18) * D2R);
    set(BB.rFore, -(15 + up * 40) * D2R + pump * 0.4 - th * 0.6, 0, 0);
    set(BB.lHand, 0); set(BB.rHand, 0);
    // collapse hidden parts (e.g. the narrator's own head and arms under the POV camera)
    BODY_BONES.forEach((b, i) => bones[i].scale.setScalar(hidden?.includes(b) ? 0.0001 : 1));
  });

  return (
    <group position={position} rotation={[0, yaw, 0]} scale={scale}>
      <primitive object={mesh} />
    </group>
  );
};
