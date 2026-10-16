import React, {useMemo} from 'react';
import * as THREE from 'three';
import {AbsoluteFill, Audio, getInputProps, random, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {PovCamera, computePose, Pose} from '../../lib/PovCamera';
import {Sky, dirFromElev} from '../../lib/Sky';
import {Particles} from '../../lib/Particles';
import {Outlined, Pip} from '../../lib/Characters';
import {Citizen, mouthOf} from '../../lib/Citizens';
import {Hand, handTrack} from '../../lib/Hands';
import {InstancedToon, Inst} from '../../lib/Instanced';
import {VaporMesh, addBanks, addPuffs, blobBuffer, setAvoid, Bank, Puff} from '../../lib/Vapor';
import {Overlay, PostFx} from '../../lib/Overlay';
import {toonProps} from '../../lib/ToonMaterial';
import {EVERYONE_VAPES, mixPalette} from '../../lib/palettes';
import {clamp01, smooth} from '../../lib/anim';
import {Vape, MiniVape} from './Vape';
import {HAND_L, HAND_R, VAPE_IN_HAND} from './hands';
import * as W from './world';

/** Shadow maps on the sun only. Turn off first if the render is too slow. */
const SHADOWS = true;
const MAX_BLOBS = 2600;
const P0 = EVERYONE_VAPES[0];

const U = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 7),
  wheel: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  ball: new THREE.IcosahedronGeometry(0.5, 1),
  disc: new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2),
};

// ---------------------------------------------------------------- street
const Street: React.FC = () => {
  const geo = useMemo(() => {
    const pos: number[] = [], col: number[] = [];
    const asphalt = new THREE.Color('#57525e'), curb = new THREE.Color('#e3dbd0');
    const tA = new THREE.Color(P0.ground), tB = new THREE.Color(P0.ground).multiplyScalar(0.9), far = new THREE.Color('#8d8a93');
    const quad = (x0: number, x1: number, z0: number, z1: number, c: THREE.Color, y = 0) => {
      for (const [x, z] of [[x0, z0], [x0, z1], [x1, z0], [x1, z0], [x0, z1], [x1, z1]]) { pos.push(x, y, z); col.push(c.r, c.g, c.b); }
    };
    for (let z = 40; z > -200; z -= 2) {
      quad(-4.5, 4.5, z, z - 2, asphalt);
      for (const s of [-1, 1]) {
        const a = s < 0 ? -1 : 1;
        quad(a * 4.5, a * 4.75, z, z - 2, curb, 0.12);
        for (let x = 4.75; x < 8.6; x += 1.28) {
          const k = Math.round((x - 4.75) / 1.28) + Math.round(z / 2);
          const c = k % 2 === 0 ? tA : tB;
          quad(a * x, a * Math.min(8.6, x + 1.28), z, z - 2, c, 0.12);
        }
        quad(a * 8.6, a * 70, z, z - 2, far, 0.12);
      }
    }
    // crosswalk
    for (let i = 0; i < 8; i++) quad(-4.2 + i * 1.1, -4.2 + i * 1.1 + 0.6, -35, -39, curb, 0.01);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    // fix winding so all quads face up
    g.computeVertexNormals();
    return g;
  }, []);
  const dashes = useMemo<Inst[]>(() => Array.from({length: 40}, (_, i) => ({p: [0, 0.01, 30 - i * 6], s: [0.16, 0.02, 2.6], c: '#f3efe6'})), []);
  return (
    <>
      <mesh geometry={geo} receiveShadow>
        <meshToonMaterial {...toonProps('#ffffff')} vertexColors side={THREE.DoubleSide} />
      </mesh>
      <InstancedToon geometry={U.box} items={dashes} kind="basic" />
    </>
  );
};

// ---------------------------------------------------------------- city blocks (instanced)
const FACADES = ['#f4d6c6', '#c9e4de', '#f7e1a1', '#d7c6e8', '#f2b8a2', '#bcd5f0', '#e9c9a9', '#f6c6d0'];
const AWNINGS = ['#e63946', '#2a9d8f', '#f4a261', '#264653', '#e76f51', '#8ab17d', '#3d5a80'];

type Block = {s: number; z: number; w: number; h: number; c: string; a: string};
const buildBlocks = (): Block[] => {
  const out: Block[] = [];
  for (const s of [-1, 1]) {
    let z = 40;
    let i = 0;
    while (z > -190) {
      const w = 6 + random(`bw${s}${i}`) * 6.5;
      const h = 9 + random(`bh${s}${i}`) * 22 + (z < -60 ? random(`bt${s}${i}`) * 18 : 0);
      out.push({s, z: z - w / 2, w, h, c: FACADES[Math.floor(random(`bc${s}${i}`) * FACADES.length)], a: AWNINGS[Math.floor(random(`ba${s}${i}`) * AWNINGS.length)]});
      z -= w + 0.15;
      i++;
    }
  }
  return out;
};

const City: React.FC<{lamps: number; ol?: boolean; hide?: Set<string>}> = ({lamps, ol = true, hide = new Set()}) => {
  const blocks = useMemo(buildBlocks, []);
  const parts = useMemo(() => {
    const body: Inst[] = [], trim: Inst[] = [], glass: Inst[] = [], awn: Inst[] = [], signs: Inst[] = [];
    for (const b of blocks) {
      const fx = b.s * 8.6, d = 12;
      body.push({p: [b.s * (8.6 + d / 2), b.h / 2, b.z], s: [d, b.h, b.w], c: b.c});
      trim.push({p: [b.s * (8.6 + d / 2 - 0.3), b.h + 0.3, b.z], s: [d + 0.6, 0.6, b.w + 0.3], c: new THREE.Color(b.c).multiplyScalar(0.72).getStyle()});
      trim.push({p: [fx - b.s * 0.05, 3.9, b.z], s: [0.3, 0.35, b.w], c: new THREE.Color(b.c).multiplyScalar(0.8).getStyle()});
      glass.push({p: [fx - b.s * 0.06, 1.65, b.z], s: [0.12, 2.7, b.w - 1.4], c: '#6d7fa3'});
      awn.push({p: [fx - b.s * 0.85, 3.3, b.z], s: [1.7, 0.14, b.w - 1.6], r: [0, 0, b.s * 0.28], c: b.a});
      signs.push({p: [fx - b.s * 0.1, 4.55, b.z], s: [0.18, 0.75, b.w * 0.55], c: random(`sg${b.z}`) > 0.5 ? '#fff7e8' : b.a});
      // roof boxes / water tanks
      if (random(`rt${b.z}`) > 0.55) trim.push({p: [b.s * (8.6 + 4 + random(`rx${b.z}`) * 3), b.h + 1.2, b.z], s: [2.2, 1.8, 2.2], c: '#9aa0ab'});
    }
    return {body, trim, glass, awn, signs};
  }, [blocks]);
  const lq = Math.round(lamps * 10) / 10;
  const windows = useMemo(() => {
    const wins: Inst[] = [];
    const lit = new THREE.Color('#ffd28f'), dark = new THREE.Color('#4a5677');
    for (const b of blocks) {
      const cols = Math.max(1, Math.floor((b.w - 1) / 2.3));
      for (let y = 6; y < b.h - 1.5; y += 3.1) for (let c = 0; c < cols; c++) {
        const z = b.z - b.w / 2 + (c + 0.5) * (b.w / cols);
        const on = random(`w${b.z}-${y}-${c}`) > 0.5 ? lq : 0;
        wins.push({p: [b.s * 8.6 - b.s * 0.04, y, z], s: [0.12, 1.5, 1.15], c: dark.clone().lerp(lit, on).getStyle()});
      }
    }
    return wins;
  }, [blocks, lq]);
  const skyline = useMemo<Inst[]>(() => Array.from({length: 46}, (_, i) => {
    const x = (random(`sx${i}`) - 0.5) * 220, h = 40 + random(`sh${i}`) * 110, w = 10 + random(`sw${i}`) * 16;
    return {p: [x, h / 2, -230 - random(`sz${i}`) * 90], s: [w, h, w], c: new THREE.Color('#9fb2d4').offsetHSL(0, 0, (random(`sl${i}`) - 0.5) * 0.12).getStyle()};
  }), []);
  return (
    <>
      {!hide.has('cbody') && <InstancedToon geometry={U.box} items={parts.body} outline={ol ? 0.08 : 0} receiveShadow castShadow={SHADOWS} />}
      {!hide.has('ctrim') && <InstancedToon geometry={U.box} items={parts.trim} outline={0.05} />}
      {!hide.has('cawn') && <InstancedToon geometry={U.box} items={parts.awn} outline={0.04} castShadow={SHADOWS} />}
      {!hide.has('csign') && <InstancedToon geometry={U.box} items={parts.signs} outline={0.04} />}
      {!hide.has('cglass') && <InstancedToon geometry={U.box} items={parts.glass} kind="basic" />}
      {!hide.has('cwin') && <InstancedToon geometry={U.box} items={windows} kind="basic" version={lq} />}
      {!hide.has('csky') && <InstancedToon geometry={U.box} items={skyline} />}
    </>
  );
};

// ---------------------------------------------------------------- street furniture
const LAMP_Z = Array.from({length: 11}, (_, i) => 22 - i * 16);
const Furniture: React.FC<{lamps: number; frame: number}> = ({lamps}) => {
  const items = useMemo(() => {
    const pole: Inst[] = [], head: Inst[] = [], trunk: Inst[] = [], crown: Inst[] = [], bins: Inst[] = [];
    for (const s of [-1, 1]) {
      for (const z of LAMP_Z) {
        pole.push({p: [s * 4.85, 2.6, z], s: [0.16, 5.2, 0.16], c: '#3b3f4a'});
        head.push({p: [s * 4.45, 5.15, z], s: [0.9, 0.09, 0.09], c: '#3b3f4a'});
        head.push({p: [s * 4.0, 5.05, z], s: [0.62, 0.2, 0.36], c: '#3b3f4a'});
        const tz = z - 8;
        if (s === 1 && Math.abs(tz) < 9) continue; // keep the start frame's sky open
        trunk.push({p: [s * 4.85, 1.5, tz], s: [0.26, 3, 0.26], c: '#7a5a3a'});
        crown.push({p: [s * 4.85, 3.9, tz], s: [2.7, 2.4, 2.7], c: random(`tc${s}${z}`) > 0.5 ? '#6fb36a' : '#59a35f'});
        crown.push({p: [s * 4.85 + 0.3, 5.0, tz - 0.3], s: [1.8, 1.6, 1.8], c: '#86c47a'});
        if (random(`bin${s}${z}`) > 0.5) bins.push({p: [s * 5.05, 0.55, z - 3], s: [0.5, 0.85, 0.5], c: '#2f6d5a'});
      }
    }
    return {pole, head, trunk, crown, bins};
  }, []);
  const lq = Math.round(lamps * 20) / 20;
  const glow = useMemo(() => {
    const bulbs: Inst[] = [], halos: Inst[] = [], pools: Inst[] = [];
    const warm = new THREE.Color('#ffe2a8');
    for (const s of [-1, 1]) for (const z of LAMP_Z) {
      bulbs.push({p: [s * 4.0, 4.93, z], s: [0.5, 0.06, 0.28], c: new THREE.Color('#8a8270').lerp(new THREE.Color('#fff6dc'), lq).getStyle()});
      halos.push({p: [s * 4.0, 4.8, z], s: [2.6, 2.6, 2.6], c: warm.clone().multiplyScalar(0.28 * lq).getStyle()});
      pools.push({p: [s * 4.0, 0.14, z], s: [5.5, 1, 5.5], c: warm.clone().multiplyScalar(0.22 * lq).getStyle()});
    }
    return {bulbs, halos, pools};
  }, [lq]);
  return (
    <>
      <InstancedToon geometry={U.cyl} items={items.pole} outline={0.04} castShadow={SHADOWS} />
      <InstancedToon geometry={U.box} items={items.head} outline={0.03} />
      <InstancedToon geometry={U.cyl} items={items.trunk} outline={0.05} castShadow={SHADOWS} />
      <InstancedToon geometry={U.ico} items={items.crown} outline={0.08} castShadow={SHADOWS} />
      <InstancedToon geometry={U.cyl} items={items.bins} outline={0.05} />
      <InstancedToon geometry={U.box} items={glow.bulbs} kind="basic" version={lq} />
      {lq > 0 && <InstancedToon geometry={U.ball} items={glow.halos} kind="basic" additive version={lq} fog={false} />}
    </>
  );
};

const CARS: {x: number; z: number; c: string; yaw: number}[] = [
  {x: 3.2, z: 7, c: '#e85d75', yaw: 0}, {x: 3.2, z: -21, c: '#3fa7d6', yaw: 0}, {x: 3.25, z: -29, c: '#f7f2e8', yaw: 0},
  {x: -3.2, z: 4, c: '#59cd90', yaw: Math.PI}, {x: -3.2, z: -27, c: '#7d5ba6', yaw: Math.PI}, {x: 3.2, z: -48, c: '#f7b32b', yaw: 0},
  {x: -3.2, z: -52, c: '#2e86ab', yaw: Math.PI}, {x: 3.2, z: 20, c: '#5c946e', yaw: 0},
];
const Cars: React.FC<{lamps: number}> = ({lamps}) => {
  const it = useMemo(() => {
    const body: Inst[] = [], cab: Inst[] = [], glass: Inst[] = [], wheel: Inst[] = [];
    for (const c of CARS) {
      body.push({p: [c.x, 0.62, c.z], s: [1.85, 0.75, 4.3], c: c.c});
      cab.push({p: [c.x, 1.22, c.z + 0.25], s: [1.62, 0.55, 2.3], c: c.c});
      glass.push({p: [c.x, 1.24, c.z + 0.25], s: [1.66, 0.42, 2.2], c: '#2c3452'});
      for (const [dx, dz] of [[-0.9, 1.35], [0.9, 1.35], [-0.9, -1.35], [0.9, -1.35]]) wheel.push({p: [c.x + dx, 0.34, c.z + dz], s: [0.66, 0.28, 0.66], r: [0, 0, Math.PI / 2], c: '#1c1c22'});
    }
    return {body, cab, glass, wheel};
  }, []);
  const lq = Math.round(lamps * 20) / 20;
  const lights = useMemo(() => {
    const l: Inst[] = [];
    for (const c of CARS) for (const s of [-1, 1]) {
      const front = c.yaw === 0 ? -1 : 1;
      l.push({p: [c.x + s * 0.62, 0.72, c.z + front * 2.16], s: [0.36, 0.16, 0.05], c: new THREE.Color('#d8d2c0').lerp(new THREE.Color('#fff8e0'), lq).getStyle()});
      l.push({p: [c.x + s * 0.62, 0.75, c.z - front * 2.16], s: [0.32, 0.14, 0.05], c: new THREE.Color('#8a1020').lerp(new THREE.Color('#ff2a3a'), lq).getStyle()});
    }
    return l;
  }, [lq]);
  return (
    <>
      <InstancedToon geometry={U.box} items={it.body} outline={0.05} castShadow={SHADOWS} />
      <InstancedToon geometry={U.box} items={it.cab} outline={0.05} />
      <InstancedToon geometry={U.box} items={it.glass} kind="basic" />
      <InstancedToon geometry={U.wheel} items={it.wheel} outline={0.04} />
      <InstancedToon geometry={U.box} items={lights} kind="basic" version={lq} />
    </>
  );
};

/** City bus (left lane) — the driver sits inside behind open side windows. */
const Bus: React.FC = () => {
  const x = -2.4, z0 = -9.75;
  const glass = useMemo(() => new THREE.MeshBasicMaterial({color: '#25304a', transparent: true, opacity: 0.38, depthWrite: false}), []);
  return (
    <group position={[x, 0, z0]}>
      <Outlined geometry={U.box} color="#f2c14e" position={[0, 1.15, 0]} scale={[2.5, 1.5, 11.5]} thickness={0.01} />
      <Outlined geometry={U.box} color="#f2c14e" position={[0, 3.05, 0]} scale={[2.5, 0.5, 11.5]} thickness={0.01} />
      <Outlined geometry={U.box} color="#e63946" position={[0, 0.95, 0]} scale={[2.54, 0.22, 11.52]} outline={false} />
      {/* window band: pillars + see-through glass */}
      {Array.from({length: 7}, (_, i) => (
        <Outlined key={i} geometry={U.box} color="#f2c14e" position={[0, 2.35, -5.6 + i * 1.87]} scale={[2.5, 0.92, 0.18]} outline={false} />
      ))}
      <mesh geometry={U.box} material={glass} position={[0, 2.35, 1.825]} scale={[2.46, 0.9, 7.65]} />
      {/* windshield + destination sign */}
      <mesh geometry={U.box} position={[0, 2.25, -5.76]} scale={[2.3, 1.2, 0.04]} material={glass} />
      <mesh geometry={U.box} position={[0, 3.05, -5.77]} scale={[1.8, 0.32, 0.04]}><meshBasicMaterial color="#ff9f1c" /></mesh>
      {[[-1.25, -4], [1.25, -4], [-1.25, 3.8], [1.25, 3.8]].map(([dx, dz], i) => (
        <Outlined key={i} geometry={U.wheel} color="#1c1c22" position={[dx, 0.5, dz]} rotation={[0, 0, Math.PI / 2]} scale={[0.95, 0.35, 0.95]} thickness={0.04} />
      ))}
      <Outlined geometry={U.box} color="#d9d2c8" position={[1.27, 1.6, -4.4]} scale={[0.04, 2.2, 1.2]} outline={false} />
    </group>
  );
};

// ---------------------------------------------------------------- vapour banks
const STREET_BANKS: Bank[] = Array.from({length: 190}, (_, i) => {
  // over the road and the far sidewalk only: never a white wall right in front of the lens
  const s = 1.3 + random(`sbs${i}`) * 1.7;
  // the blob (radius s, +6 % breathing) must stay clear of the walking path at x = CAM_X
  const x = Math.min(W.CAM_X - s * 1.1 - 0.9, -8 + random(`sbx${i}`) * 10.5);
  return {x, y: 0.4 + random(`sby${i}`) * 3.0, z: 34 - random(`sbz${i}`) * 170, s, seed: `sb${i}`};
});
const DECK_BANKS: Bank[] = Array.from({length: 260}, (_, i) => ({
  x: (random(`dbx${i}`) - 0.5) * 90, y: 21 + random(`dby${i}`) * 22, z: 40 - random(`dbz${i}`) * 220, s: 5 + random(`dbs${i}`) * 7, seed: `db${i}`,
}));

const userPuffs = (): Puff[] => W.TL.user_puffs.map((p, i) => {
  const pose = computePose(p.exhale, 30, W.SPEC, () => 0);
  const f = pose.heading;
  return {
    t0: p.exhale, life: i === 0 ? 130 : 95, n: 70, size: 0.13, reach: i === 0 ? 2.8 : 2.2, seed: `me${i}`,
    origin: [pose.pos.x + f.x * 0.2, pose.pos.y - 0.12, pose.pos.z + f.z * 0.2], dir: [f.x, 0.12, f.z],
    color: new THREE.Color('#ffdbe6'),
  };
});

// ---------------------------------------------------------------- main
export const EveryoneVapes: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const dbg = getInputProps() as {nofog?: boolean; novapor?: boolean; nobanks?: boolean; nocrowd?: boolean; aa?: boolean; noshadow?: boolean; hide?: string[]; soft?: boolean; cityoutline?: boolean; nopoint?: boolean};
  const hide = new Set(dbg.hide ?? []);
  const shadowsOn = SHADOWS && !dbg.noshadow;
  const pose: Pose = computePose(frame, fps, W.SPEC, () => 0);
  const tension = smooth(frame, W.TL.tension as [number, number][]);
  const H = clamp01(smooth(frame, W.HAZE));
  const pal = mixPalette(EVERYONE_VAPES, smooth(frame, W.MOOD));
  const deck = smooth(frame, W.DECK);
  const white = smooth(frame, W.WHITE);
  const lamps = clamp01(smooth(frame, W.LAMPS));
  const burst = smooth(frame, W.SUNBURST);
  const rain = smooth(frame, W.RAIN);
  const t = W.crowdTime(frame);

  const hazeCol = new THREE.Color('#ffe1ea').lerp(new THREE.Color('#ffc9d6'), clamp01((smooth(frame, W.MOOD) - 1)));
  const fogCol = pal.horizon.clone().lerp(hazeCol, Math.min(1, H * 1.3));
  const fogDen = dbg.nofog ? 0.0001 : 0.0035 + 0.11 * Math.pow(H, 2.1);
  const zenith = pal.zenith.clone().lerp(fogCol, H * 0.85);
  const horizon = pal.horizon.clone().lerp(fogCol, Math.min(1, H * 1.2));
  const sunDir = dirFromElev(0.8, 0.22);
  const sunCol = new THREE.Color('#fff1d6').lerp(new THREE.Color('#ff8fae'), Math.min(1, H * 1.4));
  const sunGlow = clamp01(1 - H * 1.25) * 0.9 + 0.12 * (1 - H) + burst * 0.6;
  const night = 0;

  const puffsUser = useMemo(userPuffs, []);
  const cits = W.CITIZENS;

  // --- vapour: all puffs + banks into one instanced buffer
  const buf = blobBuffer(MAX_BLOBS);
  const puffBase = new THREE.Color('#fff6f9');
  const wind: [number, number, number] = [0.004, 0.002, -0.006];
  const live: Puff[] = [];
  const sizeK = 1 + H * 0.8;
  for (const c of cits) {
    for (const p0 of c.puffs) {
      if (t < p0 || t > p0 + 170) continue;
      const [px, pz] = W.citPos(c, p0);
      const yawEff = c.v ? (c.v > 0 ? 0 : Math.PI) : c.yaw;
      const m = mouthOf([px, 0, pz], yawEff, c.scale, c.stoop ?? 0);
      live.push({t0: p0, origin: m, dir: [Math.sin(yawEff), 0.25, Math.cos(yawEff)], size: 0.17 * sizeK, reach: 0.9, life: 165, n: 10, seed: `${c.id}-${p0}`});
    }
  }
  for (const p0 of W.DRIVER.puffs) if (t >= p0 && t <= p0 + 170) {
    live.push({t0: p0, origin: [-1.0, 2.35, -12.6], dir: [1, 0.25, 0.15], size: 0.2 * sizeK, reach: 1.2, life: 165, n: 10, seed: `drv-${p0}`});
  }
  for (const p0 of W.PIP.puffs) if (t >= p0 && t <= p0 + 170) {
    live.push({t0: p0, origin: [W.PIP.x - 0.3, 1.6, W.PIP.z], dir: [-1, 0.25, 0.2], size: 0.18 * sizeK, reach: 0.8, life: 165, n: 10, seed: `pip-${p0}`});
  }
  setAvoid(null);
  addPuffs(buf, frame < W.RESET ? puffsUser : [], frame, wind, puffBase, fogCol);
  setAvoid({x: pose.pos.x, y: pose.pos.y, z: pose.pos.z, r: 0.9});
  if (!dbg.nocrowd) addPuffs(buf, live, t, wind, puffBase, fogCol);
  if (!dbg.nobanks) addBanks(buf, STREET_BANKS, frame, clamp01((H - 0.12) / 0.75), [0, -0.004], fogCol.clone().lerp(new THREE.Color('#ffffff'), 0.25));
  setAvoid(null);
  const deckBuf = blobBuffer(DECK_BANKS.length);
  addBanks(deckBuf, DECK_BANKS, frame, deck, [0.01, -0.006], new THREE.Color('#ff9cc0').lerp(fogCol, 0.1 + H * 0.4));

  // --- hands
  const R = handTrack(HAND_R, frame);
  const L = handTrack(HAND_L, frame);
  const moving = clamp01(pose.speed / 1.2);
  const sway = new THREE.Vector3(Math.sin(pose.phase) * 0.008 * moving, -Math.abs(Math.cos(pose.phase)) * 0.012 * moving, 0);
  const inhale = W.TL.user_puffs.reduce((g, p) => Math.max(g, frame >= p.inhale + 15 && frame <= p.exhale ? Math.sin(((frame - p.inhale - 15) / (p.exhale - p.inhale - 15)) * Math.PI) : 0), 0);
  const pct = W.pctAt(frame);
  const blinkOn = Math.floor(frame / 9) % 2 === 0;
  const skin = '#dba183', sleeve = '#2f4a8a';

  // --- shocks / flashes
  const prevYaw = computePose(frame - 1, fps, W.SPEC, () => 0).yaw;
  const whip = frame === W.RESET ? 0 : Math.abs(pose.yaw - prevYaw);
  const shock = pose.shock + whip * 14;
  const flash = Math.max(frame >= 1560 ? Math.exp(-(frame - 1560) / 4) * 0.9 : 0, frame >= 1600 ? Math.exp(-(frame - 1600) / 10) * 0.35 * clamp01((1700 - frame) / 100) : 0);

  // cull citizens behind the camera or lost in the fog
  const visDist = fogDen > 0.02 ? Math.min(140, 2.2 / fogDen) : 400;
  const fwd = pose.heading;
  const seen = (x: number, z: number) => {
    const dx = x - pose.pos.x, dz = z - pose.pos.z;
    return Math.hypot(dx, dz) < visDist && dx * fwd.x + dz * fwd.z > -3;
  };

  const lightTarget = useMemo(() => new THREE.Object3D(), []);
  const focus = pose.pos.clone().addScaledVector(fwd, 12);
  lightTarget.position.copy(focus);
  lightTarget.updateMatrixWorld();

  return (
    <AbsoluteFill style={{background: '#000'}}>
      <Audio src={staticFile('audio/everyone-vapes.wav')} />
      <PostFx shock={shock}>
        <ThreeCanvas width={width} height={height} linear={false} flat={false} dpr={1} shadows={shadowsOn ? (dbg.soft ? 'soft' : 'basic') : false}
          gl={{antialias: !!dbg.aa, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace, preserveDrawingBuffer: true, stencil: true}}
          camera={{fov: 70, position: [W.CAM_X, 1.7, 0], near: 0.06, far: 2500}}>
          <PovCamera pose={pose} />
          <fogExp2 attach="fog" args={[fogCol, fogDen]} />
          <hemisphereLight args={[zenith.clone().lerp(horizon, 0.5), pal.ground.clone().multiplyScalar(0.55), 0.85 + H * 0.25]} />
          <directionalLight position={focus.clone().addScaledVector(sunDir, 60)} target={lightTarget} color={sunCol} intensity={1.6 * (1 - H * 0.75) + burst * 1.6}
            castShadow={shadowsOn} shadow-mapSize={[1024, 1024]} shadow-bias={-0.0006}
            shadow-camera-left={-28} shadow-camera-right={28} shadow-camera-top={28} shadow-camera-bottom={-28} shadow-camera-near={1} shadow-camera-far={140} />
          <primitive object={lightTarget} />
          {/* accent light = the LED's own emissive glow (a PointLight costs ~10 % of the frame in software GL) */}

          <Sky zenith={zenith} horizon={horizon} sunColor={sunCol} sunDir={sunDir} sunGlow={sunGlow}
            moonDir={new THREE.Vector3(0, 1, 0)} moonScale={0.001} moonColor={new THREE.Color('#fff')} night={night} center={pose.pos} />
          {!hide.has('street') && <Street />}
          {!hide.has('city') && <City lamps={lamps} ol={dbg.cityoutline !== false} hide={hide} />}
          {!hide.has('furn') && <Furniture lamps={lamps} frame={frame} />}
          {!hide.has('cars') && <Cars lamps={lamps} />}
          {!hide.has('bus') && <Bus />}
          {seen(W.DRIVER.x, W.DRIVER.z) && (
            <group position={[0, 0.55, 0]}>
              <Citizen position={[W.DRIVER.x, 0, W.DRIVER.z]} yaw={W.DRIVER.yaw} scale={1.05} coat={W.DRIVER.coat} skin={W.DRIVER.skin} hair="cap" hairColor="#1f3a5f"
                raise={W.raiseAt(W.DRIVER.puffs, t)} headYaw={0.15} held={<group scale={2.2}><MiniVape glow={W.raiseAt(W.DRIVER.puffs, t)} /></group>} />
            </group>
          )}

          {!hide.has('cits') && cits.map((c) => {
            const [x, z] = W.citPos(c, t);
            if (!seen(x, z)) return null;
            const yaw = c.v ? (c.v > 0 ? 0 : Math.PI) : c.yaw;
            const after = frame >= 1580 ? clamp01((frame - 1580) / 40) * (1 - clamp01((frame - 1980) / 80)) : 0;
            const r = frame >= W.RESET ? 0 : W.raiseAt(c.puffs, t);
            return (
              <Citizen key={c.id} position={[x, 0.12, z]} yaw={yaw} scale={c.scale} phase={c.v ? t * 0.21 + x : 0} walk={c.v ? 1 : 0}
                raise={r} headPitch={-after * 0.6} headYaw={after * Math.sin(frame * 0.02 + x) * 0.5}
                stoop={c.stoop} cane={c.cane} coat={c.coat} skin={c.skin} hair={c.hair} hairColor={c.hairColor}
                held={<group scale={2.2}><MiniVape glow={r} /></group>} />
            );
          })}
          {seen(W.PIP.x, W.PIP.z) && (
            <Pip position={[W.PIP.x, 0.12, W.PIP.z]} yaw={W.PIP.yaw} phase={0} moving={0} point={W.raiseAt(W.PIP.puffs, t) * 0.5}
              body="#f4f1ea" scarf="#ff2d55" glow="#7ef0ff" frame={frame} />
          )}

          {!dbg.novapor && <VaporMesh buf={buf} max={MAX_BLOBS} emissive={fogCol.clone().multiplyScalar(0.5)} />}
          <VaporMesh buf={deckBuf} max={DECK_BANKS.length} emissive={new THREE.Color('#5a2a3a').lerp(fogCol, H * 0.5)} outline={0.14} />

          {!hide.has('parts') && <Particles frame={frame} seed="rain" count={4200} intensity={rain} center={pose.pos} box={[24, 16, 24]} velocity={[0.004, -0.42, 0.002]}
            size={0.016} stretch={16} color="#ff6f9c" opacity={0.85} />}
          <Particles frame={frame} seed="dust" count={700} intensity={1 - H} center={pose.pos} box={[14, 6, 14]} velocity={[0.004, 0.003, -0.002]}
            size={0.005} color="#fff3d8" opacity={0.6} wobble={0.2} />

          {/* hands + hero device, in camera space */}
          <group position={pose.pos} quaternion={pose.quat} visible={!hide.has('hands')}>
            <group position={R.pos.clone().add(sway)} quaternion={R.quat}>
              <Hand side={1} pose={R.pose} skin={skin} sleeve={sleeve} wristFlex={R.wrist} wristDev={R.dev}>
                <group position={VAPE_IN_HAND.pos} rotation={VAPE_IN_HAND.rot}>
                  <Vape pct={pct} glow={inhale} blinkOn={blinkOn} frame={frame} />
                </group>
              </Hand>
            </group>
            <group position={L.pos.clone().add(sway.clone().multiplyScalar(-1))} quaternion={L.quat}>
              <Hand side={-1} pose={L.pose} skin={skin} sleeve={sleeve} wristFlex={L.wrist} wristDev={L.dev} />
            </group>
          </group>
        </ThreeCanvas>
      </PostFx>
      <Overlay frame={frame} labels={W.TL.labels} captions={W.TL.captions} flash={flash} tension={tension}
        haze={white * 0.95} hazeColor={`#${hazeCol.getHexString()}`} />
    </AbsoluteFill>
  );
};
