import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {random} from 'remotion';

type ParticlesProps = {
  frame: number;
  seed: string;
  count: number;
  /** 0..1 share of instances visible */
  intensity: number;
  center: THREE.Vector3;
  box: [number, number, number];
  /** velocity in units per frame */
  velocity: [number, number, number];
  size: number;
  color: THREE.ColorRepresentation;
  wobble?: number;
  opacity?: number;
  emissive?: boolean;
  /** anchor the box in WORLD space (particles stay put while the camera flies through them) instead of riding with `center` */
  world?: boolean;
  /** vertical stretch for speed streaks */
  stretch?: number;
};

/** Deterministic closed-form particles: pos = wrap(seed + v*frame), no accumulated simulation. */
export const Particles: React.FC<ParticlesProps> = ({
  frame, seed, count, intensity, center, box, velocity, size, color, wobble = 0, opacity = 1, world = false, stretch = 1,
}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const rnd = useMemo(() => {
    const a = new Float32Array(count * 5);
    for (let i = 0; i < count; i++) for (let k = 0; k < 5; k++) a[i * 5 + k] = random(`${seed}-${i}-${k}`);
    return a;
  }, [count, seed]);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const m = ref.current!;
    const vis = Math.floor(count * Math.min(1, Math.max(0, intensity)));
    for (let i = 0; i < count; i++) {
      if (i >= vis) {
        dummy.scale.setScalar(0);
      } else {
        const r = i * 5;
        const w = (v: number, s: number) => ((v % s) + s) % s;
        const ox = world ? center.x : 0, oy = world ? center.y : 0, oz = world ? center.z : 0;
        const x = w(rnd[r] * box[0] + velocity[0] * frame - ox, box[0]) - box[0] / 2;
        const y = w(rnd[r + 1] * box[1] + velocity[1] * frame - oy, box[1]) - box[1] / 2;
        const z = w(rnd[r + 2] * box[2] + velocity[2] * frame - oz, box[2]) - box[2] / 2;
        const ph = rnd[r + 3] * 6.283;
        dummy.position.set(
          center.x + x + Math.sin(frame * 0.05 + ph) * wobble,
          center.y + y + Math.cos(frame * 0.043 + ph) * wobble,
          center.z + z,
        );
        dummy.scale.set(size * (0.5 + rnd[r + 4]), size * (0.5 + rnd[r + 4]) * stretch, size * (0.5 + rnd[r + 4]));
        dummy.rotation.set(stretch > 1 ? 0 : ph, ph * 2, 0);
      }
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [frame, intensity, center.x, center.y, center.z]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <octahedronGeometry args={[1, 0]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </instancedMesh>
  );
};
