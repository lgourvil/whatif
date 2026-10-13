import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {random} from 'remotion';

export type ParticleState = {x: number; y: number; z: number; s: number; rx?: number; ry?: number; rz?: number};

type Props = {
  count: number;
  /** Closed-form state of instance i at `frame`; `r` = three stable per-instance randoms from random(seed). */
  update: (i: number, frame: number, r: [number, number, number]) => ParticleState | null;
  frame: number;
  seed: string;
  color: THREE.ColorRepresentation;
  geometry?: THREE.BufferGeometry;
  opacity?: number;
  toon?: boolean;
  fog?: boolean;
};

const dummy = new THREE.Object3D();

/** Generic deterministic InstancedMesh (rain, snow, embers, dust, bubbles, foam, birds, fish…). */
export const Particles: React.FC<Props> = ({count, update, frame, seed, color, geometry, opacity = 1, toon, fog = true}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const rnd = useMemo(() => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) a[i * 3 + k] = random(`${seed}-${i}-${k}`);
    return a;
  }, [count, seed]);
  const geo = useMemo(() => geometry ?? new THREE.OctahedronGeometry(1, 0), [geometry]);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    for (let i = 0; i < count; i++) {
      const s = update(i, frame, [rnd[i * 3], rnd[i * 3 + 1], rnd[i * 3 + 2]]);
      if (!s || s.s <= 0) {
        dummy.position.set(0, -9999, 0);
        dummy.scale.setScalar(0);
      } else {
        dummy.position.set(s.x, s.y, s.z);
        dummy.rotation.set(s.rx ?? 0, s.ry ?? 0, s.rz ?? 0);
        dummy.scale.setScalar(s.s);
      }
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  });

  return (
    <instancedMesh ref={ref} args={[geo, undefined, count]} frustumCulled={false}>
      {toon ? <meshToonMaterial color={color} transparent={opacity < 1} opacity={opacity} fog={fog} /> : <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} fog={fog} depthWrite={opacity >= 1} />}
    </instancedMesh>
  );
};
