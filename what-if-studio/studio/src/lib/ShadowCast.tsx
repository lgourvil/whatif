import React, {createContext, useLayoutEffect, useRef} from 'react';
import * as THREE from 'three';

/** When set, descendants render as flat shadow-coloured silhouettes (used by <Shadowed/>). */
export const ShadowCtx = createContext<{color: THREE.ColorRepresentation} | null>(null);

/** Projection onto the plane y=h along the direction `light` (unit vector pointing from ground to light). */
export const projectionMatrix = (light: THREE.Vector3, h: number) => {
  const ly = Math.max(0.12, light.y);
  const kx = light.x / ly, kz = light.z / ly;
  return new THREE.Matrix4().set(
    1, -kx, 0, kx * h,
    0, 0, 0, h,
    0, -kz, 1, kz * h,
    0, 0, 0, 1,
  );
};

type Props = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  light: THREE.Vector3;
  color: THREE.ColorRepresentation;
  y?: number;
  castShadow?: boolean;
  children: React.ReactNode;
};

/** Cheap deterministic planar shadows: renders children normally + once more flattened onto the ground. */
export const Shadowed: React.FC<Props> = ({position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, light, color, y = 0.04, castShadow = true, children}) => {
  const ref = useRef<THREE.Group>(null);
  const local = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(scale, scale, scale),
  );
  const m = projectionMatrix(light, y).multiply(local);
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.matrixAutoUpdate = false;
    g.matrix.copy(m);
    g.matrixWorldNeedsUpdate = true;
  });
  return (
    <>
      <group position={position} rotation={rotation} scale={scale}>{children}</group>
      {castShadow && (
        <ShadowCtx.Provider value={{color}}>
          <group ref={ref}>{children}</group>
        </ShadowCtx.Provider>
      )}
    </>
  );
};
