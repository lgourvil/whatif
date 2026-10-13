import React, {useMemo} from 'react';
import * as THREE from 'three';
import {AbsoluteFill, Audio, interpolate, random, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {Sky} from '../../lib/Sky';
import {Particles} from '../../lib/Particles';
import {paletteAt, PaletteStop} from '../../lib/palettes';
import {povPose, PovRig, Key, PovConfig} from '../../lib/PovCamera';
import {PovHands, Pip} from '../../lib/Characters';
import {ToonMesh, boxGeo, coneGeo, icoGeo, cylGeo} from '../../lib/Toon';
import {Overlay, CAWrap, impactAt} from '../../lib/Overlay';
import {gradientMap} from '../../lib/ToonMaterial';
import {noise2} from '../../lib/noise';
import T from './timeline.json';
import {bedH, waterLevel, wallZ, isUnderwater} from './world';

export const SHADOWS = false;
const SLUG = 'ocean-drain';

const stage = (zenith: string, horizon: string, sun: string, ground: string, accent: string) => ({zenith, horizon, sun, ground, accent});
export const STOPS: PaletteStop[] = [
  {frame: 0, stage: stage('#3f6bb0', '#ffc79a', '#fff0c8', '#e8c48a', '#ff6b4a')},
  {frame: 300, stage: stage('#3f6bb0', '#ffc79a', '#fff0c8', '#e8c48a', '#ff6b4a')},
  {frame: 700, stage: stage('#2f3f6e', '#d9a77e', '#ffe0a0', '#b99a78', '#7fd6c8')},
  {frame: 1020, stage: stage('#2a2350', '#d9704f', '#ffb070', '#a6806a', '#ffd23f')},
  {frame: 1260, stage: stage('#3a2a58', '#c4474a', '#ff7a4a', '#a0707a', '#ff3b2f')},
  {frame: 1500, stage: stage('#3a2a58', '#c4474a', '#ff7a4a', '#a0707a', '#ff3b2f')},
  {frame: 1512, stage: stage('#0a3b5c', '#1a8aa8', '#aef4ff', '#0f4f6b', '#ffffff')},
  {frame: 1812, stage: stage('#0a3b5c', '#1a8aa8', '#aef4ff', '#0f4f6b', '#ffffff')},
  {frame: 1850, stage: stage('#3f6bb0', '#ffc79a', '#fff0c8', '#e8c48a', '#ff6b4a')},
  {frame: 2040, stage: stage('#3f6bb0', '#ffc79a', '#fff0c8', '#e8c48a', '#ff6b4a')},
];

const tension = (f: number) => interpolate(f, T.tension.map((k) => k[0]), T.tension.map((k) => k[1]), {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
const fogDensity = (f: number) => interpolate(f, [0, 600, 1020, 1260, 1500, 1511, 1812, 1850, 2040], [0.0014, 0.0016, 0.0009, 0.0011, 0.0016, 0.045, 0.04, 0.0014, 0.0014]);
const sunElev = (f: number) => interpolate(f, [0, 1000, 1500, 1860, 2040], [7, 16, 5, 7, 7]);

// ---- Pip path (closed form) -------------------------------------------------
const pipZ = (f: number) => -47 + (f - 960) * 0.27;
const pipPos = (f: number): [number, number, number] => {
  const z = pipZ(f);
  const x = 3.6 + Math.sin(f * 0.02) * 0.5;
  return [x, bedH(x, z), z];
};

// ---- Camera keys -------------------------------------------------------------
const P = (f: number) => pipPos(f);
const KEYS: Key[] = [
  {f: 0, pos: [0, 4.6, -2.0], look: [0, 3.7, -30]},
  {f: 120, pos: [0.08, 4.62, -2.05], look: [-1.5, 3.3, -30]},
  {f: 240, pos: [0, 4.6, -2.1], look: [0.5, 2.6, -14]},
  {f: 360, pos: [0, 4.5, -2.6], look: [0.4, -1, -6]},
  {f: 440, pos: [0.4, 4.6, -2.6], look: [1.4, 1.4, -5]},
  {f: 520, pos: [1.2, 4.5, -2.5], look: [1.6, 3.4, -9]},
  {f: 570, pos: [1.6, 4.0, -2.9], look: [1.6, 2.0, -4.2]},
  {f: 610, pos: [1.6, 2.4, -2.95], look: [1.6, 0.4, -4.4]},
  {f: 650, pos: [1.6, 0.2, -3.0], look: [1.6, -1.5, -9]},
  {f: 700, pos: [1.7, -0.6, -8], look: [1.5, -2.2, -40]},
  {f: 780, pos: [1.5, -2, -22], look: [0.5, -3.5, -60]},
  {f: 900, pos: [0.5, -4, -40], look: [-3, -5, -90]},
  {f: 930, pos: [0.3, -4, -44], look: [P(930)[0], P(930)[1] + 1.2, P(930)[2]]},
  {f: 985, pos: [0.2, -4, -47], look: [P(985)[0], P(985)[1] + 1.2, P(985)[2]]},
  {f: 1030, pos: [0, -4, -49], look: [0, 40, -60], fov: 74},
  {f: 1085, pos: [0, -4, -50], look: [-4, 30, -70], fov: 72},
  {f: 1120, pos: [0, -4, -51], look: [0, 3, -200], fov: 70},
  {f: 1230, pos: [0, -4, -46], look: [0, 12, -300], fov: 48},
  {f: 1244, pos: [0, -4, -45], look: [-200, 4, -45], fov: 78},
  {f: 1262, pos: [0, -4, -43], look: [0, 2, 60], fov: 82},
  {f: 1360, pos: [0, -4, -30], look: [0, 3, 60], fov: 84},
  {f: 1385, pos: [0, -4, -26], look: [-8, 12, -150], fov: 88},
  {f: 1420, pos: [0, -4, -22], look: [-6, 9, -120], fov: 88},
  {f: 1452, pos: [0, -4, -17], look: [0, 2, 60], fov: 86},
  {f: 1500, pos: [0, -4, -11], look: [0, 4, 60], fov: 86},
  {f: 1530, pos: [0, 0.5, -3], look: [0, 1, 40], fov: 84},
  {f: 1590, pos: [1, 1.5, 6], look: [-20, 0, 0], fov: 80},
  {f: 1650, pos: [0, 2.5, 8], look: [5, 5, 40], fov: 78},
  {f: 1750, pos: [0, 0.8, 0], look: [0, 4, -60], fov: 74},
  {f: 1830, pos: [0, -0.3, -2], look: [0, 4.5, -30], fov: 72},
  {f: 1860, pos: [0, 0.35, -2.3], look: [0, 2.8, -30], fov: 70},
  {f: 1950, pos: [0, 2.8, -2.15], look: [0, 3.5, -30]},
  {f: 2040, pos: [0, 4.6, -2.0], look: [0, 3.7, -30]},
];

const POSE_CFG: PovConfig = {
  keys: KEYS,
  walk: T.walk,
  impacts: T.impacts,
  fps: 30,
  tension,
  ground: (f, x, z) => {
    const blend = interpolate(f, [655, 700, 1498, 1516], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    return {y: bedH(x, z) + 1.72, blend};
  },
  roll: (f) => interpolate(f, [1500, 1560, 1700, 1850], [0, 1.6, 0.5, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) + interpolate(f, [1236, 1248, 1262], [0, 0.25, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
};

// ---- Terrain -----------------------------------------------------------------
const Terrain: React.FC<{color: THREE.Color}> = ({color}) => {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(320, 620, 80, 150);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i) - 230;
      pos.setZ(i, z);
      const y = bedH(x, z);
      pos.setY(i, y);
      const t = Math.min(1, Math.max(0, (12 - z) / 62));
      const wet = 1 - 0.38 * Math.min(1, t * 1.6);
      const v = (0.8 + noise2(x * 0.3, z * 0.3) * 0.3) * wet * (z > 12 ? 1.08 : 1);
      cols[i * 3] = v;
      cols[i * 3 + 1] = v * (z > 14 ? 1.04 : 1);
      cols[i * 3 + 2] = v * (z > 14 ? 0.9 : 1.02);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    return flat;
  }, []);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshToonMaterial color={color} vertexColors gradientMap={gradientMap()} />
    </mesh>
  );
};

// ---- Water -------------------------------------------------------------------
const Water: React.FC<{frame: number; color: THREE.Color}> = ({frame, color}) => {
  const level = waterLevel(frame);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(320, 620, 64, 124);
    g.rotateX(-Math.PI / 2);
    for (let i = 0; i < g.attributes.position.count; i++) g.attributes.position.setZ(i, g.attributes.position.getZ(i) - 230);
    return g.toNonIndexed();
  }, []);
  const pos = geo.attributes.position;
  const amp = frame >= T.wall.hit && frame < 1840 ? 0.5 : 0.35;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, Math.sin(x * 0.11 + frame * 0.06) * amp + Math.sin(z * 0.17 - frame * 0.05 + x * 0.05) * amp * 0.8 + Math.sin(x * 0.31 + z * 0.23 + frame * 0.09) * amp * 0.3);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return (
    <group position={[0, level, 0]}>
      <mesh geometry={geo}>
        <meshToonMaterial color={color} gradientMap={gradientMap()} transparent opacity={0.92} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.4, -700]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4000, 2000]} />
        <meshToonMaterial color={color} gradientMap={gradientMap()} />
      </mesh>
    </group>
  );
};

// ---- The wall of water ---------------------------------------------------------
const Wall: React.FC<{frame: number; color: THREE.Color}> = ({frame, color}) => {
  const z = wallZ(frame);
  const geo = useMemo(() => {
    const g = new THREE.BoxGeometry(900, 60, 50, 60, 6, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 29) p.setY(i, 30 + (noise2(p.getX(i) * 0.05, 1) - 0.5) * 9 + Math.sin(p.getX(i) * 0.07) * 3);
    }
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    return flat;
  }, []);
  if (frame < T.wall.appear - 5 || frame >= T.wall.hit + 8) return null;
  const foamGeo = icoGeo;
  return (
    <group>
      <mesh geometry={geo} position={[0, -12 + 28, z - 25]}>
        <meshToonMaterial color={color} gradientMap={gradientMap()} />
      </mesh>
      <Particles
        count={1800}
        frame={frame}
        seed="foam"
        color="#f4fbff"
        geometry={foamGeo}
        toon
        update={(i, f, r) => {
          const x = (r[0] - 0.5) * 520;
          const top = -12 + 28 + 28 + (noise2(x * 0.05, 1) - 0.5) * 9 + Math.sin(x * 0.07) * 3;
          const k = (f * 0.03 + r[2] * 10) % 1;
          return {x, y: top + k * 7 - r[1] * 2, z: wallZ(f) - 3 + r[1] * 6 - k * 4, s: 1.6 + r[2] * 3.5 * (1 - k * 0.5), rx: r[0] * 6, ry: r[1] * 6};
        }}
      />
    </group>
  );
};

// ---- Pier ----------------------------------------------------------------------
const Pier: React.FC = () => {
  const planks = useMemo(() => Array.from({length: 18}, (_, i) => i), []);
  const pil = useMemo(() => {
    const out: {x: number; z: number; h: number; y: number}[] = [];
    for (let z = -2.6; z <= 10; z += 3.15) for (const x of [-1.8, 1.8]) {
      const b = bedH(x, z) - 0.6;
      out.push({x, z, h: 3 - b, y: (3 + b) / 2});
    }
    return out;
  }, []);
  const ladderRungs = Array.from({length: 22}, (_, i) => i);
  const lb = bedH(1.6, -3.5);
  return (
    <group>
      <ToonMesh geometry={boxGeo} color="#6e4d3a" position={[0, 2.82, 4.35]} scale={[4.2, 0.22, 15.3]} outline={0.01} />
      {planks.map((i) => (
        <ToonMesh key={i} geometry={boxGeo} color={i % 2 ? '#9a6f50' : '#8a6044'} position={[0, 2.99, -2.85 + i * 0.86]} scale={[4.0, 0.08, 0.78]} outline={0} />
      ))}
      {pil.map((p, i) => (
        <ToonMesh key={i} geometry={cylGeo} color="#4a3629" position={[p.x, p.y, p.z]} scale={[0.34, p.h, 0.34]} outline={0.06} />
      ))}
      {/* rails */}
      <ToonMesh geometry={boxGeo} color="#c9b49a" position={[-0.3, 4.05, -3.2]} scale={[3.0, 0.1, 0.12]} outline={0.1} />
      <ToonMesh geometry={boxGeo} color="#c9b49a" position={[1.9, 4.05, -3.2]} scale={[0.5, 0.1, 0.12]} outline={0.1} />
      {[-1.9, -1.0, 0, 1.0, 1.9].map((x, i) => (i === 4 ? null : <ToonMesh key={x} geometry={boxGeo} color="#c9b49a" position={[x, 3.52, -3.2]} scale={[0.12, 1.1, 0.12]} outline={0.1} />))}
      {[-1, 1].map((s) => (
        <group key={s}>
          <ToonMesh geometry={boxGeo} color="#c9b49a" position={[s * 2.0, 4.05, 4.35]} scale={[0.1, 0.1, 15.3]} outline={0.05} />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <ToonMesh key={i} geometry={boxGeo} color="#c9b49a" position={[s * 2.0, 3.52, -2.8 + i * 2.4]} scale={[0.12, 1.1, 0.12]} outline={0.1} />)}
        </group>
      ))}
      {/* ladder */}
      <ToonMesh geometry={boxGeo} color="#d9d9df" position={[1.35, (3 + lb) / 2, -3.55]} scale={[0.07, 3 - lb + 0.8, 0.07]} outline={0.15} />
      <ToonMesh geometry={boxGeo} color="#d9d9df" position={[1.85, (3 + lb) / 2, -3.55]} scale={[0.07, 3 - lb + 0.8, 0.07]} outline={0.15} />
      {ladderRungs.map((i) => (3 - i * 0.3 > lb + 0.3 ? <ToonMesh key={i} geometry={boxGeo} color="#d9d9df" position={[1.6, 2.7 - i * 0.3, -3.55]} scale={[0.5, 0.05, 0.06]} outline={0.2} /> : null))}
      {/* lamp post at the end: signature warm light source */}
      <ToonMesh geometry={cylGeo} color="#2b2b36" position={[-1.9, 4.6, -3.2]} scale={[0.1, 1.3, 0.1]} outline={0.1} />
      <ToonMesh geometry={icoGeo} color="#ffd9a0" position={[-1.9, 5.3, -3.2]} scale={0.3} outline={0.1} />
    </group>
  );
};

// ---- Boats --------------------------------------------------------------------
const BOATS: [number, number, number][] = [[-9, -10, 0.6], [8, -22, -0.4], [-17, -35, 1.1], [14, -46, 2.2], [-5, -62, 0.2], [24, -18, 1.9]];
const Boat: React.FC<{x: number; z: number; h: number; frame: number; level: number; color: string}> = ({x, z, h, frame, level, color}) => {
  const b = bedH(x, z);
  const grounded = level < b + 0.15;
  const y = Math.max(level, b) + 0.35;
  const roll = grounded ? 0.28 * Math.sign(Math.sin(h * 7)) : Math.sin(frame * 0.07 + h) * 0.05;
  const pitch = grounded ? 0.1 : Math.cos(frame * 0.05 + h) * 0.03;
  return (
    <group position={[x, y, z]} rotation={[pitch, h, roll]}>
      <ToonMesh geometry={boxGeo} color={color} position={[0, 0, 0]} scale={[1.8, 0.8, 5.4]} outline={0.04} />
      <ToonMesh geometry={coneGeo} color={color} position={[0, 0, -3.2]} rotation={[Math.PI / 2, 0, 0]} scale={[1.8, 1.0, 0.8]} outline={0.04} />
      <ToonMesh geometry={boxGeo} color="#e9e4dc" position={[0, 0.8, 0.6]} scale={[1.3, 0.8, 1.6]} outline={0.05} />
      <ToonMesh geometry={cylGeo} color="#4a3629" position={[0, 1.9, -1]} scale={[0.1, 3.0, 0.1]} outline={0.1} />
    </group>
  );
};

// ---- Props on the seabed -----------------------------------------------------------
const finGeo = new THREE.OctahedronGeometry(1, 0).scale(1.6, 0.5, 0.6);
const birdGeo = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, -1.3, 0.25, 0.4, -1.3, 0.2, -0.15, 0, 0, 0, 1.3, 0.25, 0.4, 1.3, 0.2, -0.15]), 3));
  g.computeVertexNormals();
  return g;
})();
const kelpGeo = new THREE.ConeGeometry(0.2, 1, 4).translate(0, 0.5, 0);

const SeabedProps: React.FC<{frame: number; level: number; accent: THREE.Color}> = ({frame, level, accent}) => (
  <>
    <Particles count={140} frame={frame} seed="rock" color="#4a4150" toon geometry={icoGeo} update={(i, f, r) => {
      const x = (r[0] - 0.5) * 90 + 1.6 * (r[2] > 0.5 ? 1 : -1) * 4;
      const z = 6 - r[1] * 110;
      if (Math.abs(x - 1.6) < 3 && z > -8) return null;
      return {x, y: bedH(x, z) + 0.1, z, s: 0.6 + r[2] * 2.6, rx: r[0] * 6, ry: r[1] * 6};
    }} />
    <Particles count={260} frame={frame} seed="kelp" color="#2f6b4f" toon geometry={kelpGeo} update={(i, f, r) => {
      const x = (r[0] - 0.5) * 80;
      const z = 4 - r[1] * 70;
      return {x, y: bedH(x, z) - 0.1, z, s: 0.45 + r[2] * 0.9, rx: Math.sin(f * 0.06 + i) * 0.25, rz: Math.cos(f * 0.05 + i * 2) * 0.25};
    }} />
    <Particles count={260} frame={frame} seed="fish" color={`#${accent.getHexString()}`} geometry={finGeo} toon update={(i, f, r) => {
      const x = (r[0] - 0.5) * 50;
      const z = 2 - r[1] * 60;
      const b = bedH(x, z);
      if (level > b - 0.05) return null;
      const fl = Math.abs(Math.sin(f * (0.25 + r[2] * 0.2) + r[0] * 20));
      return {x, y: b + 0.12 + fl * 0.35 * (r[2] > 0.4 ? 1 : 0.2), z, s: 0.28 + r[2] * 0.22, rz: Math.sin(f * 0.4 + i) * 0.7, ry: r[1] * 6.28};
    }} />
  </>
);

// ---- Trees + lighthouse (shore silhouettes) -------------------------------------------------
const Shore: React.FC = () => {
  const trees = useMemo(() => Array.from({length: 9}, (_, i) => {
    const x = -50 + random(`tx${i}`) * 100;
    const z = 22 + random(`tz${i}`) * 30;
    return {x, z, y: bedH(x, z), s: 0.9 + random(`ts${i}`) * 0.8};
  }), []);
  const lz = 42;
  const lx = -46;
  return (
    <group>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, t.y, t.z]} scale={t.s}>
          <ToonMesh geometry={cylGeo} color="#4a3629" position={[0, 1.4, 0]} scale={[0.4, 2.8, 0.4]} outline={0.06} />
          <ToonMesh geometry={coneGeo} color="#2f6b4f" position={[0, 3.6, 0]} scale={[3.0, 3.2, 3.0]} outline={0.04} />
          <ToonMesh geometry={coneGeo} color="#3a7c5c" position={[0, 5.2, 0]} scale={[2.2, 2.4, 2.2]} outline={0.04} />
        </group>
      ))}
      <group position={[lx, bedH(lx, lz), lz]}>
        <ToonMesh geometry={cylGeo} color="#f0e8dc" position={[0, 7, 0]} scale={[3.2, 14, 3.2]} outline={0.03} />
        <ToonMesh geometry={cylGeo} color="#c9423a" position={[0, 9, 0]} scale={[3.3, 2.2, 3.3]} outline={0.03} />
        <ToonMesh geometry={icoGeo} color="#ffe9a8" position={[0, 14.8, 0]} scale={2.0} outline={0.04} />
        <ToonMesh geometry={coneGeo} color="#2b2b36" position={[0, 16.7, 0]} scale={[3, 1.8, 3]} outline={0.04} />
      </group>
      {/* far silhouettes: islands on the horizon */}
      {[-260, -140, 40, 200, 330].map((x, i) => (
        <ToonMesh key={i} geometry={coneGeo} color="#1d2140" position={[x, -12 + 14 + (i % 3) * 4, -430 - i * 12]} scale={[120 + i * 20, 30 + (i % 3) * 8, 60]} outline={0} />
      ))}
    </group>
  );
};

// ---- Air / underwater particles -----------------------------------------------------------
const wrap = (v: number, L: number) => ((v % L) + L) % L - L / 2;

export const OceanDrain: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const pal = paletteAt(frame, STOPS);
  const pose = povPose(frame, POSE_CFG);
  const ten = tension(frame);
  const level = waterLevel(frame);
  const under = isUnderwater(frame) || pose.pos.y < level - 0.1;
  const fogC = pal.horizon;
  const density = fogDensity(frame);
  const elev = (sunElev(frame) * Math.PI) / 180;
  const sunDir = new THREE.Vector3(0.05, Math.sin(elev), -Math.cos(elev)).normalize();
  const waterColor = new THREE.Color('#1c93b0').lerp(pal.zenith, 0.4).lerp(pal.horizon, 0.1).multiplyScalar(0.72);
  const sunInt = interpolate(frame, [0, 700, 1260, 1500, 1812, 1850], [2.3, 2.2, 1.6, 0.8, 0.8, 2.3]) * (under ? 0.6 : 1);
  const imp = impactAt(frame, T.impacts);
  const cam = pose.pos;

  // POV hands
  const gripRail = interpolate(frame, [0, 190, 250, 1940, 1985, 2040], [1, 1, 0, 0, 1, 1]);
  const ladderPhase = interpolate(frame, [540, 570, 640, 660], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const grip = Math.max(gripRail, ladderPhase);
  const gripZ = interpolate(ladderPhase, [0, 1], [-1.0, -0.5]);
  const walkPhaseCount = (() => {
    let s = 0;
    for (const w of T.walk) s += Math.max(0, Math.min(frame, w.to) - w.from) / w.cadence;
    return s;
  })();
  const swim = interpolate(frame, [1520, 1550, 1830, 1858], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  const pip = pipPos(frame);
  const showPip = frame > 760 && frame < 1500;
  const running = frame < 1240 ? 0.35 : 1;
  const heading = frame < 1100 ? 0 : 0; // facing -z when heading 0; flipped below
  const pipHeading = Math.PI; // runs towards +z (shore)
  const wallHit = frame >= T.wall.hit;

  return (
    <AbsoluteFill style={{background: '#000'}}>
      <Audio src={staticFile(`audio/${SLUG}.wav`)} />
      <CAWrap tension={ten} impact={imp}>
        <ThreeCanvas width={width} height={height} linear={false} flat={false} dpr={1} shadows={SHADOWS} camera={{fov: 70, near: 0.1, far: 1600}}
          gl={{antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, outputColorSpace: THREE.SRGBColorSpace}}>
          <color attach="background" args={[`#${pal.horizon.getHexString()}`]} />
          <fogExp2 attach="fog" args={[`#${fogC.getHexString()}`, density]} />
          <PovRig pose={pose}>
            <PovHands grip={grip} swing={walkPhaseCount} swingAmp={under ? 0 : interpolate(frame, [600, 700, 1230, 1260], [0, 1, 1, 1.6], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) * 0.05} swim={swim} swimPhase={frame / 45} visible={1} skin="#f2b48c" sleeve="#e8553a" gripY={interpolate(ladderPhase, [0, 1], [-0.42, -0.3]) + ladderPhase * Math.sin(frame * 0.22) * 0.14} gripZ={gripZ} />
          </PovRig>

          <Sky palette={pal} sunDir={sunDir} glow={under ? 0.2 : 1} />
          <hemisphereLight args={[pal.zenith.clone().lerp(pal.horizon, 0.5), pal.ground, 1.15]} />
          <directionalLight color={pal.sun} intensity={sunInt} position={[sunDir.x * 200 + cam.x, sunDir.y * 200 + cam.y, sunDir.z * 200 + cam.z]} target-position={[cam.x, cam.y, cam.z]} castShadow={SHADOWS} shadow-mapSize={[1024, 1024]} />
          <pointLight color={pal.accent} intensity={ten * 60} distance={40} position={[cam.x + 1, cam.y + 1.5, cam.z - 4]} />
          <pointLight color="#ffffff" intensity={imp * 400} distance={80} position={[cam.x, cam.y + 1, cam.z]} />
          <pointLight color="#ffc27a" intensity={interpolate(frame, [0, 700], [14, 5], {extrapolateRight: 'clamp'})} distance={14} position={[-1.9, 5.3, -3.2]} />

          <Terrain color={pal.ground} />
          <Water frame={frame} color={waterColor} />
          <Wall frame={frame} color={waterColor.clone().multiplyScalar(0.55)} />
          <Pier />
          <Shore />
          {BOATS.map(([x, z, h], i) => <Boat key={i} x={x} z={z} h={h} frame={frame} level={level} color={['#e8553a', '#3f6bb0', '#ffc83d', '#e8553a', '#3f6bb0', '#ffc83d'][i]} />)}
          <SeabedProps frame={frame} level={level} accent={pal.accent} />

          {/* gulls fleeing inland */}
          {frame > 900 && frame < 1300 ? (
            <Particles count={70} frame={frame} seed="gull" color="#ffffff" geometry={birdGeo} fog={false} update={(i, f, r) => {
              const k = f - 900;
              const flap = Math.sin(f * 0.5 + r[0] * 9) * 0.5;
              return {x: (r[0] - 0.5) * 140 + k * (r[2] - 0.5) * 0.05, y: 14 + r[1] * 35 + k * 0.05, z: -170 + k * (0.45 + r[2] * 0.25) - r[1] * 40, s: 1.6 + r[2] * 1.4, rx: flap * 0.4, rz: flap, ry: Math.PI};
            }} />
          ) : null}

          {/* sun glitter on the water */}
          {!under && level > -1 ? (
            <Particles count={600} frame={frame} seed="glit" color="#fff6d8" fog={false} update={(i, f, r) => {
              const z = -14 - r[1] * r[1] * 360;
              const spread = 4 + Math.abs(z) * 0.12;
              const blink = Math.max(0, Math.sin(f * 0.35 + r[2] * 40));
              return {x: (r[0] - 0.5) * 2 * spread, y: level + 0.45, z, s: blink * (0.18 + Math.abs(z) * 0.012), rx: Math.PI / 2};
            }} geometry={new THREE.PlaneGeometry(1, 0.18)} />
          ) : null}
          {/* dust + salt motes in the wind (depth cue and parallax) */}
          {!under ? (
            <Particles count={1400} frame={frame} seed="mote" color="#fff3df" opacity={0.55} update={(i, f, r) => ({
              x: cam.x + wrap(r[0] * 60 + f * (0.04 + ten * 0.12) * (0.5 + r[2]), 60),
              y: cam.y + wrap(r[1] * 30 + Math.sin(f * 0.03 + i) * 0.5, 30),
              z: cam.z + wrap(r[2] * 60 - f * 0.02, 60),
              s: 0.012 + r[0] * 0.012,
            })} />
          ) : null}
          {/* underwater bubbles + sediment */}
          {under ? (
            <>
              <Particles count={3200} frame={frame} seed="bub" color="#d8fbff" opacity={0.7} update={(i, f, r) => ({
                x: cam.x + wrap(r[0] * 50 + Math.sin(f * 0.04 + i) * 0.6, 40),
                y: cam.y + wrap(r[1] * 40 + f * (0.12 + r[2] * 0.25), 40),
                z: cam.z + wrap(r[2] * 50 + Math.cos(f * 0.05 + i) * 0.6, 40),
                s: 0.04 + r[1] * r[1] * 0.2,
              })} />
              <Particles count={160} frame={frame} seed="deb" color="#6e4d3a" toon geometry={boxGeo} update={(i, f, r) => {
                const k = interpolate(f, [1500, 1530, 1700, 1800], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
                const a = r[0] * 6.28 + f * (0.02 + r[1] * 0.04);
                const R = 6 + r[2] * 16;
                return {x: cam.x + Math.cos(a) * R, y: cam.y + Math.sin(a * 1.3 + r[1] * 5) * R * 0.5, z: cam.z + Math.sin(a) * R - 4, s: (0.15 + r[1] * 0.5) * k, rx: f * 0.05 * r[0], ry: f * 0.07 * r[2], rz: r[1] * 5};
              }} />
            </>
          ) : null}
          {/* rushing spray in front of the wall as it closes in */}
          {frame > 1380 && frame < T.wall.hit ? (
            <Particles count={900} frame={frame} seed="spray" color="#eaf6ff" opacity={0.8} update={(i, f, r) => ({
              x: cam.x + (r[0] - 0.5) * 40,
              y: cam.y + 0.5 + r[1] * 14,
              z: cam.z - 6 - ((r[2] * 60 - (f - 1380) * 0.6 * (1 + r[1])) % 60 + 60) % 60,
              s: 0.1 + r[2] * 0.2,
            })} />
          ) : null}

          {showPip ? (
            <Pip position={frame < 1230 ? pip : [3.6, bedH(3.6, pip[2]), pip[2]]} heading={pipHeading} t={frame} run={running} point={frame > 1100 ? Math.min(1, (frame - 1100) / 20) : 0} scale={1.1}
              palette={{body: '#3f6bb0', cap: '#ffc83d', scarf: '#d63a3a', skin: '#f2b48c'}} />
          ) : null}
        </ThreeCanvas>
      </CAWrap>
      <Overlay beats={T.texts} impacts={T.impacts} tension={ten} accent={`#${pal.accent.getHexString()}`} />
    </AbsoluteFill>
  );
};
