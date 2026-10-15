import React, {useMemo} from 'react';
import * as THREE from 'three';
import {AbsoluteFill, Audio, random, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {PovCamera, computePose} from '../../lib/PovCamera';
import {Sky, dirFromElev} from '../../lib/Sky';
import {Particles} from '../../lib/Particles';
import {Outlined, PovHands} from '../../lib/Characters';
import {Shadowed} from '../../lib/ShadowCast';
import {ShadowFigure} from '../../lib/ShadowFigure';
import {Overlay, PostFx} from '../../lib/Overlay';
import {toonProps} from '../../lib/ToonMaterial';
import {SHADOWS_NOON, mixPalette, PaletteC} from '../../lib/palettes';
import {clamp01, smooth, smoothstep} from '../../lib/anim';
import * as W from './world';

const FOG_BASE = 0.0045;
const N_FIG = 44;
const CENTER = new THREE.Vector3(0, 0, 0);

const Ground: React.FC = () => {
  const geo = useMemo(() => {
    const pos: number[] = [], col: number[] = [];
    const p0 = SHADOWS_NOON[0];
    const a = new THREE.Color(p0.ground).multiplyScalar(0.8), b = a.clone().multiplyScalar(0.86), street = a.clone().multiplyScalar(0.55);
    const T = 5, n = 24;
    for (let i = -n; i < n; i++) for (let j = -n; j < n; j++) {
      const x = i * T, z = j * T;
      const r = Math.hypot(x + T / 2, z + T / 2);
      if (r > 118) continue;
      const c = r > 56 ? street : (i + j) % 2 === 0 ? a : b;
      const q = [[x, z], [x, z + T], [x + T, z], [x + T, z], [x, z + T], [x + T, z + T]];
      for (const [px, pz] of q) { pos.push(px, 0, pz); col.push(c.r, c.g, c.b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geo}>
      <meshToonMaterial {...toonProps('#ffffff')} vertexColors />
    </mesh>
  );
};

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  pole: new THREE.CylinderGeometry(0.12, 0.17, 5.6, 6),
  ball: new THREE.IcosahedronGeometry(0.42, 0),
  trunk: new THREE.CylinderGeometry(0.28, 0.4, 3.4, 6),
  crown: new THREE.IcosahedronGeometry(2.1, 0),
  fount: new THREE.CylinderGeometry(1, 1, 1, 10),
  body: new THREE.CylinderGeometry(0.3, 0.36, 1.0, 6),
  head: new THREE.IcosahedronGeometry(0.26, 0),
  limb: new THREE.BoxGeometry(0.14, 0.7, 0.14),
};

type Props = {light: THREE.Vector3; sc: THREE.Color; cast: boolean};
type LightFor = (p: [number, number]) => THREE.Vector3;

const Building: React.FC<{i: number; pal: PaletteC; night: number; lightFor: LightFor; sc: THREE.Color; cast: boolean}> = ({i, pal, night, lightFor, sc, cast}) => {
  const ang = (i / 22) * Math.PI * 2 + random(`ba${i}`) * 0.1;
  const r = 68 + random(`br${i}`) * 6;
  const w = 11 + random(`bw${i}`) * 6, h = 18 + random(`bh${i}`) * 26, d = 11;
  const p: [number, number, number] = [Math.cos(ang) * r, h / 2, Math.sin(ang) * r];
  const col = pal.water.clone().offsetHSL((random(`bc${i}`) - 0.5) * 0.04, 0, (random(`bl${i}`) - 0.5) * 0.16);
  const wins = [];
  for (let c = 0; c < 3; c++) for (let rr = 0; rr < 5; rr++) {
    const on = random(`bw${i}-${c}-${rr}`) > 0.45;
    wins.push(
      <Outlined key={`${c}${rr}`} geometry={G.box} outline={false} color={on ? pal.accent.clone().multiplyScalar(0.7 + night * 0.3) : pal.zenith.clone().multiplyScalar(0.6)}
        emissive={on ? pal.accent.clone().multiplyScalar(night * 0.9) : '#000000'}
        position={[(c - 1) * (w / 3.4), -h / 2 + 5 + rr * ((h - 8) / 5), d / 2 + 0.05]} scale={[w / 6, 1.6, 0.1]} />,
    );
  }
  return (
    <Shadowed position={p} rotation={[0, -ang - Math.PI / 2 + Math.PI, 0]} light={lightFor([p[0], p[2]])} color={sc} castShadow={cast}>
      <Outlined geometry={G.box} outline={false} color={col} scale={[w, h, d]} />
      <Outlined geometry={G.box} outline={false} color={col.clone().multiplyScalar(0.6)} position={[0, h / 2 + 0.4, 0]} scale={[w + 1, 0.8, d + 1]} />
      {wins}
    </Shadowed>
  );
};

const Lamp: React.FC<{p: [number, number]; pal: PaletteC; night: number; lightFor: LightFor; sc: THREE.Color; cast: boolean}> = ({p, pal, night, lightFor, sc, cast}) => (
  <Shadowed position={[p[0], 2.8, p[1]]} light={lightFor(p)} color={sc} castShadow={cast}>
    <Outlined geometry={G.pole} color={pal.water.clone().multiplyScalar(0.35)} />
    <Outlined geometry={G.ball} color={pal.accent} emissive={pal.accent.clone().multiplyScalar(0.25 + night * 0.75)} position={[0, 3.0, 0]} thickness={0.1} />
  </Shadowed>
);

const Tree: React.FC<{p: [number, number]; pal: PaletteC; lightFor: LightFor; sc: THREE.Color; cast: boolean; s: number}> = ({p, pal, lightFor, sc, cast, s}) => (
  <Shadowed position={[p[0], 1.7 * s, p[1]]} scale={s} light={lightFor(p)} color={sc} castShadow={cast}>
    <Outlined geometry={G.trunk} color={pal.ground.clone().multiplyScalar(0.4)} />
    <Outlined geometry={G.crown} color={pal.water.clone().lerp(pal.zenith, 0.35).multiplyScalar(0.8)} position={[0, 3.2, 0]} scale={[1, 1.2, 1]} />
  </Shadowed>
);

const Bench: React.FC<{p: [number, number]; yaw: number; pal: PaletteC; lightFor: LightFor; sc: THREE.Color; cast: boolean}> = ({p, yaw, pal, lightFor, sc, cast}) => (
  <Shadowed position={[p[0], 0, p[1]]} rotation={[0, yaw, 0]} light={lightFor(p)} color={sc} castShadow={cast}>
    <Outlined geometry={G.box} color={pal.water.clone().multiplyScalar(0.7)} position={[0, 0.55, 0]} scale={[2.4, 0.14, 0.8]} />
    <Outlined geometry={G.box} color={pal.water.clone().multiplyScalar(0.7)} position={[0, 1.0, -0.38]} scale={[2.4, 0.7, 0.1]} />
    <Outlined geometry={G.box} color={pal.zenith.clone().multiplyScalar(0.4)} position={[-1, 0.27, 0]} scale={[0.12, 0.55, 0.7]} />
    <Outlined geometry={G.box} color={pal.zenith.clone().multiplyScalar(0.4)} position={[1, 0.27, 0]} scale={[0.12, 0.55, 0.7]} />
  </Shadowed>
);

const Fountain: React.FC<{pal: PaletteC; lightFor: LightFor; sc: THREE.Color; cast: boolean; frame: number}> = ({pal, lightFor, sc, cast, frame}) => (
  <Shadowed position={[8, 0, -13]} light={lightFor([8, -13])} color={sc} castShadow={cast}>
    <Outlined geometry={G.fount} color={pal.ground.clone().multiplyScalar(0.9)} position={[0, 0.35, 0]} scale={[4.2, 0.7, 4.2]} />
    <Outlined geometry={G.fount} color={pal.zenith.clone().lerp(pal.horizon, 0.5)} position={[0, 0.62, 0]} scale={[3.7, 0.2, 3.7]} outline={false} />
    <Outlined geometry={G.fount} color={pal.ground} position={[0, 1.5, 0]} scale={[0.7, 2, 0.7]} />
    <Outlined geometry={G.fount} color={pal.ground.clone().multiplyScalar(0.9)} position={[0, 2.6, 0]} scale={[2, 0.3, 2]} />
    <Outlined geometry={G.ball} color={pal.horizon} position={[0, 3.2 + Math.sin(frame * 0.1) * 0.05, 0]} scale={1.1} />
  </Shadowed>
);

const WALKERS: [number, number][] = [[-9, -10], [10, -8], [-14, 3], [7, 13], [-5, -18], [15, -14]];

const Walker: React.FC<{p: [number, number]; yaw: number; col: THREE.Color; skin: THREE.Color}> = ({p, yaw, col, skin}) => (
  <group position={[p[0], 0, p[1]]} rotation={[0, yaw, 0]}>
    <Outlined geometry={G.limb} color="#2b2b3a" position={[-0.14, 0.35, 0]} />
    <Outlined geometry={G.limb} color="#2b2b3a" position={[0.14, 0.35, 0]} />
    <Outlined geometry={G.body} color={col} position={[0, 1.15, 0]} scale={[1, 1.2, 1]} />
    <Outlined geometry={G.limb} color={col} position={[-0.42, 1.1, 0]} />
    <Outlined geometry={G.limb} color={col} position={[0.42, 1.1, 0]} />
    <Outlined geometry={G.head} color={skin} position={[0, 1.95, 0]} />
  </group>
);

type Fig = {a0: number; r0: number; rs: number; gap: number; sc: number};
const buildFigs = (): Fig[] => Array.from({length: N_FIG}, (_, i) => {
  if (i < WALKERS.length) {
    const [x, z] = WALKERS[i];
    return {a0: Math.atan2(z, x), r0: Math.hypot(x, z), rs: 390 + i * 22, gap: 0.6 + random(`g${i}`) * 3, sc: 1.5};
  }
  return {a0: random(`fa${i}`) * Math.PI * 2, r0: 16 + random(`fr${i}`) * 32, rs: 560 + random(`fs${i}`) * 330, gap: 0.6 + random(`fg${i}`) * 4.5, sc: 1.3 + random(`fz${i}`) * 0.6};
});

export const ShadowsNoon: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const figs = useMemo(buildFigs, []);

  const elev = smooth(frame, W.SUN), az = smooth(frame, W.AZIM);
  const cloud = smooth(frame, W.CLOUD);
  const pal0 = mixPalette(SHADOWS_NOON, smooth(frame, W.MOOD));
  const grey = new THREE.Color('#6c7480');
  const pal: PaletteC = {...pal0, zenith: pal0.zenith.clone().lerp(grey, cloud * 0.7), horizon: pal0.horizon.clone().lerp(grey, cloud * 0.6)};
  const night = clamp01((0.1 - elev) / 0.35);
  const tension = smooth(frame, W.TL.tension as [number, number][]);
  const R = smooth(frame, W.LIGHT_R);
  const pose = computePose(frame, fps, W.SPEC, () => 0);
  const camXZ: [number, number] = [pose.pos.x, pose.pos.z];

  const sunDir = dirFromElev(Math.min(1.45, elev), az);
  const sunW = clamp01((elev + 0.05) / 0.2);
  const sunCol = pal.horizon.clone().lerp(new THREE.Color('#ffffff'), 0.4);
  const castOn = elev > 0.04;
  const wrong = smooth(frame, W.WRONG);
  const sc = pal.ground.clone().multiplyScalar(0.26).lerp(pal.zenith, 0.22);
  const lightFor: LightFor = (p) => {
    const c = Math.max(0.5, Math.cos(elev)), sy = Math.max(0.14, Math.sin(elev));
    const hx = -(camXZ[0] - p[0]), hz = -(camXZ[1] - p[1]);
    const hl = Math.hypot(hx, hz) || 1;
    const ox = sunDir.x * (1 - wrong) + (hx / hl) * c * wrong;
    const oz = sunDir.z * (1 - wrong) + (hz / hl) * c * wrong;
    return new THREE.Vector3(ox, sy, oz).normalize();
  };

  const lightTarget = useMemo(() => new THREE.Object3D(), []);
  lightTarget.position.set(0, 0, 0);
  const fogCol = pal.horizon.clone().multiplyScalar(0.9);
  const fogDen = FOG_BASE + tension * 0.0025 + cloud * 0.002;

  // living shadows
  const edge = smooth(frame, W.EDGE);
  const ringRot = smooth(frame, W.RING_ROT);
  const stretch = smooth(frame, W.STRETCH);
  const ringVisible = frame < W.RESET;
  const approach = (f: Fig) => {
    const prog = smoothstep(f.rs + 10, f.rs + 360, frame);
    const rr = f.r0 + (edge + f.gap - f.r0) * prog;
    const a = f.a0 + ringRot * smoothstep(850, 960, frame);
    return {x: Math.cos(a) * rr, z: Math.sin(a) * rr, prog};
  };

  const mineRise = smooth(frame, W.MINE_RISE);
  const behind = frame >= 1560 && frame < W.RESET;
  const bd = 7.5 - 3.8 * smoothstep(1590, 1640, frame) + (frame > 1640 ? Math.sin((frame - 1640) * 0.7) * 0.05 : 0);
  const minePos: [number, number, number] = behind ? [0, 0, bd] : [0, 0, smooth(frame, W.MINE_Z)];
  const mineYaw = behind ? Math.PI : smooth(frame, W.MINE_YAW);
  const mineWalking = frame > 215 && frame < 400 ? 1 : 0;
  const mineScale = behind ? 1.15 + 0.7 * smoothstep(1580, 1640, frame) : 1.15;
  const mineStretch = behind ? 1 + 0.4 * smoothstep(1600, 1640, frame) : 1;

  const flashSmall = W.TL.impacts.reduce((a, im) => (im.amp < 0.9 && frame >= im.frame ? Math.max(a, im.amp * 0.5 * Math.exp(-(frame - im.frame) / 4)) : a), 0);
  const flashBig = frame >= 1640 ? Math.exp(-(frame - 1640) / 5) : 0;
  const flash = Math.max(flashSmall, flashBig * 0.95);
  const dark = smooth(frame, W.DARK);
  const prevYaw = computePose(frame - 1, fps, W.SPEC, () => 0).yaw;
  const whip = frame >= W.RESET - 8 && frame < 1760 ? 0 : Math.abs(pose.yaw - prevYaw);
  const shock = pose.shock + whip * 22;

  const handsRaise = smooth(frame, W.HANDS);
  const skins = ['#f0c8a0', '#c58c5d', '#8d5a3b'].map((c) => new THREE.Color(c));
  const coats = [pal.accent, pal.horizon, pal.water.clone().lerp(pal.accent, 0.4), pal.zenith.clone().lerp(pal.horizon, 0.5)];
  const walkerShadowsOn = (i: number) => frame < figs[i].rs;
  const easter = frame >= 88 && frame < 101;

  const lampPos: [number, number][] = Array.from({length: 10}, (_, i) => [Math.cos((i / 10) * 6.283 + 0.3) * 21, Math.sin((i / 10) * 6.283 + 0.3) * 21]);
  const treePos: [number, number][] = Array.from({length: 9}, (_, i) => [Math.cos((i / 9) * 6.283 + 0.7) * 32, Math.sin((i / 9) * 6.283 + 0.7) * 32]);
  const benchPos: [number, number, number][] = Array.from({length: 8}, (_, i) => [Math.cos((i / 8) * 6.283 + 0.1) * 15, Math.sin((i / 8) * 6.283 + 0.1) * 15, -((i / 8) * 6.283 + 0.1) + Math.PI / 2]);

  return (
    <AbsoluteFill style={{background: '#000'}}>
      <Audio src={staticFile('audio/shadows-noon.wav')} />
      <PostFx shock={shock}>
        <ThreeCanvas width={width} height={height} linear={false} flat={false} dpr={1}
          gl={{antialias: false, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace, preserveDrawingBuffer: true}}
          camera={{fov: 70, position: [0, 3.4, 10], near: 0.1, far: 2500}}>
          <PovCamera pose={pose} />
          <fogExp2 attach="fog" args={[fogCol, fogDen]} />
          <hemisphereLight args={[pal.zenith.clone().lerp(pal.horizon, 0.5), pal.ground.clone().multiplyScalar(0.6), (0.7 - night * 0.5) * (1 - cloud * 0.3)]} />
          <directionalLight position={sunDir.clone().multiplyScalar(80)} target={lightTarget} color={sunCol} intensity={(1.7 * sunW + 0.15) * (1 - cloud * 0.6)} />
          <primitive object={lightTarget} />
          <pointLight position={[0, 3.2, 0]} color={pal.accent} intensity={R > 0.2 ? 60 + night * 500 : 0} distance={45} decay={2} />

          <Sky zenith={pal.zenith} horizon={pal.horizon} sunColor={sunCol} sunDir={sunDir} sunGlow={sunW * (1 - cloud * 0.9)}
            moonDir={new THREE.Vector3(0, 1, 0)} moonScale={0.001} moonColor={new THREE.Color('#fff')} night={clamp01(night * 1.6)} center={pose.pos} />
          <Ground />

          {Array.from({length: 22}, (_, i) => <Building key={i} i={i} pal={pal} night={night} lightFor={lightFor} sc={sc} cast={castOn} />)}
          {lampPos.map((p, i) => <Lamp key={i} p={p} pal={pal} night={night} lightFor={lightFor} sc={sc} cast={castOn} />)}
          {treePos.map((p, i) => <Tree key={i} p={p} s={0.9 + random(`ts${i}`) * 0.4} pal={pal} lightFor={lightFor} sc={sc} cast={castOn} />)}
          {benchPos.map(([x, z, yw], i) => <Bench key={i} p={[x, z]} yaw={yw} pal={pal} lightFor={lightFor} sc={sc} cast={castOn} />)}
          <Fountain pal={pal} lightFor={lightFor} sc={sc} cast={castOn} frame={frame} />

          {/* frozen passers-by: they stare at you once their shadow leaves */}
          {ringVisible && WALKERS.map((p, i) => {
            const face = Math.atan2(pose.pos.x - p[0], pose.pos.z - p[1]);
            const yaw = frame > figs[i].rs - 60 ? face : random(`wy${i}`) * 6.28;
            return (
              <Shadowed key={i} position={[p[0], 0, p[1]]} rotation={[0, yaw, 0]} light={lightFor(p)} color={sc} castShadow={castOn && walkerShadowsOn(i)}>
                <Walker p={[0, 0]} yaw={0} col={coats[i % coats.length]} skin={skins[i % skins.length]} />
              </Shadowed>
            );
          })}

          {/* your shadow */}
          <ShadowFigure position={minePos} yaw={mineYaw} rise={behind ? 1 : mineRise} scale={mineScale} stretch={mineStretch}
            phase={frame * 0.3} walk={mineWalking} wave={behind ? 0 : smooth(frame, W.MINE_WAVE)} eyes={behind || mineRise > 0.5 ? 1 : 0.6} />

          {ringVisible && figs.map((f, i) => {
            const s = smoothstep(f.rs, f.rs + 40, frame);
            if (s <= 0) return null;
            const q = approach(f);
            const yaw = Math.atan2(pose.pos.x - q.x, pose.pos.z - q.z);
            const moving = q.prog < 1 || (frame > 1200 && frame < 1700) || (frame > 900 && frame < 1200) ? 1 : 0.2;
            return <ShadowFigure key={i} position={[q.x, 0, q.z]} yaw={yaw} rise={s} scale={f.sc} stretch={stretch}
              phase={frame * 0.22 + i * 1.7} walk={moving} eyes={1} />;
          })}
          {easter && <ShadowFigure position={[6, 0, -46]} yaw={0.2} rise={1} scale={2} />}

          {/* the only safe place */}
          {R > 0.2 && (
            <group position={[0, 0, 0]}>
              <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[R, R, 1]}>
                <circleGeometry args={[1, 48]} />
                <meshBasicMaterial color={pal.accent} transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
              </mesh>
              <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[R, R, 1]}>
                <ringGeometry args={[0.94, 1, 64]} />
                <meshBasicMaterial color={pal.accent} transparent opacity={0.9} depthWrite={false} fog={false} />
              </mesh>
              <mesh position={[0, 40, 0]}>
                <cylinderGeometry args={[R * 0.55, R, 80, 32, 1, true]} />
                <meshBasicMaterial color={pal.accent} transparent opacity={0.22 + night * 0.08} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} fog={false} />
              </mesh>
            </group>
          )}

          <Particles frame={frame} seed="dust" count={1500} intensity={R > 0.2 ? 1 : 0.35} center={pose.pos} box={[26, 10, 26]} velocity={[0.01, 0.015, 0.005]} size={0.035} color={pal.accent.clone().lerp(new THREE.Color('#fff'), 0.5)} opacity={R > 0.2 ? 0.8 : 0.35} wobble={0.25} />
          <Particles frame={frame} seed="ash" count={2500} intensity={smoothstep(1200, 1500, frame) * (frame < W.RESET ? 1 : 0)} center={pose.pos} box={[80, 30, 80]} velocity={[0.01, -0.03, 0]} size={0.07} color="#2a2236" opacity={0.9} wobble={0.5} />

          <PovHands position={pose.pos} quaternion={pose.quat} glove={pal.ground.clone().multiplyScalar(0.8)} sleeve={pal.water.clone().multiplyScalar(0.8)} raise={handsRaise}
            swing={Math.sin(pose.phase) * clamp01(pose.speed / 4)} frame={frame} />
        </ThreeCanvas>
      </PostFx>
      <Overlay frame={frame} labels={W.TL.labels} captions={W.TL.captions} flash={flash} tension={tension} dark={dark} />
    </AbsoluteFill>
  );
};
