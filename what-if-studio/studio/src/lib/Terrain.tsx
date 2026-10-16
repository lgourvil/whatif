import React, {useMemo} from 'react';
import * as THREE from 'three';
import {random} from 'remotion';
import {toonProps} from './ToonMaterial';

/** Flat-shaded low-poly terrain tile (vertex colours, jittered per triangle) + endless flat skirt that fog melts into the horizon. */
export const Terrain: React.FC<{
  height: (x: number, z: number) => number;
  colorAt: (x: number, y: number, z: number, out: THREE.Color) => void;
  half: number; step: number; skirt?: THREE.ColorRepresentation; skirtY?: number;
}> = ({height, colorAt, half, step, skirt, skirtY = -0.6}) => {
  const geo = useMemo(() => {
    const n = Math.round((half * 2) / step);
    const pos: number[] = [], col: number[] = [];
    const c = new THREE.Color();
    const v = (x: number, z: number) => [x, height(x, z), z];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const xa = -half + i * step, xb = xa + step, za = -half + j * step, zb = za + step;
      const A = v(xa, za), B = v(xb, za), C = v(xa, zb), D = v(xb, zb);
      [[A, C, B], [B, C, D]].forEach((t, k) => {
        const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3, cz = (t[0][2] + t[1][2] + t[2][2]) / 3;
        colorAt(cx, cy, cz, c);
        c.offsetHSL(0, 0, (random(`tr${i}-${j}-${k}`) - 0.5) * 0.07);
        for (const p of t) { pos.push(p[0], p[1], p[2]); col.push(c.r, c.g, c.b); }
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }, [half, step]);
  return (
    <>
      <mesh geometry={geo} receiveShadow><meshToonMaterial {...toonProps('#ffffff')} vertexColors /></mesh>
      {skirt && (
        <mesh position={[0, skirtY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[9000, 9000]} />
          <meshToonMaterial {...toonProps(skirt)} />
        </mesh>
      )}
    </>
  );
};
