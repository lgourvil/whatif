import React from "react";
import type { BufferGeometry, ColorRepresentation, Material } from "three";
import { OUTLINES, outlineGeometry, outlineMaterial, toon } from "./ToonMaterial";

type Props = {
  geometry: BufferGeometry;
  color?: ColorRepresentation;
  material?: Material;
  outline?: number; // thickness in world units, 0 = none
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  castShadow?: boolean;
  receiveShadow?: boolean;
};

// A flat-shaded toon mesh + optional inverted-hull outline, in one tag.
export const Toon: React.FC<Props> = ({
  geometry, color = "#ffffff", material, outline = 0.035, position, rotation, scale,
  castShadow = true, receiveShadow = true,
}) => (
  <group position={position} rotation={rotation} scale={scale}>
    <mesh geometry={geometry} material={material ?? toon(color)} castShadow={castShadow} receiveShadow={receiveShadow} />
    {OUTLINES && outline > 0 ? <mesh geometry={outlineGeometry(geometry)} material={outlineMaterial(outline)} /> : null}
  </group>
);
