import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {gradientMap, outlineMaterial} from './ToonMaterial';

export type Inst = {
  p: [number, number, number];
  s: [number, number, number];
  r?: [number, number, number];
  c: THREE.ColorRepresentation;
};

type Props = {
  geometry: THREE.BufferGeometry;
  items: Inst[];
  /** inverted-hull outline as a second instanced mesh (absolute width in metres added to each axis) */
  outline?: number;
  /** 'toon' (lit, flat shaded) or 'basic' (unlit: windows, bulbs, glows) */
  kind?: 'toon' | 'basic';
  additive?: boolean;
  opacity?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  fog?: boolean;
  /** bump to force a matrix/colour refresh when items change every frame */
  version?: number;
};

/**
 * Many toon parts in ONE draw call (+ one for the outline). Big win for cities, forests, crowds of props — draw calls
 * are the bottleneck in headless/software WebGL. Items are static unless `version` changes.
 */
export const InstancedToon: React.FC<Props> = ({geometry, items, outline = 0, kind = 'toon', additive = false, opacity = 1, castShadow = false, receiveShadow = false, fog = true, version = 0}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const hull = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => kind === 'toon'
    ? new THREE.MeshToonMaterial({color: '#ffffff', gradientMap: gradientMap(), flatShading: true} as THREE.MeshToonMaterialParameters)
    : new THREE.MeshBasicMaterial({color: '#ffffff', transparent: additive || opacity < 1, opacity, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !additive && opacity >= 1, fog}), [kind, additive, opacity, fog]);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    const m = ref.current!;
    items.forEach((it, i) => {
      o.position.set(...it.p);
      o.rotation.set(...(it.r ?? [0, 0, 0]));
      o.scale.set(...it.s);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(it.c));
      if (hull.current) {
        o.scale.set(it.s[0] + outline * 2, it.s[1] + outline * 2, it.s[2] + outline * 2);
        o.updateMatrix();
        hull.current.setMatrixAt(i, o.matrix);
      }
    });
    m.count = items.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (hull.current) { hull.current.count = items.length; hull.current.instanceMatrix.needsUpdate = true; }
  }, [items, version, outline]);
  const n = Math.max(1, items.length);
  return (
    <>
      <instancedMesh ref={ref} args={[geometry, mat, n]} castShadow={castShadow} receiveShadow={receiveShadow} frustumCulled={false} />
      {outline > 0 && <instancedMesh ref={hull} args={[geometry, outlineMaterial(), n]} frustumCulled={false} />}
    </>
  );
};
