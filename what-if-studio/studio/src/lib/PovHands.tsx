import React, {useLayoutEffect, useMemo} from 'react';
import * as THREE from 'three';
import {SDF, V3, ellipsoid, polygonize, relax, smin, taperCapsule} from './sdf';
import {HandPose} from './HandPoses';
import {makeFabricMaterial, makeSkinMaterial} from './SkinMaterial';

/**
 * Procedural, fully rigged human hand (RIGHT hand model; the left one is a mirror).
 * Rest space: wrist at origin, fingers toward -Z, back of the hand +Y, thumb on -X.
 * Skeleton: wrist → 4 × (metacarpal → proximal → middle → distal) + thumb (metacarpal → proximal → distal).
 * Mesh: one seamless Surface-Nets surface from a smooth-union SDF (webbing, knuckles, pads, nail plates),
 * skinned by primitive ownership so neighbouring fingers never steal each other's vertices.
 */

const D = Math.PI / 180;
type Finger = {mcp: V3; base: V3; len: [number, number, number]; r: [number, number, number, number]; splay: number};

// anatomical proportions (metres) — middle longest, little tip ≈ ring DIP, thumb starts low on the palm
export const FINGERS: Finger[] = [
  {mcp: [-0.031, 0.0, -0.094], base: [-0.019, 0.0, -0.014], len: [0.043, 0.025, 0.021], r: [0.0101, 0.0089, 0.0079, 0.0069], splay: -9},
  {mcp: [-0.0095, 0.0018, -0.098], base: [-0.006, 0.0015, -0.012], len: [0.047, 0.029, 0.022], r: [0.0104, 0.0092, 0.0081, 0.0071], splay: -2},
  {mcp: [0.011, 0.0, -0.094], base: [0.007, 0.0, -0.014], len: [0.044, 0.028, 0.021], r: [0.0098, 0.0087, 0.0077, 0.0067], splay: 6},
  {mcp: [0.0295, -0.003, -0.085], base: [0.018, -0.002, -0.018], len: [0.034, 0.020, 0.019], r: [0.0086, 0.0075, 0.0067, 0.0059], splay: 14},
];
const THUMB = {
  cmc: [-0.022, -0.011, -0.022] as V3,
  dir: new THREE.Vector3(-0.62, -0.26, -0.74).normalize(),
  up: new THREE.Vector3(-0.62, 0.72, 0.1),
  len: [0.046, 0.033, 0.028] as [number, number, number],
  r: [0.0165, 0.0134, 0.0122, 0.0104, 0.0090],
};

const v3 = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];
const dirFromSplay = (deg: number) => new THREE.Vector3(Math.sin(deg * D), 0, -Math.cos(deg * D));

type Prim = {f: SDF; bone: number; k: number; tag: number};

type Rig = {
  geo: THREE.BufferGeometry;
  /** bone rest world matrices */
  rest: {pos: THREE.Vector3; quat: THREE.Quaternion; parent: number}[];
};

let RIG: Rig | null = null;

const buildRig = (): Rig => {
  const rest: Rig['rest'] = [];
  const add = (pos: THREE.Vector3, quat: THREE.Quaternion, parent: number) => rest.push({pos, quat, parent}) - 1;
  const wrist = add(new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), -1);
  const prims: Prim[] = [];
  const segs: {a: V3; b: V3; bone: number}[] = [];

  // forearm + wrist (owned by wrist bone)
  prims.push({f: taperCapsule([0, -0.001, -0.004], [0, -0.003, 0.14], 0.0265, 0.031, 1.38), bone: wrist, k: 0.02, tag: 0});

  // palm masses
  const thenar = ellipsoid([-0.021, -0.012, -0.034], [0.019, 0.0125, 0.029]);
  const hypo = ellipsoid([0.021, -0.009, -0.044], [0.0145, 0.0105, 0.033]);
  const pad = taperCapsule([-0.029, -0.0055, -0.086], [0.028, -0.0075, -0.079], 0.0105, 0.0098, 1.0);
  prims.push({f: thenar, bone: wrist, k: 0.016, tag: 1});
  prims.push({f: hypo, bone: wrist, k: 0.016, tag: 1});

  FINGERS.forEach((F, fi) => {
    const dir = dirFromSplay(F.splay);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    const mcp = new THREE.Vector3(...F.mcp);
    const base = new THREE.Vector3(...F.base);
    const metaQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), mcp.clone().sub(base).normalize());
    const meta = add(base, metaQ, wrist);
    // metacarpal slab: flattened capsule (gives the back-of-hand tendon ridges + knuckle bumps)
    prims.push({f: taperCapsule(F.base, F.mcp, 0.0122, 0.0112, 1.55), bone: meta, k: 0.016, tag: 1});
    prims.push({f: ellipsoid([F.mcp[0], F.mcp[1] + 0.0062, F.mcp[2] + 0.002], [0.0072, 0.0052, 0.0085]), bone: meta, k: 0.006, tag: 1});
    segs.push({a: F.base, b: F.mcp, bone: meta});
    let p = mcp.clone();
    let parent = meta;
    for (let s = 0; s < 3; s++) {
      const b = add(p.clone(), q.clone(), parent);
      const e = p.clone().addScaledVector(dir, F.len[s]);
      const ra = F.r[s], rb = F.r[s + 1];
      if (s < 2) {
        prims.push({f: taperCapsule(v3(p), v3(e), ra, rb, 1.12), bone: b, k: 0.0035, tag: 2 + s});
      } else {
        // distal: tapered, fleshy pad on the palm side, nail plate on top
        const tip = e.clone().addScaledVector(dir, -rb * 0.55);
        prims.push({f: taperCapsule(v3(p), v3(tip), ra, rb * 0.98, 1.16), bone: b, k: 0.0035, tag: 4});
        const padC = p.clone().addScaledVector(dir, F.len[2] * 0.58).add(new THREE.Vector3(0, -ra * 0.32, 0));
        prims.push({f: ellipsoid(v3(padC), [ra * 0.9, ra * 0.72, F.len[2] * 0.42]), bone: b, k: 0.004, tag: 4});
        const nailC = p.clone().addScaledVector(dir, F.len[2] * 0.6).add(new THREE.Vector3(0, ra * 0.78, 0));
        prims.push({f: ellipsoid(v3(nailC), [ra * 0.78, ra * 0.3, F.len[2] * 0.47]), bone: b, k: 0.0022, tag: 10 + fi});
      }
      // dorsal joint bumps
      if (s < 2) prims.push({f: ellipsoid([e.x, e.y + rb * 0.3, e.z], [rb * 0.78, rb * 0.55, rb * 0.75]), bone: b, k: 0.003, tag: 2 + s});
      segs.push({a: v3(p), b: v3(e), bone: b});
      parent = b;
      p = e;
    }
  });
  prims.push({f: pad, bone: wrist, k: 0.012, tag: 1});

  // thumb
  {
    const dir = THUMB.dir.clone();
    const up = THUMB.up.clone().addScaledVector(dir, -THUMB.up.dot(dir)).normalize();
    const x = new THREE.Vector3().crossVectors(up, dir.clone().negate()).normalize();
    const m = new THREE.Matrix4().makeBasis(x, up, dir.clone().negate());
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    let p = new THREE.Vector3(...THUMB.cmc);
    let parent = wrist;
    for (let s = 0; s < 3; s++) {
      const b = add(p.clone(), q.clone(), parent);
      const e = p.clone().addScaledVector(dir, THUMB.len[s]);
      const ra = THUMB.r[s + (s > 0 ? 1 : 0)], rb = THUMB.r[s + 1 + (s > 0 ? 1 : 0)];
      if (s === 0) {
        prims.push({f: taperCapsule(v3(p), v3(e), 0.0155, 0.0118, 1.12), bone: b, k: 0.014, tag: 1});
      } else if (s === 1) {
        prims.push({f: taperCapsule(v3(p), v3(e), ra, rb, 1.1), bone: b, k: 0.0035, tag: 3});
        prims.push({f: ellipsoid(v3(e.clone().addScaledVector(up, rb * 0.4)), [rb * 0.85, rb * 0.6, rb * 0.9]), bone: b, k: 0.003, tag: 3});
      } else {
        const tip = e.clone().addScaledVector(dir, -rb * 0.5);
        prims.push({f: taperCapsule(v3(p), v3(tip), ra, rb, 1.18), bone: b, k: 0.0035, tag: 4});
        const padC = p.clone().addScaledVector(dir, THUMB.len[2] * 0.55).addScaledVector(up, -ra * 0.3);
        prims.push({f: ellipsoid(v3(padC), [ra * 0.92, ra * 0.75, THUMB.len[2] * 0.42]), bone: b, k: 0.004, tag: 4});
        const nailC = p.clone().addScaledVector(dir, THUMB.len[2] * 0.6).addScaledVector(up, ra * 0.8);
        // nail ellipsoid in thumb frame: approximate with axis-aligned ellipsoid in a rotated frame
        const inv = q.clone().invert();
        const nailF: SDF = (xx, yy, zz) => {
          const lp = new THREE.Vector3(xx - nailC.x, yy - nailC.y, zz - nailC.z).applyQuaternion(inv);
          return ellipsoid([0, 0, 0], [ra * 0.8, ra * 0.3, THUMB.len[2] * 0.46])(lp.x, lp.y, lp.z);
        };
        prims.push({f: nailF, bone: b, k: 0.0022, tag: 14});
      }
      segs.push({a: v3(p), b: v3(e), bone: b});
      parent = b;
      p = e;
    }
  }

  // union
  const field: SDF = (x, y, z) => {
    let d = 1e9;
    for (const pr of prims) {
      const v = pr.f(x, y, z);
      d = d > 1 ? v : smin(d, v, pr.k);
    }
    return d;
  };
  const geo = polygonize(field, {min: [-0.085, -0.04, -0.215], max: [0.06, 0.035, 0.09], step: 0.00135});
  relax(geo, 1, 0.25);

  // skin weights by primitive ownership + per-vertex shading attributes
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const aSkin = new Float32Array(n * 4), aNail = new Float32Array(n * 3);
  const sigma = 0.0022;
  const tmp = new THREE.Vector3();
  for (let v = 0; v < n; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    const per = new Map<number, number>();
    let best = 1e9, bestTag = 0, bestBone = 0;
    for (const pr of prims) {
      const d = pr.f(x, y, z);
      if (d < best) { best = d; bestTag = pr.tag; bestBone = pr.bone; }
      const w = Math.exp(-Math.max(0, d) / sigma);
      per.set(pr.bone, Math.max(per.get(pr.bone) ?? 0, w));
    }
    const top = [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    // never blend across fingers: keep only bones on the same chain as the owner (or wrist/meta)
    const chain = chainOf(rest, bestBone);
    const kept = top.filter(([b]) => chain.has(b));
    const tot = kept.reduce((a, [, w]) => a + w, 0) || 1;
    kept.forEach(([b, w], k) => { si[v * 4 + k] = b; sw[v * 4 + k] = w / tot; });
    if (kept.length === 0) { si[v * 4] = bestBone; sw[v * 4] = 1; }

    // shading attributes
    const nrm = tmp.set((geo.attributes.normal as THREE.BufferAttribute).getX(v), (geo.attributes.normal as THREE.BufferAttribute).getY(v), (geo.attributes.normal as THREE.BufferAttribute).getZ(v));
    let dorsal = THREE.MathUtils.smoothstep(nrm.y, -0.25, 0.35);
    // nearest finger joint along the chain (signed)
    let ju = 1, red = 0, thin = 0;
    for (const s of segs) {
      const a = new THREE.Vector3(...s.a), b = new THREE.Vector3(...s.b);
      const ab = b.clone().sub(a); const L = ab.length(); ab.divideScalar(L);
      const t = new THREE.Vector3(x, y, z).sub(a).dot(ab);
      const radial = new THREE.Vector3(x, y, z).sub(a).addScaledVector(ab, -t).length();
      if (radial > 0.016) continue;
      if (Math.abs(t) < Math.abs(ju) && s.bone !== 0) ju = t;
      if (Math.abs(t - L) < Math.abs(ju)) ju = t - L;
    }
    if (bestTag >= 2) thin = 1;
    if (bestTag === 1) thin = 0.25;
    if (bestTag === 4) red += 0.55;
    red += Math.exp(-((ju / 0.006) ** 2)) * dorsal * 0.5;
    if (bestTag === 1 && dorsal < 0.5) red += 0.15;
    aSkin.set([Math.min(1, red), dorsal, Math.abs(ju) < 0.02 ? ju : 0.02, thin], v * 4);
    // nails
    if (bestTag >= 10 && dorsal > 0.3) {
      const fi = bestTag - 10;
      let along: number, across: number;
      if (fi < 4) {
        const F = FINGERS[fi];
        const dir = dirFromSplay(F.splay);
        const dip = new THREE.Vector3(...F.mcp).addScaledVector(dir, F.len[0] + F.len[1]);
        const right = new THREE.Vector3(-dir.z, 0, dir.x);
        const rel = new THREE.Vector3(x, y, z).sub(dip);
        along = (rel.dot(dir) - F.len[2] * 0.6 + F.len[2] * 0.47) / (F.len[2] * 0.94);
        across = rel.dot(right) / (F.r[2] * 0.78);
      } else {
        const dir = THUMB.dir;
        const ip = new THREE.Vector3(...THUMB.cmc).addScaledVector(dir, THUMB.len[0] + THUMB.len[1]);
        const up = THUMB.up.clone().addScaledVector(dir, -THUMB.up.dot(dir)).normalize();
        const right = new THREE.Vector3().crossVectors(up, dir.clone().negate()).normalize();
        const rel = new THREE.Vector3(x, y, z).sub(ip);
        along = (rel.dot(dir) - THUMB.len[2] * 0.6 + THUMB.len[2] * 0.46) / (THUMB.len[2] * 0.92);
        across = rel.dot(right) / (THUMB.r[3] * 0.8);
      }
      aNail.set([across, along, 1], v * 3);
    } else {
      aNail.set([0, 0, 0], v * 3);
    }
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setAttribute('aSkin', new THREE.Float32BufferAttribute(aSkin, 4));
  geo.setAttribute('aNail', new THREE.Float32BufferAttribute(aNail, 3));
  geo.computeBoundingSphere();
  return {geo, rest};
};

const chainOf = (rest: Rig['rest'], bone: number) => {
  const s = new Set<number>();
  // ancestors
  let b = bone;
  while (b >= 0) { s.add(b); b = rest[b].parent; }
  // direct children of the owner (for joint blending)
  rest.forEach((r, i) => { if (r.parent === bone) s.add(i); });
  return s;
};

export const getHandRig = () => {
  if (!RIG) RIG = buildRig();
  return RIG;
};

/** Build a THREE.Bone hierarchy from the rest table. */
const makeBones = (rig: Rig) => {
  const bones = rig.rest.map(() => new THREE.Bone());
  const world = rig.rest.map((r) => new THREE.Matrix4().compose(r.pos, r.quat, new THREE.Vector3(1, 1, 1)));
  rig.rest.forEach((r, i) => {
    const local = r.parent < 0 ? world[i].clone() : world[r.parent].clone().invert().multiply(world[i]);
    local.decompose(bones[i].position, bones[i].quaternion, bones[i].scale);
    if (r.parent >= 0) bones[r.parent].add(bones[i]);
  });
  return {bones, restLocal: bones.map((b) => b.quaternion.clone())};
};

const sleeveGeo = (() => {
  let g: THREE.BufferGeometry | null = null;
  return () => {
    if (g) return g;
    const segA = 48, segL = 60, len = 0.62;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= segL; j++) {
      const t = j / segL, z = 0.028 + t * len;
      for (let i = 0; i <= segA; i++) {
        const a = (i / segA) * Math.PI * 2;
        const r0 = 0.041 + t * 0.03;
        const folds = Math.sin(a * 3 + z * 38) * 0.0035 * (0.4 + t) + Math.sin(a * 5 - z * 61) * 0.0018
          + Math.max(0, Math.sin(z * 90 + Math.sin(a * 2) * 1.5)) * 0.0032 * Math.exp(-t * 2.5);
        const cuff = j < 4 ? -0.0025 * (4 - j) / 4 : 0;
        const r = r0 + folds + cuff;
        pos.push(Math.cos(a) * r * 1.08, Math.sin(a) * r * 0.9 - 0.003, z);
        uv.push(i / segA, t * 4);
      }
    }
    for (let j = 0; j < segL; j++) for (let i = 0; i < segA; i++) {
      const a = j * (segA + 1) + i, b = a + 1, c = a + segA + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // inner opening: render both sides so the cuff interior shows
    return g;
  };
})();

export type HandState = {
  visible: boolean;
  /** wrist position/orientation in WORLD space */
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  pose: HandPose;
};

type HandProps = HandState & {
  left?: boolean;
  skin: THREE.Material;
  sleeve: THREE.Material;
  children?: React.ReactNode;
};

export const Hand: React.FC<HandProps> = ({left, position, quaternion, pose, visible, skin, sleeve, children}) => {
  const rig = getHandRig();
  const {mesh, bones, restLocal} = useMemo(() => {
    const {bones, restLocal} = makeBones(rig);
    const mesh = new THREE.SkinnedMesh(rig.geo, skin);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.add(bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    return {mesh, bones, restLocal};
  }, [rig, skin]);

  useLayoutEffect(() => {
    // fingers: bone order is wrist, then per finger [meta, prox, mid, dist], then thumb [cmc, prox, dist]
    const qx = new THREE.Quaternion(), qy = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
    FINGERS.forEach((F, fi) => {
      const [splay, mcp, pip, dip] = pose.f[fi];
      const b0 = 1 + fi * 4;
      const cup = fi >= 2 ? pose.cup * (fi - 1) * 0.5 : fi === 0 ? -pose.cup * 0.15 : 0;
      bones[b0].quaternion.copy(restLocal[b0]).multiply(qx.setFromAxisAngle(X, -cup * D));
      bones[b0 + 1].quaternion.copy(restLocal[b0 + 1]).multiply(qy.setFromAxisAngle(Y, -(splay - F.splay) * D)).multiply(qx.setFromAxisAngle(X, -mcp * D));
      bones[b0 + 2].quaternion.copy(restLocal[b0 + 2]).multiply(qx.setFromAxisAngle(X, -pip * D));
      bones[b0 + 3].quaternion.copy(restLocal[b0 + 3]).multiply(qx.setFromAxisAngle(X, -dip * D));
    });
    const [abd, cmcF, tm, ti] = pose.t;
    const t0 = 17;
    // thumb local frame: X across, Y = nail side, -Z along. Flex = rotate about X toward -Y (palm side).
    bones[t0].quaternion.copy(restLocal[t0]).multiply(qy.setFromAxisAngle(Y, (abd - 20) * D)).multiply(qx.setFromAxisAngle(X, -cmcF * D));
    bones[t0 + 1].quaternion.copy(restLocal[t0 + 1]).multiply(qx.setFromAxisAngle(X, -tm * D));
    bones[t0 + 2].quaternion.copy(restLocal[t0 + 2]).multiply(qx.setFromAxisAngle(X, -ti * D));
  });

  return (
    <group position={position} quaternion={quaternion} visible={visible}>
      <group scale={[left ? -1 : 1, 1, 1]}>
        <primitive object={mesh} />
        <mesh geometry={sleeveGeo()} material={sleeve} castShadow receiveShadow />
      </group>
      {children}
    </group>
  );
};

export type HandsLook = {skin: THREE.Material; sleeve: THREE.Material};

/** Narrator's recurring look: warm light-medium skin, washed navy canvas work jacket. */
export const useNarratorLook = (sleeveColor: THREE.ColorRepresentation = '#2c3646'): HandsLook =>
  useMemo(() => ({
    skin: makeSkinMaterial({tone: '#c99479'}),
    sleeve: makeFabricMaterial(sleeveColor, {weave: 1100, rough: 0.9, sheen: 0.6}),
  }), [sleeveColor]);

/**
 * Hand placement helper: given the camera pose and a lagged camera quaternion,
 * returns the wrist world transform for a hand defined in camera space.
 */
export const handInCamera = (camPos: THREE.Vector3, camQuatLagged: THREE.Quaternion, local: THREE.Vector3, euler: [number, number, number]) => {
  const p = local.clone().applyQuaternion(camQuatLagged).add(camPos);
  const q = camQuatLagged.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(euler[0], euler[1], euler[2], 'YXZ')));
  return {position: p, quaternion: q};
};
