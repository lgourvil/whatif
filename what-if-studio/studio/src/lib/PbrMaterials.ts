import * as THREE from 'three';

/**
 * Procedural PBR texture sets (albedo + normal + roughness[/AO/metal]) generated once in code
 * with tileable value-noise fBm / Worley, deterministic (integer hashes, no Math.random).
 * Used when no CC0 scan is available offline. Scale: one tile ≈ `meters` (default 2 m).
 */

const hash2 = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
};

/** Tileable value noise with integer period p. */
const vnoise = (x: number, y: number, p: number, s: number) => {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (a: number) => ((a % p) + p) % p;
  const a = hash2(m(xi), m(yi), s), b = hash2(m(xi + 1), m(yi), s);
  const c = hash2(m(xi), m(yi + 1), s), d = hash2(m(xi + 1), m(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

/** fBm in [0,1], tileable: (u,v) in [0,1), base frequency f (integer). */
export const fbm = (u: number, v: number, f: number, oct: number, s: number, gain = 0.5) => {
  let a = 0.5, sum = 0, norm = 0, fr = f;
  for (let o = 0; o < oct; o++) {
    sum += a * vnoise(u * fr, v * fr, fr, s + o * 17);
    norm += a; a *= gain; fr *= 2;
  }
  return sum / norm;
};

/** Tileable Worley: returns [F1, F2, cellId] for cell frequency f. */
export const worley = (u: number, v: number, f: number, s: number): [number, number, number] => {
  const x = u * f, y = v * f;
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const mx = ((cx % f) + f) % f, my = ((cy % f) + f) % f;
    const px = cx + hash2(mx, my, s), py = cy + hash2(mx, my, s + 1);
    const d = Math.hypot(px - x, py - y);
    if (d < d1) { d2 = d1; d1 = d; id = hash2(mx, my, s + 2); } else if (d < d2) d2 = d;
  }
  return [d1, d2, id];
};

type Px = {r: number; g: number; b: number; h: number; rough: number; ao?: number; metal?: number};
export type TexSet = {map: THREE.DataTexture; normalMap: THREE.DataTexture; roughnessMap: THREE.DataTexture};

const toSRGB8 = (c: number) => Math.round(Math.pow(Math.min(1, Math.max(0, c)), 1 / 2.2) * 255);

export const makeTexSet = (size: number, fn: (u: number, v: number) => Px, normalStrength = 2): TexSet => {
  const n = size * size;
  const alb = new Uint8Array(n * 4), orm = new Uint8Array(n * 4), nor = new Uint8Array(n * 4);
  const hgt = new Float32Array(n);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = fn(x / size, y / size);
    const i = y * size + x;
    alb[i * 4] = toSRGB8(p.r); alb[i * 4 + 1] = toSRGB8(p.g); alb[i * 4 + 2] = toSRGB8(p.b); alb[i * 4 + 3] = 255;
    orm[i * 4] = Math.round((p.ao ?? 1) * 255); orm[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, p.rough)) * 255);
    orm[i * 4 + 2] = Math.round((p.metal ?? 0) * 255); orm[i * 4 + 3] = 255;
    hgt[i] = p.h;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const H = (xx: number, yy: number) => hgt[((yy + size) % size) * size + ((xx + size) % size)];
    const dx = (H(x + 1, y) - H(x - 1, y)) * normalStrength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * normalStrength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * size + x) * 4;
    nor[i] = Math.round((-dx / l * 0.5 + 0.5) * 255);
    nor[i + 1] = Math.round((dy / l * 0.5 + 0.5) * 255);
    nor[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
    nor[i + 3] = 255;
  }
  const mk = (data: Uint8Array, srgb: boolean) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return {map: mk(alb, true), normalMap: mk(nor, false), roughnessMap: mk(orm, false)};
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const RECIPES: Record<string, () => TexSet> = {
  asphalt: () => makeTexSet(1024, (u, v) => {
    const [f1, f2, id] = worley(u, v, 180, 11);
    const stone = sstep(0.42, 0.18, f1) * (0.4 + 0.6 * hash2(Math.floor(id * 1e6), 3, 5));
    const fine = fbm(u, v, 64, 4, 3);
    const patch = fbm(u, v, 3, 5, 21);
    const oil = sstep(0.66, 0.8, fbm(u, v, 4, 5, 77)) * 0.6;
    const crack = sstep(0.006, 0.0, Math.abs(fbm(u, v, 6, 5, 91) - 0.5)) * sstep(0.62, 0.75, fbm(u, v, 2, 3, 13)) * 0.6;
    let g = 0.075 + stone * 0.035 + (fine - 0.5) * 0.02 + (patch - 0.5) * 0.015;
    g *= 1 - oil * 0.45; g *= 1 - crack * 0.6;
    return {r: g * 1.0, g: g * 0.99, b: g * 1.02, h: stone * 0.6 + fine * 0.5 - crack * 1.5, rough: 0.92 - stone * 0.12 - oil * 0.42 + (fine - 0.5) * 0.08};
  }, 3),
  concrete: () => makeTexSet(512, (u, v) => {
    const m = fbm(u, v, 4, 6, 5);
    const pores = sstep(0.12, 0.04, worley(u, v, 90, 8)[0]) * (hash2(Math.floor(u * 90), Math.floor(v * 90), 2) > 0.6 ? 1 : 0);
    const stain = sstep(0.6, 0.8, fbm(u, v, 3, 4, 44));
    let g = 0.38 + (m - 0.5) * 0.12 - pores * 0.12 - stain * 0.1;
    return {r: g * 1.02, g: g, b: g * 0.96, h: m * 0.4 - pores * 0.8, rough: 0.82 + (m - 0.5) * 0.1 - stain * 0.15};
  }, 2.5),
  grass: () => makeTexSet(512, (u, v) => {
    const blades = fbm(u, v * 0.5, 96, 3, 4);
    const big = fbm(u, v, 4, 5, 9);
    const dry = sstep(0.5, 0.75, fbm(u, v, 6, 4, 31));
    const r = lerp(0.05, 0.16, dry) + (blades - 0.5) * 0.03, g = lerp(0.1, 0.13, dry) + (blades - 0.5) * 0.05 + (big - 0.5) * 0.03, b = lerp(0.025, 0.05, dry);
    return {r, g, b, h: blades, rough: 0.9};
  }, 4),
  soil: () => makeTexSet(512, (u, v) => {
    const fur = 0.5 + 0.5 * Math.sin(v * Math.PI * 2 * 40 + fbm(u, v, 8, 3, 2) * 4);
    const clod = fbm(u, v, 32, 4, 7);
    const stub = sstep(0.7, 0.85, fbm(u * 1, v, 64, 2, 12)) * 0.6;
    const c = 0.11 + clod * 0.06 + fur * 0.03;
    return {r: c * 1.25 + stub * 0.08, g: c * 0.98 + stub * 0.07, b: c * 0.72 + stub * 0.03, h: fur * 0.7 + clod * 0.4, rough: 0.95};
  }, 3),
  /** neutral painted metal with grime: multiply by material color */
  paint: () => makeTexSet(512, (u, v) => {
    // subtle: orange peel, faint smudges, rare scratches
    const peel = fbm(u, v, 48, 3, 2);
    const smudge = fbm(u, v, 3, 5, 6);
    const drip = sstep(0.55, 0.8, fbm(u * 0.3, v * 3, 6, 4, 19));
    const scratch = sstep(0.006, 0.0, Math.abs(fbm(u * 3, v * 0.2, 8, 3, 23) - 0.5));
    const c = 0.93 - smudge * 0.07 - drip * 0.05 + scratch * 0.04;
    return {r: c, g: c, b: c * 0.98, h: peel * 0.08 - scratch * 0.2, rough: 0.34 + smudge * 0.2 + drip * 0.1 - scratch * 0.05};
  }, 1.2),
  plaster: () => makeTexSet(512, (u, v) => {
    const s = fbm(u, v, 24, 5, 3);
    const dirt = sstep(0.45, 0.85, fbm(u, v * 0.4, 3, 4, 8)) * (1 - v * 0.6);
    const c = 0.62 + (s - 0.5) * 0.08 - dirt * 0.18;
    return {r: c * 1.03, g: c * 0.98, b: c * 0.9, h: s, rough: 0.9};
  }, 3),
  roofTiles: () => makeTexSet(512, (u, v) => {
    const rows = 12, cols = 10;
    const row = Math.floor(v * rows), off = (row % 2) * 0.5;
    const x = u * cols + off, xi = Math.floor(x), xf = x - xi, yf = v * rows - row;
    const tile = Math.sin(xf * Math.PI);
    const overlap = sstep(0.0, 0.15, yf) * (1 - sstep(0.85, 1.0, yf));
    const tint = hash2(xi % cols, row, 4);
    const moss = sstep(0.62, 0.8, fbm(u, v, 5, 4, 40));
    const r = lerp(0.36, 0.5, tint) * (0.7 + 0.3 * tile), g = lerp(0.14, 0.2, tint) * (0.7 + 0.3 * tile), b = 0.08;
    return {r: lerp(r, 0.12, moss * 0.5), g: lerp(g, 0.13, moss * 0.5), b: lerp(b, 0.06, moss * 0.5), h: tile * overlap, rough: 0.8};
  }, 6),
  wood: () => makeTexSet(512, (u, v) => {
    const ring = 0.5 + 0.5 * Math.sin((v * 34 + fbm(u, v, 4, 4, 2) * 6) * Math.PI * 2);
    const grain = fbm(u * 0.1, v, 64, 3, 5);
    const weather = fbm(u, v, 3, 4, 9);
    const c = lerp(0.32, 0.5, ring * 0.4 + grain * 0.6);
    const grey = sstep(0.4, 0.7, weather);
    return {r: lerp(c * 1.0, 0.3, grey), g: lerp(c * 0.78, 0.28, grey), b: lerp(c * 0.52, 0.25, grey), h: grain * 0.5 + ring * 0.3, rough: 0.85};
  }, 3),
  rubber: () => makeTexSet(256, (u, v) => {
    const n = fbm(u, v, 32, 4, 1);
    const c = 0.025 + n * 0.015;
    return {r: c, g: c, b: c, h: n, rough: 0.85};
  }, 2),
  bark: () => makeTexSet(256, (u, v) => {
    const s = fbm(u * 4, v * 0.5, 8, 5, 3);
    const c = 0.12 + s * 0.12;
    return {r: c * 1.1, g: c, b: c * 0.85, h: s, rough: 0.95};
  }, 5),
  foliage: () => makeTexSet(256, (u, v) => {
    const [f1, , id] = worley(u, v, 24, 3);
    const leaf = sstep(0.55, 0.15, f1);
    const t = hash2(Math.floor(id * 1e6), 1, 2);
    const k = 0.65 + 0.35 * leaf;
    return {r: lerp(0.045, 0.075, t) * k, g: lerp(0.07, 0.1, t) * k, b: 0.03 * k, h: leaf * 0.6, rough: 0.75};
  }, 3),
};

const cache = new Map<string, TexSet>();
export const texSet = (name: keyof typeof RECIPES | string): TexSet => {
  let t = cache.get(name);
  if (!t) { t = RECIPES[name](); cache.set(name, t); }
  return t;
};

/** Standard PBR material from a procedural set, with UV repeat (rx, ry) and color tint. */
export const pbr = (name: string, opts: {repeat?: [number, number]; color?: THREE.ColorRepresentation; normalScale?: number; roughness?: number; metalness?: number; envMapIntensity?: number; physical?: Partial<THREE.MeshPhysicalMaterialParameters>} = {}) => {
  const s = texSet(name);
  const rep = opts.repeat ?? [1, 1];
  const c = (t: THREE.Texture) => {
    const k = t.clone();
    k.repeat.set(rep[0], rep[1]);
    k.needsUpdate = true;
    return k;
  };
  const params = {
    map: c(s.map), normalMap: c(s.normalMap), roughnessMap: c(s.roughnessMap),
    color: opts.color ?? '#ffffff', roughness: opts.roughness ?? 1, metalness: opts.metalness ?? 0,
    normalScale: new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1),
    envMapIntensity: opts.envMapIntensity ?? 1,
  };
  return opts.physical ? new THREE.MeshPhysicalMaterial({...params, ...opts.physical}) : new THREE.MeshStandardMaterial(params);
};
