import React, { useMemo } from "react";
import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, PlaneGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Particles } from "../../lib/Particles";
import { hash, keyed } from "../../lib/noise";
import { OUTLINES, outlineGeometry, outlineMaterial, toon } from "../../lib/ToonMaterial";
import { PALETTES } from "../../lib/palettes";
import { W, boatBob, boatX, boatZ, SAIL_START } from "./world";

const PAL = PALETTES.guadeloupeEmpire;

const paint = (g: BufferGeometry, fn: (x: number, y: number, z: number, face: number) => string) => {
  const ng = g.index ? g.toNonIndexed() : g;
  const p = ng.attributes.position;
  const cols: number[] = [];
  const c = new Color();
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    c.set(fn(cx, cy, cz, i / 3));
    for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
  }
  ng.setAttribute("color", new Float32BufferAttribute(cols, 3));
  ng.deleteAttribute("uv");
  ng.deleteAttribute("normal");
  return ng;
};

// Gommier-style sailing canoe (original design): pointed, upswept hull + madras sail.
export const makeBoatGeometry = (hullColor: string, trim: string, boom = 0, mastZ = -0.9) => {
  const hull = new BoxGeometry(1.5, 0.75, 7, 2, 2, 12);
  const p = hull.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const zn = Math.abs(z / 3.5);
    const taper = 1 - Math.pow(zn, 2.2) * 0.94;
    const bottom = y < 0 ? 0.5 : 1;
    p.setXYZ(i, x * taper * bottom, y + (y > 0 ? 0.42 * Math.pow(zn, 3) : 0.1 * zn), z);
  }
  const hullC = paint(hull, (_x, y) => (y > 0.2 ? trim : hullColor));
  const mast = paint(new CylinderGeometry(0.06, 0.08, 6.2, 5).translate(0, 3.4, mastZ), () => "#6b4a33");
  // Sail: grid folded into a triangle (luff on the mast, foot on the boom), slight billow.
  const sail = new PlaneGeometry(1, 1, 6, 7).translate(0.5, 0.5, 0);
  const sp = sail.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const u = sp.getX(i), v = sp.getY(i);
    const reach = u * (1 - v) * 3.6;
    const bil = Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.2)) * 0.4;
    const y = 0.9 + v * 5.4;
    sp.setXYZ(i, Math.sin(boom) * reach + Math.cos(boom) * bil, y, mastZ + Math.cos(boom) * reach - Math.sin(boom) * bil);
  }
  const sailC = paint(sail, (x, y, z) => {
    const a = Math.floor((y - 0.9) / 0.75) + Math.floor(Math.hypot(x, z - mastZ) / 0.55);
    return a % 2 === 0 ? PAL.madrasRed : PAL.madrasYellow;
  });
  // second side of the sail (so it reads from both sides)
  const sailB = sailC.clone();
  const idx = sailB.attributes.position;
  for (let i = 0; i < idx.count; i += 3) {
    for (const name of ["position", "color"]) {
      const a = sailB.attributes[name];
      const tmp = [a.getX(i + 1), a.getY(i + 1), a.getZ(i + 1)];
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
      a.setXYZ(i + 2, tmp[0], tmp[1], tmp[2]);
    }
  }
  const g = mergeGeometries([hullC, mast, sailC, sailB])!;
  g.computeVertexNormals();
  // outline only the solid parts: a welded two-sided sail would collapse its normals
  const solid = mergeGeometries([hullC.clone(), mast.clone()])!;
  hullOnly.set(g, outlineGeometry(solid));
  return g;
};
const hullOnly = new WeakMap<BufferGeometry, BufferGeometry>();
const boatOutline = (g: BufferGeometry) => hullOnly.get(g)!;

const geoCache = new Map<string, BufferGeometry>();
export const boatGeometry = (hull: string, trim: string, boom = 0, mastZ = -0.9) => {
  const k = `${hull}${trim}${boom}${mastZ}`;
  if (!geoCache.has(k)) geoCache.set(k, makeBoatGeometry(hull, trim, boom, mastZ));
  return geoCache.get(k)!;
};

// Fleet: closed-form formation around the player boat; boats "launch" as the empire grows
// and upgrade into big galleon-scale ships for the armada.
const MOORED: [number, number][] = [[-14, -2], [-8.5, 1.5], [-4.6, -5.5], [4.8, -5.2], [9, 1.2], [14.5, -2.4]];
export const FLEET_MAX = 420;
export const fleetCount = (wf: number) =>
  Math.floor(keyed(wf, [[0, 6], [440, 6], [560, 22], [700, 48], [780, 70], [1100, 130], [1230, 260], [1460, FLEET_MAX]]));

const slot = (i: number, armada: number): [number, number] => {
  if (i < MOORED.length) return MOORED[i];
  // spiral fan behind and beside the player (keeps the bow view open)
  const k = i - MOORED.length;
  const r = 20 + Math.sqrt(k) * 9.5 + hash(i * 3.3) * 6;
  const a = (hash(i * 1.7) * 2 - 1) * (2.25 + 0.65 * armada); // 0 = straight behind
  return [Math.sin(a) * r, Math.cos(a) * r - 6];
};

export const Fleet: React.FC<{ wf: number; f: number }> = ({ wf, f }) => {
  const geo = boatGeometry(PAL.lagoon, PAL.madrasYellow);
  const geoB = boatGeometry("#2e5aa8", "#ffffff", 0.5);
  const n = fleetCount(wf);
  const bx = boatX(wf), bz = boatZ(wf);
  const big = keyed(wf, [[1200, 1], [1420, 2.3]]);
  const spread = keyed(wf, [[1200, 1], [1420, 1.9]]);
  const armadaAmt = keyed(wf, [[1150, 0], [1300, 1]]);
  const fn = (variant: number) => (i: number, _fr: number, o: { x: number; y: number; z: number; s: number; ry?: number; rz?: number; rx?: number }) => {
    if (i % 2 !== variant) { o.s = 0; return; }
    const born = i < 6 ? -1 : i;
    const [sx, sz] = slot(i, armadaAmt);
    const appear = born < 0 ? 1 : Math.min(1, Math.max(0, (n - i) / 6));
    const ph = W(f) * (29 + (i % 4) * 8) + i;
    o.x = bx + sx * spread;
    o.z = bz + sz * spread;
    o.y = 0.1 * Math.sin(ph) - (1 - appear) * 3;
    o.s = appear <= 0 ? 0 : big * (0.85 + hash(i * 7.1) * 0.3);
    o.ry = (hash(i * 4.4) - 0.5) * 0.25 + (wf < SAIL_START && i < 6 ? (hash(i) - 0.5) * 1.2 : 0);
    o.rz = 0.04 * Math.sin(ph * 0.8);
    o.rx = 0.02 * Math.sin(ph * 1.1);
  };
  const ol = useMemo(() => outlineMaterial(0.05), []);
  return (
    <>
      {[0, 1].map((v) => (
        <group key={v}>
          <Particles count={FLEET_MAX} geometry={v === 0 ? geo : geoB} material={toon("#ffffff", { vertexColors: true })} frame={f} fn={fn(v)} castShadow />
          {OUTLINES ? <Particles count={FLEET_MAX} geometry={boatOutline(v === 0 ? geo : geoB)} material={ol} frame={f} fn={fn(v)} /> : null}
        </group>
      ))}
    </>
  );
};

// The player's boat (camera rides it after boarding).
export const PlayerBoat: React.FC<{ wf: number; f: number; children?: React.ReactNode }> = ({ wf, f, children }) => {
  // mast stern-side of the camera: the bow view stays open, the sail shows on look-backs
  const geo = boatGeometry("#d8452f", PAL.madrasYellow, -0.95, 0.6);
  const b = boatBob(f);
  return (
    <group position={[boatX(wf), b.y * 0.6, boatZ(wf)]} rotation={[b.pitch, 0, b.roll]}>
      <mesh geometry={geo} material={toon("#ffffff", { vertexColors: true })} castShadow receiveShadow />
      {OUTLINES ? <mesh geometry={boatOutline(geo)} material={outlineMaterial(0.03)} /> : null}
      {/* thwart / bench */}
      <mesh position={[0, 0.42, 2.9]} material={toon("#7a5236")}>
        <boxGeometry args={[1.0, 0.08, 0.35]} />
      </mesh>
      {children}
    </group>
  );
};
