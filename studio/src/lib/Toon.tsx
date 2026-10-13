import React, {useMemo} from 'react';
import * as THREE from 'three';
import {gradientMap, outlineMaterial} from './ToonMaterial';

type Props = {
  geometry: THREE.BufferGeometry;
  color: THREE.ColorRepresentation;
  outline?: number; // hull scale offset, 0 = none
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  castShadow?: boolean;
  opacity?: number;
};

/** Flat-shaded toon mesh with an inverted-hull outline. */
export const ToonMesh: React.FC<Props> = ({geometry, color, outline = 0.03, position, rotation, scale = 1, castShadow, opacity}) => {
  const sc = typeof scale === 'number' ? ([scale, scale, scale] as [number, number, number]) : scale;
  const hull = useMemo(() => {
    const s = (v: number) => v * (1 + outline);
    return [s(1), s(1), s(1)] as [number, number, number];
  }, [outline]);
  return (
    <group position={position} rotation={rotation} scale={sc}>
      <mesh geometry={geometry} castShadow={castShadow}>
        <meshToonMaterial color={color} gradientMap={gradientMap()} transparent={opacity !== undefined} opacity={opacity ?? 1} />
      </mesh>
      {outline > 0 ? <mesh geometry={geometry} material={outlineMaterial} scale={hull} /> : null}
    </group>
  );
};

export const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const flat = (g: THREE.BufferGeometry) => {
  const n = g.toNonIndexed();
  n.computeVertexNormals();
  return n;
};
export const coneGeo = flat(new THREE.ConeGeometry(0.5, 1, 5));
export const icoGeo = new THREE.IcosahedronGeometry(0.5, 0);
export const cylGeo = flat(new THREE.CylinderGeometry(0.5, 0.5, 1, 7));
