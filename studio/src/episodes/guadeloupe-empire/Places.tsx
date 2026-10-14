import React, { useMemo } from "react";
import { BoxGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh, Object3D, PlaneGeometry, Color } from "three";
import { Island, islandTop, type IslandSpec } from "../../lib/Island";
import { WavingFlag } from "../../lib/Flag";
import { Particles } from "../../lib/Particles";
import { hash, noise3 } from "../../lib/noise";
import { OUTLINES, outlineGeometry, outlineMaterial, toon } from "../../lib/ToonMaterial";
import { bannerTexture } from "../../lib/textures";
import { PALETTES } from "../../lib/palettes";
import { spring } from "remotion";
import { LOOP, boatX, boatZ } from "./world";

const PAL = PALETTES.guadeloupeEmpire;

// ---- conquest targets ----------------------------------------------------------------
export type Place = { name: string; spec: IslandSpec; pos: [number, number, number]; raise: number; flag: number };

export const PLACES: Place[] = [
  { name: "Marie-Galante", spec: { seed: 3, radius: 42, height: 9, sharp: 0.7, palms: 40 }, pos: [-78, 0, -205], raise: 560, flag: 9 },
  { name: "Terre-de-Haut", spec: { seed: 7, radius: 14, height: 16, sharp: 1.5, palms: 10 }, pos: [58, 0, -268], raise: 670, flag: 6 },
  { name: "Terre-de-Bas", spec: { seed: 8, radius: 11, height: 12, sharp: 1.6, palms: 8 }, pos: [84, 0, -290], raise: 690, flag: 5 },
  { name: "La Desirade", spec: { seed: 11, radius: 26, height: 14, stretch: [1.7, 0.6], sharp: 0.9, palms: 18 }, pos: [-95, 0, -365], raise: 705, flag: 7 },
  { name: "Dominica", spec: { seed: 17, radius: 62, height: 72, sharp: 1.25, palms: 60 }, pos: [62, 0, -560], raise: 905, flag: 14 },
  { name: "Martinique", spec: { seed: 23, radius: 58, height: 52, volcano: true, sharp: 1.5, palms: 50 }, pos: [-110, 0, -760], raise: 1100, flag: 13 },
];

// Extra Caribbean islands for "Year 2" — flags pop one after another.
for (let k = 0; k < 14; k++) {
  const side = k % 2 === 0 ? -1 : 1;
  const r = 8 + hash(k * 3.7) * 26;
  PLACES.push({
    name: `isle${k}`,
    spec: { seed: 40 + k, radius: r, height: r * (0.4 + hash(k) * 0.9), sharp: 1 + hash(k * 2.2), palms: 8 + Math.floor(r / 3) },
    pos: [side * (70 + hash(k * 9.1) * 220), 0, -820 - k * 26 - hash(k * 5.5) * 30],
    raise: 1235 + k * 13,
    flag: 8 + r * 0.35,
  });
}

const raiseAt = (wf: number, at: number) => (wf < at ? 0 : spring({ frame: wf - at, fps: 30, config: { damping: 9, stiffness: 120 } }));

export const Islands: React.FC<{ wf: number; f: number }> = ({ wf, f }) => {
  const tex = bannerTexture();
  return (
    <>
      {PLACES.map((pl, i) => (
        <Island key={pl.name} spec={pl.spec} position={pl.pos} outline={Math.max(0.15, pl.spec.radius * 0.006)}>
          <WavingFlag frame={f} loopFrames={LOOP} texture={tex} height={pl.flag * 1.6} width={pl.flag} raise={raiseAt(wf, pl.raise)} seed={i} position={[0, islandTop(pl.spec) - 1, 0]} rotationY={0.6} outline={pl.flag * 0.012} />
        </Island>
      ))}
    </>
  );
};

// Flag positions for confetti bursts
export const flagEvents = () =>
  PLACES.map((pl) => ({ at: pl.raise, pos: [pl.pos[0], pl.pos[1] + islandTop(pl.spec) + pl.flag * 1.3, pl.pos[2]] as [number, number, number], size: pl.flag }));

// ---- home: Basse-Terre beach + the volcano behind ---------------------------------------
const SOUFRIERE: IslandSpec = { seed: 2, radius: 150, height: 120, volcano: true, sharp: 1.6, palms: 70 };

export const HomeBeach: React.FC = () => {
  const ground = useMemo(() => {
    const g = new PlaneGeometry(420, 170, 84, 34).rotateX(-Math.PI / 2).translate(0, 0, 85 + 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const shore = Math.min(1, Math.max(0, (z - 3) / 4.5));
      let y = -1.4 + shore * 2.0 + Math.min(1, Math.max(0, (z - 8) / 14)) * 0.35;
      if (z > 30) y += (z - 30) * 0.09 + noise3(x * 0.05, 0, z * 0.05) * 2.2 * Math.min(1, (z - 30) / 20);
      y += noise3(x * 0.2, 1, z * 0.2) * 0.12;
      p.setY(i, y);
    }
    const ng = g.toNonIndexed();
    const q = ng.attributes.position;
    const cols: number[] = [];
    const sand = new Color(PAL.sand), wet = new Color("#c9a970"), grass = new Color(PAL.jungle), c = new Color();
    for (let i = 0; i < q.count; i += 3) {
      const z = (q.getZ(i) + q.getZ(i + 1) + q.getZ(i + 2)) / 3;
      const x = (q.getX(i) + q.getX(i + 1) + q.getX(i + 2)) / 3;
      const edge = 26 + noise3(x * 0.08, 2, 0) * 5;
      if (z < 5.2) c.copy(wet);
      else if (z < edge) c.copy(sand).offsetHSL(0, 0, (hash(i) - 0.5) * 0.04);
      else c.copy(grass).offsetHSL(0, 0, (hash(i) - 0.5) * 0.06);
      for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
    }
    ng.setAttribute("color", new Float32BufferAttribute(cols, 3));
    ng.computeVertexNormals();
    return ng;
  }, []);

  const palms = useMemo(() => {
    const trunk = new CylinderGeometry(0.14, 0.24, 4.2, 5).translate(0, 2.1, 0);
    const leaves = new ConeGeometry(2.1, 1.1, 7).translate(0, 4.3, 0);
    const n = 70;
    const tm = new InstancedMesh(trunk, toon("#8a5a3a"), n);
    const lm = new InstancedMesh(leaves, toon(PAL.jungle), n);
    const o = new Object3D();
    for (let i = 0; i < n; i++) {
      const x = (hash(i * 1.9) * 2 - 1) * 150 + (hash(i * 1.9) < 0.5 ? -9 : 9);
      const z = 21 + hash(i * 4.2) * 22;
      o.position.set(x, 0.75 + Math.max(0, z - 30) * 0.09, z);
      o.rotation.set((hash(i) - 0.5) * 0.35, hash(i * 2) * 6, (hash(i * 3) - 0.5) * 0.35);
      o.scale.setScalar(0.85 + hash(i * 5) * 0.5);
      o.updateMatrix();
      tm.setMatrixAt(i, o.matrix);
      lm.setMatrixAt(i, o.matrix);
    }
    tm.castShadow = lm.castShadow = true;
    return { tm, lm };
  }, []);

  return (
    <group>
      <mesh geometry={ground} material={toon("#ffffff", { vertexColors: true })} receiveShadow />
      <primitive object={palms.tm} />
      <primitive object={palms.lm} />
      <Island spec={SOUFRIERE} position={[-40, 0, 230]} outline={0.6} />
    </group>
  );
};

// ---- "Year 9": Miami skyline -------------------------------------------------------------
const TOWER = new BoxGeometry(1, 1, 1, 1, 1, 1).translate(0, 0.5, 0);
const PASTELS = ["#f7a6b6", "#9fe2d4", "#fbe39a", "#bfa8f0", "#f4f1e8", "#8fd0f2"];
const SKY_Z = -1290;
const CAPITAL = new BoxGeometry(20, 140, 20);
export const Skyline: React.FC<{ wf: number; f: number }> = ({ wf, f }) => {
  const n = 90;
  const fn = (i: number, _f: number, o: { x: number; y: number; z: number; s: number; sx?: number; sy?: number; sz?: number; color?: string }) => {
    const x = (i / n - 0.5) * 640 + (hash(i * 2.3) - 0.5) * 8;
    const center = 1 - Math.min(1, Math.abs(x) / 320);
    o.x = x;
    o.y = 0;
    o.z = SKY_Z - hash(i * 7.7) * 60;
    o.s = 1;
    o.sx = 8 + hash(i * 3.1) * 10;
    o.sz = 8 + hash(i * 5.3) * 10;
    o.sy = 14 + hash(i * 1.1) * 40 + center * center * 90;
    o.color = PASTELS[i % PASTELS.length];
  };
  const tex = bannerTexture();
  const ol = outlineMaterial(0.35);
  return (
    <group>
      <Particles count={n} geometry={TOWER} material={toon("#ffffff", { steps: 3 })} frame={0} fn={fn} colored castShadow />
      {OUTLINES ? <Particles count={n} geometry={outlineGeometry(TOWER)} material={ol} frame={0} fn={fn} /> : null}
      <mesh position={[0, -0.2, SKY_Z + 36]} material={toon(PAL.sand)}>
        <boxGeometry args={[700, 1.2, 40]} />
      </mesh>
      {/* the capital tower that gets the giant banner */}
      <mesh position={[2, 70, SKY_Z - 20]} material={toon("#f4f1e8")} castShadow>
        <boxGeometry args={[20, 140, 20]} />
      </mesh>
      {OUTLINES ? (
        <mesh position={[2, 70, SKY_Z - 20]} material={outlineMaterial(0.4)} geometry={outlineGeometry(CAPITAL)} />
      ) : null}
      <WavingFlag frame={f} loopFrames={LOOP} texture={tex} height={60} width={46} raise={raiseAt(wf, 1430)} position={[2, 140, SKY_Z - 20]} rotationY={0.25} outline={0.5} />
    </group>
  );
};
export const SKYLINE_FLAG: [number, number, number] = [26, 192, SKY_Z - 20];

// ---- cloud ceiling (the camera rises through it) -----------------------------------------
const PUFF = new IcosahedronGeometry(1, 1);
export const Clouds: React.FC<{ f: number }> = ({ f }) => {
  const cx = boatX(1600), cz = boatZ(1600);
  const fn = (i: number, fr: number, o: { x: number; y: number; z: number; s: number; sx?: number; sy?: number; sz?: number; ry?: number }) => {
    const a = hash(i * 1.3) * Math.PI * 2;
    const r = Math.sqrt(hash(i * 2.9)) * 260;
    const drift = (fr / LOOP) * 30;
    o.x = cx + Math.cos(a) * r + drift;
    o.z = cz + Math.sin(a) * r;
    o.y = 92 + hash(i * 4.1) * 40;
    // the ceiling gathers just before the climb (time-lapse), invisible before
    const gather = Math.min(1, Math.max(0, (fr - 1540 - hash(i * 8.8) * 60) / 40));
    o.s = (7 + hash(i * 6.1) * 12) * gather;
    o.sy = 0.55;
    o.ry = hash(i) * 6;
  };
  return <Particles count={480} geometry={PUFF} material={toon("#ffffff", { emissive: "#c8d8ff", emissiveIntensity: 0.25 })} frame={f} fn={fn} />;
};
