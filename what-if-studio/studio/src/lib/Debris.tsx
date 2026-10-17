import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {random} from 'remotion';
import {toonProps} from './ToonMaterial';

export type LiftItem = {
  pos: [number, number, number];
  scale: [number, number, number];
  rot: [number, number, number];
  color: THREE.Color;
  /** how high this item goes when gravity is off (metres) */
  H: number;
  /** frames of lag behind the global gravity curve */
  delay: number;
  spin: [number, number, number];
  drift: [number, number];
};

/** Scatter helper: deterministic items from a seed, a region and a size range. */
export const scatterItems = (
  seed: string, n: number, region: {x: [number, number]; z: [number, number]},
  size: [number, number], height: [number, number], colors: THREE.Color[],
  ground: (x: number, z: number) => number, accept?: (x: number, z: number) => boolean,
): LiftItem[] => {
  const out: LiftItem[] = [];
  for (let i = 0; i < n * 4 && out.length < n; i++) {
    const r = (k: string) => random(`${seed}-${i}-${k}`);
    const x = region.x[0] + r('x') * (region.x[1] - region.x[0]);
    const z = region.z[0] + r('z') * (region.z[1] - region.z[0]);
    if (accept && !accept(x, z)) continue;
    const s = size[0] + r('s') * (size[1] - size[0]);
    out.push({
      pos: [x, ground(x, z) + s * 0.5, z],
      scale: [s * (0.7 + r('a') * 0.8), s * (0.7 + r('b') * 0.8), s * (0.7 + r('c') * 0.8)],
      rot: [0, r('r') * 6.28, 0],
      color: colors[Math.floor(r('c2') * colors.length) % colors.length],
      H: height[0] + r('h') * r('h2') * (height[1] - height[0]) + r('h3') * 0.0,
      delay: r('d') * 26,
      spin: [(r('p') - 0.5) * 6, (r('q') - 0.5) * 6, (r('t') - 0.5) * 6],
      drift: [(r('dx') - 0.5) * 40, (r('dz') - 0.5) * 40],
    });
  }
  return out;
};

type Props = {
  frame: number;
  items: LiftItem[];
  geometry: THREE.BufferGeometry;
  /** global gravity-off curve: 0 = at rest, 1 = fully floating */
  g: (frame: number) => number;
  outline?: boolean;
  emissive?: THREE.ColorRepresentation;
};

const hullCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
const hullOf = (g: THREE.BufferGeometry) => {
  let h = hullCache.get(g);
  if (!h) { h = g.clone(); h.scale(1.09, 1.09, 1.09); hullCache.set(g, h); }
  return h;
};

/**
 * Anti-gravity field: toon InstancedMesh whose items rise, tumble and drift as a closed-form
 * function of the frame (no simulation state) and settle back exactly when g returns to 0.
 */
export const LiftField: React.FC<Props> = ({frame, items, geometry, g, outline = true, emissive}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const hull = useRef<THREE.InstancedMesh>(null);
  const o = useMemo(() => new THREE.Object3D(), []);
  const hg = useMemo(() => hullOf(geometry), [geometry]);

  useLayoutEffect(() => {
    items.forEach((it, i) => {
      const gi = g(frame - it.delay);
      o.position.set(it.pos[0] + it.drift[0] * gi, it.pos[1] + it.H * gi, it.pos[2] + it.drift[1] * gi);
      o.rotation.set(it.rot[0] + it.spin[0] * gi, it.rot[1] + it.spin[1] * gi, it.rot[2] + it.spin[2] * gi);
      o.scale.set(...it.scale);
      o.updateMatrix();
      ref.current!.setMatrixAt(i, o.matrix);
      ref.current!.setColorAt(i, it.color);
      hull.current?.setMatrixAt(i, o.matrix);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    ref.current!.instanceColor!.needsUpdate = true;
    if (hull.current) hull.current.instanceMatrix.needsUpdate = true;
  }, [frame, items]);

  return (
    <>
      <instancedMesh ref={ref} args={[geometry, undefined, items.length]} frustumCulled={false}>
        <meshToonMaterial {...toonProps('#ffffff')} emissive={emissive ?? '#000000'} />
      </instancedMesh>
      {outline && (
        <instancedMesh ref={hull} args={[hg, undefined, items.length]} frustumCulled={false}>
          <meshBasicMaterial color="#000000" side={THREE.BackSide} />
        </instancedMesh>
      )}
    </>
  );
};
