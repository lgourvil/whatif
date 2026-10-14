import React, { useMemo } from "react";
import {
  Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh, Object3D, type BufferGeometry,
} from "three";
import { hash, noise3 } from "./noise";
import { OUTLINES, outlineGeometry, outlineMaterial, toon } from "./ToonMaterial";

export type IslandSpec = {
  seed: number;
  radius: number;
  height: number;
  stretch?: [number, number]; // x/z elongation
  volcano?: boolean;
  sharp?: number; // profile exponent: <1 plateau-ish, >1 peaky
  palms?: number;
  colors?: { sand: string; low: string; high: string; rock: string };
};

const DEF_COLORS = { sand: "#f2d59a", low: "#3fae5a", high: "#24804a", rock: "#7a5a48" };

// Radial height profile in local units (same function used for palms placement).
const profile = (spec: IslandSpec, nx: number, nz: number, ny: number) => {
  const sharp = spec.sharp ?? 1.4;
  const n = noise3(nx * 2.2 + spec.seed, ny * 2.2, nz * 2.2 - spec.seed);
  let y = Math.pow(Math.max(0, ny), sharp) * (1 + n * 0.3);
  if (spec.volcano && ny > 0.9) y -= (ny - 0.9) * 2.2;
  return { y, n };
};

// Low-poly island: displaced icosphere (flat faces), vertex colors by altitude,
// sea-level beach ring, optional crater. Geometry is built once per spec.
export const islandGeometry = (spec: IslandSpec): BufferGeometry => {
  const g = new IcosahedronGeometry(1, 4);
  const p = g.attributes.position;
  const colors: number[] = [];
  const c = { ...DEF_COLORS, ...(spec.colors ?? {}) };
  const sand = new Color(c.sand), low = new Color(c.low), high = new Color(c.high), rock = new Color(c.rock);
  const tmp = new Color();
  const [sx, sz] = spec.stretch ?? [1, 1];
  for (let i = 0; i < p.count; i++) {
    const nx = p.getX(i), ny = p.getY(i), nz = p.getZ(i);
    const { y, n } = profile(spec, nx, nz, ny);
    const rr = spec.radius * (1 + n * 0.12);
    const h = ny < 0 ? -2 : y * spec.height - 0.6;
    p.setXYZ(i, nx * rr * sx, h, nz * rr * sz);
    const a = h / spec.height;
    if (a < 0.04) tmp.copy(sand);
    else if (a < 0.45) tmp.copy(low).lerp(high, a / 0.45);
    else tmp.copy(high).lerp(rock, Math.min(1, (a - 0.45) * (spec.volcano ? 2.2 : 0.8)));
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
};

const palmTrunk = new CylinderGeometry(0.12, 0.2, 3.2, 5).translate(0, 1.6, 0);
const palmLeaves = new ConeGeometry(1.6, 0.9, 6).translate(0, 3.3, 0);

// Instanced palms scattered on the lower slopes.
const Palms: React.FC<{ spec: IslandSpec }> = ({ spec }) => {
  const meshes = useMemo(() => {
    const count = spec.palms ?? 0;
    const trunks = new InstancedMesh(palmTrunk, toon("#8a5a3a"), count);
    const leaves = new InstancedMesh(palmLeaves, toon("#2f9e57"), count);
    const o = new Object3D();
    const [sx, sz] = spec.stretch ?? [1, 1];
    for (let i = 0; i < count; i++) {
      const a = hash(spec.seed * 31 + i) * Math.PI * 2;
      const ny = 0.12 + hash(spec.seed * 17 + i * 3) * 0.25;
      const r = Math.sqrt(1 - ny * ny);
      const nx = Math.cos(a) * r, nz = Math.sin(a) * r;
      const { y, n } = profile(spec, nx, nz, ny);
      const rr = spec.radius * (1 + n * 0.12);
      o.position.set(nx * rr * sx * 0.97, y * spec.height - 0.8, nz * rr * sz * 0.97);
      o.rotation.set(hash(i * 5.1) * 0.3 - 0.15, a, hash(i * 2.7) * 0.3 - 0.15);
      o.scale.setScalar((0.8 + hash(i * 9.3) * 0.6) * Math.max(1, spec.radius / 30));
      o.updateMatrix();
      trunks.setMatrixAt(i, o.matrix);
      leaves.setMatrixAt(i, o.matrix);
    }
    trunks.castShadow = leaves.castShadow = true;
    return { trunks, leaves };
  }, [spec]);
  return (
    <>
      <primitive object={meshes.trunks} />
      <primitive object={meshes.leaves} />
    </>
  );
};

type Props = { spec: IslandSpec; position: [number, number, number]; rotationY?: number; children?: React.ReactNode; outline?: number };

export const Island: React.FC<Props> = ({ spec, position, rotationY = 0, children, outline = 0.25 }) => {
  const geo = useMemo(() => islandGeometry(spec), [spec]);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh geometry={geo} material={toon("#ffffff", { vertexColors: true, steps: 3 })} castShadow receiveShadow />
      {OUTLINES && outline > 0 ? <mesh geometry={outlineGeometry(geo)} material={outlineMaterial(outline)} /> : null}
      <Palms spec={spec} />
      {children}
    </group>
  );
};

// Height of an island surface at its local top (for planting flags).
export const islandTop = (spec: IslandSpec) => spec.height * (spec.volcano ? 0.78 : 0.95) - 0.6;
