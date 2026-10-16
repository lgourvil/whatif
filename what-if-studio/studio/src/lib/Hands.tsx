import React, {useMemo} from 'react';
import * as THREE from 'three';
import {shellMaterial, toonProps} from './ToonMaterial';

/**
 * Articulated first-person hands (v2). Real-world scale (metres), 5 fingers x 3 phalanges, opposable thumb,
 * knuckles, nails, thenar pad, wrist and a hoodie sleeve with ribbed cuff. Pose is fully frame-driven.
 *
 * Hand-local frame (right hand): wrist at origin, fingers along +y, palm faces +z, thumb on +x.
 * The left hand is the same rig mirrored on x (three.js flips the face winding for negative determinants).
 */
export type HandPose = {
  /** curl per finger [index, middle, ring, pinky] 0 = straight, 1 = fist */
  curl: [number, number, number, number];
  spread: number;
  /** thumb flex (0 straight .. 1 folded) and opposition (0 alongside index .. 1 across the palm) */
  thumbFlex: number;
  thumbOpp: number;
};

export const POSES: Record<string, HandPose> = {
  relaxed: {curl: [0.28, 0.33, 0.38, 0.42], spread: 0.25, thumbFlex: 0.25, thumbOpp: 0.25},
  grip: {curl: [0.6, 0.66, 0.7, 0.74], spread: 0.0, thumbFlex: 0.45, thumbOpp: 0.65},
  hold: {curl: [0.54, 0.6, 0.66, 0.72], spread: 0.0, thumbFlex: 0.3, thumbOpp: 0.55},
  open: {curl: [0.08, 0.06, 0.09, 0.12], spread: 0.5, thumbFlex: 0.05, thumbOpp: 0.0},
  cup: {curl: [0.2, 0.22, 0.25, 0.3], spread: 0.2, thumbFlex: 0.15, thumbOpp: 0.2},
  fist: {curl: [0.95, 0.95, 0.95, 0.95], spread: 0, thumbFlex: 0.8, thumbOpp: 0.8},
  show: {curl: [0.6, 0.64, 0.68, 0.72], spread: 0.0, thumbFlex: 0.1, thumbOpp: -0.8},
  /** holding a slim object to the lips: fingers wrapped, thumb tucked along the side */
  mouth: {curl: [0.6, 0.64, 0.68, 0.72], spread: 0.0, thumbFlex: 0.55, thumbOpp: 0.35},
  point: {curl: [0.0, 0.9, 0.92, 0.95], spread: 0.1, thumbFlex: 0.6, thumbOpp: 0.7},
};

export const mixPose = (a: HandPose, b: HandPose, t: number): HandPose => ({
  curl: a.curl.map((v, i) => v + (b.curl[i] - v) * t) as HandPose['curl'],
  spread: a.spread + (b.spread - a.spread) * t,
  thumbFlex: a.thumbFlex + (b.thumbFlex - a.thumbFlex) * t,
  thumbOpp: a.thumbOpp + (b.thumbOpp - a.thumbOpp) * t,
});

// finger table: x of the knuckle, y of the knuckle, phalanx lengths, radius
const FINGERS = [
  {x: 0.030, y: 0.098, len: [0.044, 0.026, 0.021], r: 0.0094},
  {x: 0.0105, y: 0.103, len: [0.049, 0.030, 0.023], r: 0.0097},
  {x: -0.0095, y: 0.099, len: [0.046, 0.028, 0.022], r: 0.0091},
  {x: -0.028, y: 0.090, len: [0.036, 0.022, 0.019], r: 0.0080},
];
const SPREAD = [-0.13, -0.035, 0.075, 0.2];

const geoCache = new Map<string, THREE.BufferGeometry>();
const capsule = (r: number, len: number) => {
  const k = `c${r}-${len}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.CapsuleGeometry(r, Math.max(0.0001, len - r * 1.2), 3, 7);
    g.scale(1, 1, 0.86); // slightly flattened, like a real finger
    geoCache.set(k, g);
  }
  return g;
};
const sphere = (r: number) => {
  const k = `s${r}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.IcosahedronGeometry(r, 1); geoCache.set(k, g); }
  return g;
};

const palmGeo = () => {
  const k = 'palm';
  let g = geoCache.get(k);
  if (g) return g;
  // tapered, rounded palm: lathe-like blob from a scaled sphere (smooth normals => constant-width shell outline)
  const s = new THREE.SphereGeometry(1, 12, 10);
  const p = s.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const yy = (y + 1) / 2; // 0 wrist .. 1 knuckles
    const w = 0.031 + 0.012 * Math.sin(Math.min(1, yy * 1.25) * Math.PI * 0.5);
    x *= w; z *= 0.0135 * (1 - 0.25 * yy);
    if (z < 0) z *= 1.15; // back of the hand slightly domed
    y = 0.012 + yy * 0.092;
    // knuckle line slants down toward the pinky
    y -= Math.max(0, -x) * 0.25 * yy;
    p.setXYZ(i, x, y, z);
  }
  s.computeVertexNormals();
  geoCache.set(k, s);
  return s;
};

type MatSet = {skin: THREE.Material; nail: THREE.Material; sleeve: THREE.Material; cuff: THREE.Material};

const Part: React.FC<{g: THREE.BufferGeometry; m: THREE.Material; w: number; p?: [number, number, number]; r?: [number, number, number]; s?: [number, number, number]; outline?: boolean}> =
  ({g, m, w, p, r, s, outline = true}) => (
    <group position={p} rotation={r} scale={s}>
      <mesh geometry={g} material={m} />
      {outline && <mesh geometry={g} material={shellMaterial(w)} />}
    </group>
  );

/** One finger as a chain of three phalanges; each joint bends about local x toward the palm (+z). */
const Finger: React.FC<{i: number; curl: number; spread: number; mats: MatSet; w: number}> = ({i, curl, spread, mats, w}) => {
  const f = FINGERS[i];
  const c = 0.1 + curl * 0.9;
  const a = [c * 1.5, c * 1.75, c * 1.05];
  const [l0, l1, l2] = f.len;
  const r = f.r;
  return (
    <group position={[f.x, f.y, 0.001]} rotation={[0, 0, SPREAD[i] * (0.35 + spread)]}>
      <group rotation={[a[0], 0, 0]}>
        <Part g={sphere(r * 1.12)} m={mats.skin} w={w} p={[0, 0, -r * 0.25]} outline={false} />
        <Part g={capsule(r, l0)} m={mats.skin} w={w} p={[0, l0 / 2, 0]} />
        <group position={[0, l0, 0]} rotation={[a[1], 0, 0]}>
          <Part g={capsule(r * 0.93, l1)} m={mats.skin} w={w} p={[0, l1 / 2, 0]} />
          <group position={[0, l1, 0]} rotation={[a[2], 0, 0]}>
            <Part g={capsule(r * 0.86, l2)} m={mats.skin} w={w} p={[0, l2 / 2, 0]} />
            <Part g={sphere(r * 0.62)} m={mats.nail} w={w} p={[0, l2 * 0.62, -r * 0.6]} s={[1, 1.35, 0.32]} outline={false} />
          </group>
        </group>
      </group>
    </group>
  );
};

const Thumb: React.FC<{flex: number; opp: number; mats: MatSet; w: number}> = ({flex, opp, mats, w}) => {
  const r = 0.0108;
  const L = [0.042, 0.031, 0.026];
  const f = 0.1 + flex * 0.9;
  return (
    // CMC joint at the base of the palm, thumb side; opposition swings it in front of the palm
    <group position={[0.026, 0.024, 0.006]} rotation={[0.25 + opp * 0.55, -opp * 0.9, -0.75 + opp * 0.35]}>
      <Part g={capsule(r * 1.35, L[0])} m={mats.skin} w={w} p={[0, L[0] / 2, 0.002]} />
      <group position={[0, L[0], 0]} rotation={[f * 0.55, 0, f * 0.35]}>
        <Part g={capsule(r, L[1])} m={mats.skin} w={w} p={[0, L[1] / 2, 0]} />
        <group position={[0, L[1], 0]} rotation={[f * 0.9, 0, 0]}>
          <Part g={capsule(r * 0.93, L[2])} m={mats.skin} w={w} p={[0, L[2] / 2, 0]} />
          <Part g={sphere(r * 0.7)} m={mats.nail} w={w} p={[0, L[2] * 0.6, -r * 0.62]} s={[1, 1.3, 0.32]} outline={false} />
        </group>
      </group>
    </group>
  );
};

export type HandProps = {
  side: 1 | -1;
  pose: HandPose;
  skin: THREE.ColorRepresentation;
  sleeve: THREE.ColorRepresentation;
  /** wrist flex (radians about local x) and deviation (about local z) applied between forearm and hand */
  wristFlex?: number;
  wristDev?: number;
  /** outline width in metres (≈ 0.0009 reads well at arm's length) */
  outline?: number;
  /** children are attached to the palm frame (props held in the hand) */
  children?: React.ReactNode;
};

/** A single articulated hand + forearm + sleeve. Place it with a parent group (camera space). */
export const Hand: React.FC<HandProps> = ({side, pose, skin, sleeve, wristFlex = 0, wristDev = 0, outline = 0.0009, children}) => {
  const mats = useMemo<MatSet>(() => ({
    // a little self-illumination keeps skin tones readable under strongly coloured light (pink haze, neon...)
    skin: new THREE.MeshToonMaterial({...toonProps(skin), emissive: new THREE.Color(skin).multiplyScalar(0.22)}),
    nail: new THREE.MeshToonMaterial(toonProps(new THREE.Color(skin).lerp(new THREE.Color('#ffe9ee'), 0.55))),
    sleeve: new THREE.MeshToonMaterial(toonProps(sleeve)),
    cuff: new THREE.MeshToonMaterial(toonProps(new THREE.Color(sleeve).multiplyScalar(0.72))),
  }), [String(skin), String(sleeve)]);
  const forearm = useMemo(() => new THREE.CylinderGeometry(0.03, 0.036, 0.3, 10).translate(0, -0.15, 0), []);
  const sleeveG = useMemo(() => new THREE.CylinderGeometry(0.047, 0.056, 0.42, 10, 1, true).translate(0, -0.25, 0), []);
  const cuffG = useMemo(() => new THREE.CylinderGeometry(0.041, 0.043, 0.035, 14).translate(0, -0.045, 0), []);
  const w = outline;
  return (
    <group scale={[side, 1, 1]}>
      {/* forearm in sleeve (hidden part of the arm) */}
      <group rotation={[-wristFlex, 0, -wristDev]}>
        <Part g={forearm} m={mats.skin} w={w} />
        <Part g={cuffG} m={mats.cuff} w={w} />
        <Part g={sleeveG} m={mats.sleeve} w={w * 1.6} />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
          <mesh key={k} position={[Math.cos(k / 8 * 6.283) * 0.0425, -0.045, Math.sin(k / 8 * 6.283) * 0.0425]} rotation={[0, -k / 8 * 6.283, 0]}>
            <boxGeometry args={[0.003, 0.03, 0.003]} />
            <meshBasicMaterial color={new THREE.Color(sleeve).multiplyScalar(0.45)} />
          </mesh>
        ))}
      </group>
      {/* wrist */}
      <Part g={sphere(0.03)} m={mats.skin} w={w} p={[0, 0.008, 0]} s={[1, 0.8, 0.62]} />
      <Part g={palmGeo()} m={mats.skin} w={w} />
      {/* thenar pad (thumb muscle) and hypothenar pad */}
      <Part g={sphere(0.017)} m={mats.skin} w={w} p={[0.017, 0.035, 0.008]} s={[1, 1.4, 0.75]} outline={false} />
      <Part g={sphere(0.015)} m={mats.skin} w={w} p={[-0.021, 0.045, 0.006]} s={[0.9, 1.7, 0.6]} outline={false} />
      {FINGERS.map((_, i) => <Finger key={i} i={i} curl={pose.curl[i]} spread={pose.spread} mats={mats} w={w} />)}
      <Thumb flex={pose.thumbFlex} opp={pose.thumbOpp} mats={mats} w={w} />
      {/* un-mirror props so text on them reads the right way round */}
      <group scale={[side, 1, 1]}>{children}</group>
    </group>
  );
};

/** Orientation from where the fingers point and where the palm faces (both in the parent frame). */
export const handBasis = (fingers: THREE.Vector3, palm: THREE.Vector3) => {
  const y = fingers.clone().normalize();
  const z = palm.clone().addScaledVector(y, -palm.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
};

export type HandKey = {
  f: number;
  pos: [number, number, number];
  fingers: [number, number, number];
  palm: [number, number, number];
  pose: keyof typeof POSES | HandPose;
  wrist?: number;
  /** wrist deviation (forearm swings toward the pinky side) */
  dev?: number;
};

const ease = (t: number) => t * t * (3 - 2 * t);

/** Interpolated hand track (camera space): eased position, slerped orientation, blended pose. */
export const handTrack = (keys: HandKey[], frame: number) => {
  let i = 0;
  while (i < keys.length - 2 && frame >= keys[i + 1].f) i++;
  const a = keys[i], b = keys[Math.min(keys.length - 1, i + 1)];
  const t = b.f === a.f ? 0 : ease(Math.min(1, Math.max(0, (frame - a.f) / (b.f - a.f))));
  const pa = typeof a.pose === 'string' ? POSES[a.pose] : a.pose;
  const pb = typeof b.pose === 'string' ? POSES[b.pose] : b.pose;
  const qa = handBasis(new THREE.Vector3(...a.fingers), new THREE.Vector3(...a.palm));
  const qb = handBasis(new THREE.Vector3(...b.fingers), new THREE.Vector3(...b.palm));
  return {
    pos: new THREE.Vector3(...a.pos).lerp(new THREE.Vector3(...b.pos), t),
    quat: qa.slerp(qb, t),
    pose: mixPose(pa, pb, t),
    wrist: (a.wrist ?? 0) + ((b.wrist ?? 0) - (a.wrist ?? 0)) * t,
    dev: (a.dev ?? 0) + ((b.dev ?? 0) - (a.dev ?? 0)) * t,
  };
};

/** Attaches children to the camera pose (world space), so hands and held props sit "on" the lens. */
export const CameraSpace: React.FC<{position: THREE.Vector3; quaternion: THREE.Quaternion; children: React.ReactNode}> = ({position, quaternion, children}) => (
  <group position={position} quaternion={quaternion}>{children}</group>
);
