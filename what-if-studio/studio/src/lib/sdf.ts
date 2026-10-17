import * as THREE from 'three';

/**
 * Tiny SDF toolkit + Surface Nets polygonizer.
 * Used to build seamless organic meshes (hands, bodies, car shells) in code:
 * smooth-union of capsules / ellipsoids gives webbing, knuckles and fillets for free,
 * and the result is a single watertight mesh that can be skinned.
 */

export type V3 = [number, number, number];
export type SDF = (x: number, y: number, z: number) => number;

export const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

/** Capsule with radius varying linearly from ra (at a) to rb (at b) — a "round cone" approximation. */
export const taperCapsule = (a: V3, b: V3, ra: number, rb: number, flat = 1): SDF => {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  return (x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / l2));
    const dx = pax - bax * h, dy = (pay - bay * h) * flat, dz = paz - baz * h;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
  };
};

export const ellipsoid = (c: V3, r: V3): SDF => (x, y, z) => {
  const px = (x - c[0]) / r[0], py = (y - c[1]) / r[1], pz = (z - c[2]) / r[2];
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const k1 = Math.sqrt((px / r[0]) ** 2 + (py / r[1]) ** 2 + (pz / r[2]) ** 2);
  return k1 < 1e-9 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
};

export const roundBox = (c: V3, half: V3, r: number): SDF => (x, y, z) => {
  const qx = Math.abs(x - c[0]) - half[0] + r, qy = Math.abs(y - c[1]) - half[1] + r, qz = Math.abs(z - c[2]) - half[2] + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
};

export type Grid = {min: V3; max: V3; step: number};

/**
 * Naive Surface Nets on a regular grid. Returns smooth-shaded geometry
 * (normals from the SDF gradient, positions projected onto the iso-surface).
 */
export const polygonize = (f: SDF, g: Grid): THREE.BufferGeometry => {
  const {min, max, step} = g;
  const nx = Math.ceil((max[0] - min[0]) / step) + 1;
  const ny = Math.ceil((max[1] - min[1]) / step) + 1;
  const nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const val = new Float32Array(nx * ny * nz);
  const id = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    val[id(i, j, k)] = f(min[0] + i * step, min[1] + j * step, min[2] + k * step);
  }
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos: number[] = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const v = corners.map(([a, b, c]) => val[id(i + a, j + b, k + c)]);
    let mask = 0;
    for (let q = 0; q < 8; q++) if (v[q] < 0) mask |= 1 << q;
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [e0, e1] of edges) {
      const a = v[e0], b = v[e1];
      if ((a < 0) === (b < 0)) continue;
      const t = a / (a - b);
      const c0 = corners[e0], c1 = corners[e1];
      sx += c0[0] + (c1[0] - c0[0]) * t;
      sy += c0[1] + (c1[1] - c0[1]) * t;
      sz += c0[2] + (c1[2] - c0[2]) * t;
      n++;
    }
    cellVert[cid(i, j, k)] = pos.length / 3;
    pos.push(min[0] + (i + sx / n) * step, min[1] + (j + sy / n) * step, min[2] + (k + sz / n) * step);
  }
  const idx: number[] = [];
  // quads across each sign-changing grid edge
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = val[id(i, j, k)] < 0;
    // x edge
    if (i < nx - 1 && (a !== (val[id(i + 1, j, k)] < 0))) {
      const q = [cid(i, j - 1, k - 1), cid(i, j, k - 1), cid(i, j, k), cid(i, j - 1, k)].map((c) => cellVert[c]);
      quad(idx, q, a);
    }
    if (j < ny - 1 && (a !== (val[id(i, j + 1, k)] < 0))) {
      const q = [cid(i - 1, j, k - 1), cid(i - 1, j, k), cid(i, j, k), cid(i, j, k - 1)].map((c) => cellVert[c]);
      quad(idx, q, a);
    }
    if (k < nz - 1 && (a !== (val[id(i, j, k + 1)] < 0))) {
      const q = [cid(i - 1, j - 1, k), cid(i, j - 1, k), cid(i, j, k), cid(i - 1, j, k)].map((c) => cellVert[c]);
      quad(idx, q, a);
    }
  }
  // project onto surface + gradient normals
  const nrm: number[] = [];
  const e = step * 0.5;
  for (let p = 0; p < pos.length; p += 3) {
    let x = pos[p], y = pos[p + 1], z = pos[p + 2];
    for (let it = 0; it < 2; it++) {
      const d = f(x, y, z);
      const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
      const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) / (2 * e) + 1e-9;
      x -= (d * gx) / (2 * e) / gl / gl; y -= (d * gy) / (2 * e) / gl / gl; z -= (d * gz) / (2 * e) / gl / gl;
    }
    pos[p] = x; pos[p + 1] = y; pos[p + 2] = z;
    const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const l = Math.sqrt(gx * gx + gy * gy + gz * gz) + 1e-12;
    nrm.push(gx / l, gy / l, gz / l);
  }
  // orient every triangle consistently with the SDF gradient
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const d = cx * (nrm[a] + nrm[b] + nrm[c]) + cy * (nrm[a + 1] + nrm[b + 1] + nrm[c + 1]) + cz * (nrm[a + 2] + nrm[b + 2] + nrm[c + 2]);
    if (d < 0) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
};

const quad = (idx: number[], q: number[], flip: boolean) => {
  if (q.some((v) => v < 0)) return;
  if (flip) idx.push(q[0], q[1], q[2], q[0], q[2], q[3]);
  else idx.push(q[0], q[2], q[1], q[0], q[3], q[2]);
};

/** Bone segment for distance-based skin weights. */
export type BoneSeg = {a: V3; b: V3; bone: number; reach?: number};

/** Linear-blend skin weights from distance to bone segments (inverse power falloff, top-4). */
export const skinWeights = (geo: THREE.BufferGeometry, segs: BoneSeg[], power = 6) => {
  const p = geo.attributes.position as THREE.BufferAttribute;
  const si = new Uint16Array(p.count * 4), sw = new Float32Array(p.count * 4);
  for (let v = 0; v < p.count; v++) {
    const x = p.getX(v), y = p.getY(v), z = p.getZ(v);
    const w: [number, number][] = [];
    for (const s of segs) {
      const bx = s.b[0] - s.a[0], by = s.b[1] - s.a[1], bz = s.b[2] - s.a[2];
      const l2 = bx * bx + by * by + bz * bz + 1e-12;
      const h = Math.min(1, Math.max(0, ((x - s.a[0]) * bx + (y - s.a[1]) * by + (z - s.a[2]) * bz) / l2));
      const dx = x - s.a[0] - bx * h, dy = y - s.a[1] - by * h, dz = z - s.a[2] - bz * h;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / (s.reach ?? 1) + 1e-5;
      w.push([s.bone, 1 / Math.pow(d, power)]);
    }
    // merge same bone
    const m = new Map<number, number>();
    for (const [b, ww] of w) m.set(b, Math.max(m.get(b) ?? 0, ww));
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = top.reduce((a, [, ww]) => a + ww, 0);
    top.forEach(([b, ww], k) => { si[v * 4 + k] = b; sw[v * 4 + k] = ww / tot; });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
};

/** Laplacian smoothing pass (keeps volume roughly with a small step). */
export const relax = (geo: THREE.BufferGeometry, iters = 1, k = 0.35) => {
  const p = geo.attributes.position as THREE.BufferAttribute;
  const idx = geo.index!.array;
  const nb: Set<number>[] = Array.from({length: p.count}, () => new Set());
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b);
  }
  for (let it = 0; it < iters; it++) {
    const src = (p.array as Float32Array).slice();
    for (let v = 0; v < p.count; v++) {
      if (nb[v].size === 0) continue;
      let sx = 0, sy = 0, sz = 0;
      for (const n of nb[v]) { sx += src[n * 3]; sy += src[n * 3 + 1]; sz += src[n * 3 + 2]; }
      const s = nb[v].size;
      p.setXYZ(v, src[v * 3] + (sx / s - src[v * 3]) * k, src[v * 3 + 1] + (sy / s - src[v * 3 + 1]) * k, src[v * 3 + 2] + (sz / s - src[v * 3 + 2]) * k);
    }
  }
  p.needsUpdate = true;
};
