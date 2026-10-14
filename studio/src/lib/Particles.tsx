import React, { useMemo } from "react";
import { Color, InstancedMesh, Object3D, type BufferGeometry, type Material } from "three";

export type ParticleState = {
  x: number; y: number; z: number;
  s: number; // uniform scale, 0 hides the instance
  sx?: number; sy?: number; sz?: number; // optional non-uniform scale multipliers
  rx?: number; ry?: number; rz?: number;
  color?: string;
};

type Props = {
  count: number;
  geometry: BufferGeometry;
  material: Material;
  frame: number;
  // Closed-form particle state: a pure function of (index, frame). No accumulation,
  // so any frame can be rendered alone and in any order.
  fn: (i: number, frame: number, out: ParticleState) => void;
  castShadow?: boolean;
  colored?: boolean;
};

const o = new Object3D();
const c = new Color();

export const Particles: React.FC<Props> = ({ count, geometry, material, frame, fn, castShadow = false, colored = false }) => {
  const mesh = useMemo(() => {
    const m = new InstancedMesh(geometry, material, count);
    m.frustumCulled = false;
    m.castShadow = castShadow;
    return m;
  }, [geometry, material, count, castShadow]);

  const st: ParticleState = { x: 0, y: 0, z: 0, s: 1 };
  for (let i = 0; i < count; i++) {
    st.sx = st.sy = st.sz = 1;
    st.rx = st.ry = st.rz = 0;
    st.color = undefined;
    fn(i, frame, st);
    o.position.set(st.x, st.y, st.z);
    o.rotation.set(st.rx ?? 0, st.ry ?? 0, st.rz ?? 0);
    o.scale.set(st.s * (st.sx ?? 1), st.s * (st.sy ?? 1), st.s * (st.sz ?? 1));
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    if (colored && st.color) mesh.setColorAt(i, c.set(st.color));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return <primitive object={mesh} />;
};
