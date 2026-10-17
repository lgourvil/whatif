import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {random} from 'remotion';
import {toonProps} from './ToonMaterial';

/** Faceted toon terrain from any height function; `paint` writes the colour of each triangle (jitter included). */
export const Terrain: React.FC<{
  height: (x: number, z: number) => number;
  paint: (c: THREE.Color, h: number, x: number, z: number) => void;
  bounds: {x0: number; x1: number; z0: number; z1: number; step: number};
}> = ({height, paint, bounds: {x0, x1, z0, z1, step}}) => {
  const geo = useMemo(() => {
    const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step);
    const pos: number[] = [], col: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const xa = x0 + i * step, xb = xa + step, za = z0 + j * step, zb = za + step;
      const V = (x: number, z: number): [number, number, number] => [x, height(x, z), z];
      const A = V(xa, za), B = V(xb, za), C = V(xa, zb), D = V(xb, zb);
      [[A, C, B], [B, C, D]].forEach((p, k) => {
        const h = (p[0][1] + p[1][1] + p[2][1]) / 3;
        const cx = (p[0][0] + p[1][0] + p[2][0]) / 3, cz = (p[0][2] + p[1][2] + p[2][2]) / 3;
        paint(c, h, cx, cz);
        c.offsetHSL(0, 0, (random(`ter${i}-${j}-${k}`) - 0.5) * 0.07);
        for (const v of p) { pos.push(v[0], v[1], v[2]); col.push(c.r, c.g, c.b); }
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshToonMaterial {...toonProps('#ffffff')} vertexColors />
    </mesh>
  );
};

export const mat4 = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

/** Static instanced props (rocks, windows, far silhouettes). Optional per-instance colours. */
export const Instances: React.FC<{
  geometry: THREE.BufferGeometry; matrices: THREE.Matrix4[]; color: THREE.ColorRepresentation;
  colors?: THREE.Color[]; basic?: boolean;
}> = ({geometry, matrices, color, colors, basic}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    matrices.forEach((m, i) => {
      ref.current!.setMatrixAt(i, m);
      if (colors) ref.current!.setColorAt(i, colors[i % colors.length]);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
  }, [matrices]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, matrices.length]} frustumCulled={false}>
      {basic ? <meshBasicMaterial color={color} /> : <meshToonMaterial {...toonProps(color)} />}
    </instancedMesh>
  );
};
