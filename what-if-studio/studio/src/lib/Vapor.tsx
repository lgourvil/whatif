import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {random} from 'remotion';
import {gradientMap} from './ToonMaterial';

/**
 * Toon smoke / vapour / cloud system. Everything is closed-form from (frame, seed): a puff is emitted at t0 from an
 * origin along a direction; each of its blobs follows jet -> drag -> buoyancy -> wind, grows, then shrinks away.
 * Rendered as ONE instanced faceted mesh (per-instance colour) => thousands of blobs in a single draw call.
 */
export type Puff = {
  t0: number;
  origin: [number, number, number];
  dir: [number, number, number];
  /** blob radius at full size (m) */
  size: number;
  /** jet distance (m) */
  reach: number;
  life: number;
  n: number;
  seed: string;
  color?: THREE.Color;
};

export type BlobBuf = {data: Float32Array; count: number};
export const blobBuffer = (max: number): BlobBuf => ({data: new Float32Array(max * 7), count: 0});

/** Keep-out sphere around the lens: blobs are shrunk so they never swallow the camera or the POV hands. */
export type Avoid = {x: number; y: number; z: number; r: number} | null;
let avoid: Avoid = null;
export const setAvoid = (a: Avoid) => { avoid = a; };

const push = (b: BlobBuf, x: number, y: number, z: number, s: number, c: THREE.Color) => {
  if (avoid) {
    const d = Math.hypot(x - avoid.x, y - avoid.y, z - avoid.z);
    s = Math.min(s, Math.max(0, (d - avoid.r) * 0.9));
  }
  if (b.count * 7 >= b.data.length || s <= 0.0005) return;
  const o = b.count * 7;
  b.data[o] = x; b.data[o + 1] = y; b.data[o + 2] = z; b.data[o + 3] = s;
  b.data[o + 4] = c.r; b.data[o + 5] = c.g; b.data[o + 6] = c.b;
  b.count++;
};

const tmpC = new THREE.Color();
/** Adds every live blob of the given puffs at `frame`. wind is in m/frame. */
export const addPuffs = (b: BlobBuf, puffs: Puff[], frame: number, wind: [number, number, number], base: THREE.Color, fade: THREE.Color) => {
  for (const p of puffs) {
    const age = frame - p.t0;
    if (age < 0 || age > p.life) continue;
    const u = age / p.life;
    for (let k = 0; k < p.n; k++) {
      const r0 = random(`${p.seed}-${k}-a`), r1 = random(`${p.seed}-${k}-b`), r2 = random(`${p.seed}-${k}-c`), r3 = random(`${p.seed}-${k}-d`);
      // blobs leave the mouth staggered over the first 12 % of the life
      const delay = r0 * 0.12;
      const v = Math.max(0, (u - delay) / (1 - delay));
      if (v <= 0) continue;
      const jet = p.reach * (0.55 + 0.6 * r1) * (1 - Math.exp(-4.5 * v)) / (1 - Math.exp(-4.5));
      const th = r2 * Math.PI * 2, ph = Math.acos(2 * r3 - 1);
      const spread = p.size * (0.3 + 1.6 * v) * (0.4 + r1 * 0.6);
      const ox = Math.sin(ph) * Math.cos(th) * spread, oy = Math.cos(ph) * spread * 0.7, oz = Math.sin(ph) * Math.sin(th) * spread;
      const rise = p.size * 2.2 * Math.pow(v, 1.4);
      const a = age - delay * p.life;
      const x = p.origin[0] + p.dir[0] * jet + ox + wind[0] * a;
      const y = p.origin[1] + p.dir[1] * jet + oy + rise + wind[1] * a;
      const z = p.origin[2] + p.dir[2] * jet + oz + wind[2] * a;
      const grow = Math.min(1, v / 0.22);
      const shrink = 1 - Math.pow(Math.max(0, (v - 0.55) / 0.45), 1.6);
      const s = p.size * (0.35 + 0.65 * grow) * (0.55 + 0.9 * r0) * (1 + v * 1.3) * shrink;
      tmpC.copy(p.color ?? base).lerp(fade, v * 0.7);
      push(b, x, y, z, s, tmpC);
    }
  }
};

export type Bank = {x: number; y: number; z: number; s: number; seed: string};
/** Static-ish cloud banks (street fog, cloud deck): breathe + drift, scaled by an amount 0..1 with per-blob thresholds. */
export const addBanks = (b: BlobBuf, banks: Bank[], frame: number, amount: number, drift: [number, number], c: THREE.Color) => {
  for (const k of banks) {
    const th = random(`${k.seed}-t`) * 0.85;
    const a = Math.min(1, Math.max(0, (amount - th) / 0.15));
    if (a <= 0) continue;
    const br = 1 + Math.sin(frame * 0.02 + random(`${k.seed}-p`) * 6.28) * 0.06;
    const x = k.x + drift[0] * frame * (0.6 + random(`${k.seed}-v`) * 0.8);
    tmpC.copy(c).offsetHSL(0, 0, (random(`${k.seed}-l`) - 0.5) * 0.06);
    push(b, x, k.y + Math.sin(frame * 0.013 + k.x) * 0.3, k.z + drift[1] * frame, k.s * a * br, tmpC);
  }
};

type Props = {buf: BlobBuf; max: number; emissive?: THREE.ColorRepresentation; detail?: number;
  /** optional coloured inverted-hull outline (absolute, metres) — reads as a cartoon cloud rim */
  outline?: number; outlineColor?: THREE.ColorRepresentation};

export const VaporMesh: React.FC<Props> = ({buf, max, emissive = '#3a2a32', detail = 1, outline = 0, outlineColor = '#b0587a'}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const hull = useRef<THREE.InstancedMesh>(null);
  const hullMat = useMemo(() => new THREE.MeshBasicMaterial({color: outlineColor, side: THREE.BackSide}), []);
  const mat = useMemo(() => new THREE.MeshToonMaterial({color: '#ffffff', gradientMap: gradientMap(), flatShading: true, emissive: new THREE.Color(emissive)} as THREE.MeshToonMaterialParameters), []);
  mat.emissive.set(emissive);
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, detail), [detail]);
  const o = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  useLayoutEffect(() => {
    const m = ref.current!;
    const d = buf.data;
    for (let i = 0; i < max; i++) {
      if (i < buf.count) {
        const k = i * 7;
        o.position.set(d[k], d[k + 1], d[k + 2]);
        o.scale.set(d[k + 3], d[k + 3] * 0.86, d[k + 3]);
        o.rotation.set(i * 1.7, i * 0.9, 0);
        col.setRGB(d[k + 4], d[k + 5], d[k + 6]);
      } else {
        o.position.set(0, -999, 0); o.scale.setScalar(0);
        col.setRGB(0, 0, 0);
      }
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, col);
      if (hull.current) {
        if (i < buf.count) o.scale.set(d[i * 7 + 3] + outline, (d[i * 7 + 3] + outline) * 0.86, d[i * 7 + 3] + outline);
        o.updateMatrix();
        hull.current.setMatrixAt(i, o.matrix);
      }
    }
    m.count = Math.max(1, buf.count);
    if (hull.current) { hull.current.count = m.count; hull.current.instanceMatrix.needsUpdate = true; }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={ref} args={[geo, mat, max]} frustumCulled={false} />
      {outline > 0 && <instancedMesh ref={hull} args={[geo, hullMat, max]} frustumCulled={false} />}
    </>
  );
};
