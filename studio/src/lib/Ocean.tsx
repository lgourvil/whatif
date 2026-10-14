import React, { useMemo } from "react";
import { Color, PlaneGeometry, type BufferAttribute } from "three";
import { toon } from "./ToonMaterial";

type Props = {
  frame: number;
  loopFrames: number; // waves use integer harmonics of this period → seamless loop
  center: [number, number]; // camera x/z: the patch follows the camera, snapped to its grid
  color: string;
  deep?: string;
  size?: number;
  segments?: number;
  amp?: number;
  visible?: boolean;
};

// Faceted low-poly sea: a CPU-displaced grid (closed-form waves) + a flat far plane.
// Vertex colors darken troughs and whiten crests for a cheap stylized foam.
export const Ocean: React.FC<Props> = ({ frame, loopFrames, center, color, deep = "#0d5d7a", size = 520, segments = 110, amp = 1, visible = true }) => {
  const geo = useMemo(() => {
    const g = new PlaneGeometry(size, size, segments, segments).rotateX(-Math.PI / 2);
    const n = g.attributes.position.count;
    g.setAttribute("color", new (g.attributes.position.constructor as typeof BufferAttribute)(new Float32Array(n * 3), 3));
    return g;
  }, [size, segments]);
  const cell = size / segments;
  const cx = Math.round(center[0] / cell) * cell;
  const cz = Math.round(center[1] / cell) * cell;
  const w = (frame / loopFrames) * Math.PI * 2;
  const pos = geo.attributes.position as BufferAttribute;
  const col = geo.attributes.color as BufferAttribute;
  const base = useMemo(() => new Color(color), [color]);
  const dark = useMemo(() => new Color(deep), [deep]);
  const foam = useMemo(() => new Color("#e9fbff"), []);
  const tmp = new Color();
  const half = size / 2;
  for (let i = 0; i < pos.count; i++) {
    const ix = i % (segments + 1);
    const iz = Math.floor(i / (segments + 1));
    const lx = -half + ix * cell;
    const lz = -half + iz * cell;
    const x = lx + cx;
    const z = lz + cz;
    const h =
      0.55 * Math.sin(x * 0.045 + z * 0.02 + w * 37) +
      0.35 * Math.sin(-x * 0.03 + z * 0.06 + w * 29) +
      0.22 * Math.sin(x * 0.11 - z * 0.09 + w * 53) +
      0.12 * Math.sin(x * 0.19 + z * 0.17 + w * 71);
    // calmer near the camera so the hull never clips, rougher toward the horizon
    const d = Math.sqrt(lx * lx + lz * lz);
    const near = Math.min(1, 0.45 + d / 120);
    pos.setXYZ(i, lx, h * amp * near, lz);
    const t = (h + 1.2) / 2.4;
    tmp.copy(dark).lerp(base, Math.min(1, t * 1.25));
    if (h > 0.78) tmp.lerp(foam, Math.min(1, (h - 0.78) * 2.5));
    col.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  geo.computeBoundingSphere();

  const mat = toon("#ffffff", { vertexColors: true, steps: 4 });
  const farMat = toon(deep, { steps: 3 });
  return (
    <group visible={visible}>
      <mesh geometry={geo} material={mat} position={[cx, 0, cz]} />
      <mesh material={farMat} position={[cx, -0.6, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[9000, 9000]} />
      </mesh>
    </group>
  );
};
