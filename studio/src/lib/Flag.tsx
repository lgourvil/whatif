import React, { useMemo } from "react";
import { CylinderGeometry, DoubleSide, MeshToonMaterial, PlaneGeometry, type Texture } from "three";
import { gradientMap, toon } from "./ToonMaterial";
import { Toon } from "./Toon";

const pole = new CylinderGeometry(0.035, 0.045, 1, 6).translate(0, 0.5, 0);

type Props = {
  frame: number;
  loopFrames: number;
  texture: Texture;
  height?: number; // pole height (m)
  width?: number; // flag width
  raise?: number; // 0..1 how far up the pole the flag is (and pole growth)
  seed?: number;
  position?: [number, number, number];
  rotationY?: number;
  outline?: number;
};

// Waving flag on a pole. Cloth = displaced grid, wave amplitude grows toward the fly;
// frequencies are integer harmonics of the loop so the motion loops seamlessly.
export const WavingFlag: React.FC<Props> = ({ frame, loopFrames, texture, height = 3, width = 1.4, raise = 1, seed = 0, position, rotationY = 0, outline = 0.02 }) => {
  const geo = useMemo(() => new PlaneGeometry(1, 0.62, 14, 8).translate(0.5, -0.31, 0), []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  const mat = useMemo(
    () => new MeshToonMaterial({ map: texture, gradientMap: gradientMap(3), side: DoubleSide }),
    [texture],
  );
  const w = (frame / loopFrames) * Math.PI * 2;
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = base[i * 3], y = base[i * 3 + 1];
    const z = Math.sin(x * 6.5 - w * 61 + seed) * 0.09 * x + Math.sin(x * 3.1 + y * 4 - w * 43 + seed) * 0.05 * x;
    p.setXYZ(i, x, y - x * x * 0.05, z);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  const r = Math.max(0, Math.min(1.2, raise));
  if (r <= 0.001) return null;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Toon geometry={pole} color="#3a2a22" outline={outline} scale={[1, height * Math.min(1, r * 1.6), 1]} />
      <group position={[0.03, height * (0.35 + 0.65 * Math.min(1, r)), 0]} scale={width * Math.min(1, r * 1.3)}>
        <mesh geometry={geo} material={mat} castShadow />
      </group>
      <Toon geometry={pole} color="#f6c33f" outline={0} scale={[2.2, 0.06, 2.2]} position={[0, height, 0]} />
    </group>
  );
};

export const poleMat = () => toon("#3a2a22");
