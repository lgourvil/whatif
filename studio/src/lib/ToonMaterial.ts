import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  BackSide,
  Color,
  DataTexture,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  type BufferGeometry,
  type ColorRepresentation,
} from "three";

// Set to false to drop every inverted-hull outline (perf fallback).
export const OUTLINES = true;

const gradients = new Map<number, DataTexture>();

// 3–4 step toon ramp. Steps are slightly lifted so shadows never go pure black.
export const gradientMap = (steps: 3 | 4 = 3): DataTexture => {
  const cached = gradients.get(steps);
  if (cached) return cached;
  const values = steps === 3 ? [90, 175, 255] : [70, 140, 200, 255];
  const tex = new DataTexture(new Uint8Array(values), values.length, 1, RedFormat);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  gradients.set(steps, tex);
  return tex;
};

const toonCache = new Map<string, MeshToonMaterial>();

type ToonOpts = {
  steps?: 3 | 4;
  emissive?: ColorRepresentation;
  emissiveIntensity?: number;
  vertexColors?: boolean;
  flat?: boolean;
  transparent?: boolean;
  opacity?: number;
  doubleSide?: boolean;
};

// Shared, cached toon material — identical params return the same instance.
export const toon = (color: ColorRepresentation, opts: ToonOpts = {}): MeshToonMaterial => {
  const key = `${new Color(color).getHexString()}|${JSON.stringify(opts)}`;
  const cached = toonCache.get(key);
  if (cached) return cached;
  const m = new MeshToonMaterial({
    color,
    gradientMap: gradientMap(opts.steps ?? 3),
    vertexColors: opts.vertexColors ?? false,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
  // flatShading exists on MeshToonMaterial at runtime but is missing in some typings.
  (m as unknown as { flatShading: boolean }).flatShading = opts.flat ?? true;
  if (opts.emissive) {
    m.emissive = new Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  if (opts.doubleSide) m.side = 2;
  toonCache.set(key, m);
  return m;
};

const outlineCache = new Map<string, MeshBasicMaterial>();

// Inverted-hull outline: back faces pushed along their normal, unlit, dark.
// Normal-push (not uniform scale) keeps the line width constant on any shape.
export const outlineMaterial = (thickness = 0.04, color: ColorRepresentation = "#14101a"): MeshBasicMaterial => {
  const key = `${thickness}|${new Color(color).getHexString()}`;
  const cached = outlineCache.get(key);
  if (cached) return cached;
  const m = new MeshBasicMaterial({ color, side: BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uThickness = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uThickness;")
      .replace("#include <begin_vertex>", "vec3 transformed = vec3(position) + normalize(normal) * uThickness;");
  };
  m.customProgramCacheKey = () => `outline-${thickness}`;
  outlineCache.set(key, m);
  return m;
};

const hullCache = new WeakMap<BufferGeometry, BufferGeometry>();

// Welded, smooth-normal copy of a geometry for the inverted hull. Flat-shaded meshes
// have split normals that would tear the outline open at every edge.
export const outlineGeometry = (geo: BufferGeometry): BufferGeometry => {
  const hit = hullCache.get(geo);
  if (hit) return hit;
  const g = geo.clone();
  for (const name of Object.keys(g.attributes)) if (name !== "position") g.deleteAttribute(name);
  const welded = mergeVertices(g, 1e-3);
  welded.computeVertexNormals();
  hullCache.set(geo, welded);
  return welded;
};
