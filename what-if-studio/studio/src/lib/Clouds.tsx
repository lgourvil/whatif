import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {random} from 'remotion';
import {toonProps} from './ToonMaterial';

/** Static toon cloud deck: clusters of flat-shaded icosahedra between altitude lo..hi. The camera flies through them. */
export const Clouds: React.FC<{
  seed: string; clusters: number; lo: number; hi: number; radius: number; size: number;
  color: THREE.Color; shade: THREE.Color; tint?: THREE.Color; /** self-lit amount so the deck stays white whatever the ground bounces back */ glow?: number;
}> = ({seed, clusters, lo, hi, radius, size, color, shade, tint, glow = 0.45}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => {
    const a: {m: THREE.Matrix4; v: number}[] = [];
    for (let c = 0; c < clusters; c++) {
      const cx = (random(`${seed}cx${c}`) - 0.5) * radius * 2, cz = (random(`${seed}cz${c}`) - 0.5) * radius * 2;
      const cy = lo + random(`${seed}cy${c}`) * (hi - lo);
      for (let k = 0; k < 6; k++) {
        const s = size * (0.45 + random(`${seed}s${c}-${k}`) * 0.75);
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(cx + (random(`${seed}x${c}-${k}`) - 0.5) * size * 2.2, cy + (random(`${seed}y${c}-${k}`) - 0.3) * size * 0.5, cz + (random(`${seed}z${c}-${k}`) - 0.5) * size * 1.6),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(random(`${seed}a${c}-${k}`) * 3, random(`${seed}b${c}-${k}`) * 3, 0)),
          new THREE.Vector3(s * 1.3, s * 0.8, s),
        );
        a.push({m, v: random(`${seed}v${c}-${k}`)});
      }
    }
    return a;
  }, [seed, clusters, lo, hi, radius, size]);
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  useLayoutEffect(() => {
    const c = new THREE.Color();
    items.forEach((it, i) => {
      ref.current!.setMatrixAt(i, it.m);
      c.copy(shade).lerp(color, 0.4 + it.v * 0.6);
      if (tint) c.lerp(tint, 0.25);
      ref.current!.setColorAt(i, c);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    ref.current!.instanceColor!.needsUpdate = true;
  }, [items, color, shade, tint]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, items.length]} frustumCulled={false}>
      <meshToonMaterial {...toonProps('#ffffff')} emissive="#ffffff" emissiveIntensity={glow} />
    </instancedMesh>
  );
};
