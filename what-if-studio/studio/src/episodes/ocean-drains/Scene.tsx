import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {AbsoluteFill, random, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {Audio, staticFile} from 'remotion';
import {PovCamera, computePose, pathPoint} from '../../lib/PovCamera';
import {Sky, dirFromElev} from '../../lib/Sky';
import {Particles} from '../../lib/Particles';
import {Outlined, Pip, PovHands} from '../../lib/Characters';
import {Overlay, PostFx} from '../../lib/Overlay';
import {toonProps} from '../../lib/ToonMaterial';
import {OCEAN_DRAINS, mixPalette} from '../../lib/palettes';
import {clamp01, smooth, smoothstep} from '../../lib/anim';
import {DURATION, HANDS, IMPACT_FRAME, MOOD, MOON, MOON_SCALE, POINT, SPEC, SUN, TL, WATER, groundH, waveZ} from './world';

const SHADOWS = false;
const FOG_BASE = 0.0022;

const Terrain: React.FC<{ground: THREE.Color; dark: THREE.Color; water: THREE.Color}> = ({ground, dark, water}) => {
  const geo = useMemo(() => {
    const step = 3, x0 = -150, x1 = 150, z0 = 40, z1 = -420;
    const nx = Math.round((x1 - x0) / step), nz = Math.round((z0 - z1) / step);
    const pos: number[] = [], col: number[] = [];
    const wet = ground.clone().multiplyScalar(0.62), deep = water.clone().multiplyScalar(0.55).lerp(dark, 0.3);
    const c = new THREE.Color();
    const vert = (x: number, z: number) => [x, groundH(x, z), z];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const xa = x0 + i * step, xb = xa + step, za = z0 - j * step, zb = za - step;
      const A = vert(xa, za), B = vert(xb, za), C = vert(xa, zb), D = vert(xb, zb);
      const tri = (p: number[][], k: number) => {
        const h = (p[0][1] + p[1][1] + p[2][1]) / 3;
        const jit = (random(`t${i}-${j}-${k}`) - 0.5) * 0.08;
        if (h > 6) c.copy(dark).lerp(ground, 0.25);
        else if (h > 0.2) c.copy(ground);
        else if (h > -6) c.copy(ground).lerp(wet, smoothstep(0.2, -4, h));
        else c.copy(wet).lerp(deep, smoothstep(-6, -14, h));
        c.offsetHSL(0, 0, jit);
        for (const v of p) { pos.push(v[0], v[1], v[2]); col.push(c.r, c.g, c.b); }
      };
      tri([A, B, C], 0); tri([B, D, C], 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshToonMaterial {...toonProps('#ffffff')} vertexColors />
    </mesh>
  );
};

const Water: React.FC<{level: number; frame: number; color: THREE.Color}> = ({level, frame, color}) => {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1800, 1800, 120, 120);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -300);
    return g;
  }, []);
  const base = useMemo(() => geo.attributes.position.array.slice() as Float32Array, [geo]);
  useLayoutEffect(() => {
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2];
      p.setY(i, Math.sin(x * 0.09 + frame * 0.06) * 0.18 + Math.sin(z * 0.11 + frame * 0.045) * 0.16);
    }
    p.needsUpdate = true;
  }, [frame]);
  return (
    <mesh geometry={geo} position={[0, level, 0]} receiveShadow>
      <meshToonMaterial {...toonProps(color)} transparent opacity={0.9} />
    </mesh>
  );
};

type Inst = {geometry: THREE.BufferGeometry; matrices: THREE.Matrix4[]; color: THREE.ColorRepresentation; outline?: boolean};
const Instances: React.FC<Inst> = ({geometry, matrices, color}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    matrices.forEach((m, i) => ref.current!.setMatrixAt(i, m));
    ref.current!.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, matrices.length]} frustumCulled={false}>
      <meshToonMaterial {...toonProps(color)} />
    </instancedMesh>
  );
};

const mat = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

const Decor: React.FC<{ground: THREE.Color; dark: THREE.Color; water: THREE.Color; accent: THREE.Color}> = ({ground, dark, water, accent}) => {
  const d = useMemo(() => {
    const weeds: THREE.Matrix4[] = [], rocks: THREE.Matrix4[] = [], stacks: THREE.Matrix4[] = [], islands: THREE.Matrix4[] = [];
    for (let i = 0; i < 700 && weeds.length < 420; i++) {
      const x = (random(`wx${i}`) - 0.5) * 140, z = -10 - random(`wz${i}`) * 140;
      const h = groundH(x, z);
      if (h > -0.5) continue;
      const s = 0.6 + random(`ws${i}`) * 1.1;
      weeds.push(mat(x, h + s * 0.7, z, s * 0.5, s * 1.6, s * 0.5, (random(`wr${i}`) - 0.5) * 0.4, 0, (random(`wq${i}`) - 0.5) * 0.4));
    }
    for (let i = 0; i < 170; i++) {
      const x = (random(`rx${i}`) - 0.5) * 220, z = 30 - random(`rz${i}`) * 260;
      const h = groundH(x, z);
      const s = 0.5 + random(`rs${i}`) * random(`rs2${i}`) * 4;
      rocks.push(mat(x, h + s * 0.3, z, s, s * 0.7, s, random(`ra${i}`) * 3, random(`rb${i}`) * 3, 0));
    }
    for (let i = 0; i < 9; i++) {
      const x = (random(`sx${i}`) - 0.5) * 220, z = -230 - random(`sz${i}`) * 90;
      const s = 14 + random(`ss${i}`) * 16;
      stacks.push(mat(x, -16 + s * 1.2, z, s * 0.5, s * 2.4, s * 0.5, 0, random(`sr${i}`) * 3, 0));
    }
    for (let i = 0; i < 14; i++) {
      const x = -700 + i * 110 + random(`ix${i}`) * 60, s = 60 + random(`is${i}`) * 110;
      islands.push(mat(x, s * 0.4 - 20, -620 - random(`iz${i}`) * 80, s * 1.8, s, s * 1.2, 0, random(`ir${i}`) * 3, 0));
    }
    return {weeds, rocks, stacks, islands};
  }, []);
  const G = useMemo(() => ({
    weed: new THREE.ConeGeometry(0.5, 1, 4), rock: new THREE.IcosahedronGeometry(1, 0),
    stack: new THREE.ConeGeometry(1, 1, 5), island: new THREE.ConeGeometry(1, 1, 6),
  }), []);
  return (
    <>
      <Instances geometry={G.weed} matrices={d.weeds} color={water.clone().lerp(accent, 0.15).multiplyScalar(0.7)} />
      <Instances geometry={G.rock} matrices={d.rocks} color={dark.clone().lerp(ground, 0.35)} />
      <Instances geometry={G.stack} matrices={d.stacks} color={dark.clone().lerp(ground, 0.2)} />
      <Instances geometry={G.island} matrices={d.islands} color={dark.clone().multiplyScalar(0.8)} />
    </>
  );
};

const BoatGeo = {
  hull: new THREE.BoxGeometry(2.6, 1.3, 7), prow: new THREE.ConeGeometry(1.84, 3, 4), mast: new THREE.CylinderGeometry(0.08, 0.1, 7, 5),
  sail: new THREE.ConeGeometry(2.2, 5, 3), cabin: new THREE.BoxGeometry(1.6, 1.1, 1.8),
};
const Boat: React.FC<{p: [number, number]; yaw: number; roll: number; s: number; wood: THREE.Color; sail: THREE.Color}> = ({p, yaw, roll, s, wood, sail}) => {
  const y = groundH(p[0], p[1]);
  return (
    <group position={[p[0], y + 0.2 * s, p[1]]} rotation={[0.06, yaw, roll]} scale={s}>
      <Outlined geometry={BoatGeo.hull} color={wood} position={[0, 0.5, 0]} />
      <Outlined geometry={BoatGeo.prow} color={wood} position={[0, 0.5, -4.4]} rotation={[-Math.PI / 2, Math.PI / 4, 0]} scale={[0.7, 1, 0.5]} />
      <Outlined geometry={BoatGeo.cabin} color={wood.clone().multiplyScalar(1.3)} position={[0, 1.6, 1.6]} />
      <Outlined geometry={BoatGeo.mast} color={wood.clone().multiplyScalar(0.7)} position={[0, 4.2, -0.8]} rotation={[0, 0, 0.08]} />
      <Outlined geometry={BoatGeo.sail} color={sail} position={[0, 4.6, -0.7]} rotation={[0, Math.PI / 2, 0.1]} scale={[0.2, 1, 1]} thickness={0.03} />
    </group>
  );
};

const RuinGeo = {
  col: new THREE.CylinderGeometry(0.7, 0.9, 1, 6), beam: new THREE.BoxGeometry(1, 1, 1), crystal: new THREE.OctahedronGeometry(1, 0),
};
const Ruins: React.FC<{stone: THREE.Color; glow: THREE.Color; frame: number; night: number}> = ({stone, glow, frame, night}) => {
  const cols: [number, number, number, number, number][] = [
    [-7, -112, 7, 0, 0], [7.5, -114, 8, 0, 0.05], [-12, -120, 4.5, 0.25, 0.1], [12, -121, 6.5, 0, 0], [-5.5, -127, 9, 0, 0], [5.5, -127, 9, 0, 0],
    [-16, -131, 3, -0.4, 0.3], [15, -133, 5, 0.2, 0], [-2, -138, 2.2, 0, 0.5],
  ];
  const pulse = 1 + Math.sin(frame * 0.08) * 0.08;
    return (
    <group>
      {cols.map(([x, z, h, rz, rx], i) => (
        <Outlined key={i} geometry={RuinGeo.col} color={stone} position={[x, groundH(x, z) + h / 2 - 0.2, z]} rotation={[rx, i, rz]} scale={[1, h, 1]} thickness={0.025} />
      ))}
      <Outlined geometry={RuinGeo.beam} color={stone} position={[0, -11 + 9.4, -127]} scale={[13.5, 1.2, 1.6]} thickness={0.02} />
      <Outlined geometry={RuinGeo.beam} color={stone.clone().multiplyScalar(0.85)} position={[0, -10.6, -124]} scale={[18, 0.8, 9]} thickness={0.015} />
      <Outlined geometry={RuinGeo.beam} color={stone.clone().multiplyScalar(0.8)} position={[0, -10.9, -121]} scale={[22, 0.6, 14]} thickness={0.015} />
      <Outlined geometry={RuinGeo.crystal} color={glow} emissive={glow.clone().multiplyScalar(0.7 + night * 0.3)} position={[0, -5.2 + Math.sin(frame * 0.05) * 0.4, -127]} rotation={[0, frame * 0.02, 0]} scale={[1.1 * pulse, 2.2 * pulse, 1.1 * pulse]} shadow={false} />
      <pointLight position={[0, -4.5, -124]} color={glow} intensity={(40 + night * 260) * pulse} distance={70} decay={2} />
    </group>
  );
};

const FishGeo = new THREE.ConeGeometry(0.22, 0.9, 4);
const Fish: React.FC<{frame: number; colorA: THREE.Color; colorB: THREE.Color}> = ({frame, colorA, colorB}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const data = useMemo(() => Array.from({length: 70}, (_, i) => {
    const x = (random(`fx${i}`) - 0.5) * 50, z = -15 - random(`fz${i}`) * 95;
    return {x, z, y: groundH(x, z), ph: random(`fp${i}`) * 6.28, r: random(`fr${i}`) * 3.14, s: 0.8 + random(`fs${i}`) * 1.4};
  }), []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const life = 1 - smoothstep(300, 1100, frame);
    data.forEach((d, i) => {
      const water = smooth(frame, WATER);
      const dry = d.y > water ? 1 : 0;
      const flop = Math.max(0, Math.sin(frame * 0.5 + d.ph)) * life * dry;
      o.position.set(d.x, d.y + 0.15 + flop * 0.5, d.z);
      o.rotation.set(Math.PI / 2 + flop * 0.5, d.r + flop * 0.6, 0);
      o.scale.setScalar(d.s);
      o.updateMatrix();
      ref.current!.setMatrixAt(i, o.matrix);
      ref.current!.setColorAt(i, i % 2 ? colorA : colorB);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
  }, [frame]);
  return (
    <instancedMesh ref={ref} args={[FishGeo, undefined, 70]} frustumCulled={false} castShadow>
      <meshToonMaterial {...toonProps('#ffffff')} />
    </instancedMesh>
  );
};

const Palm: React.FC<{p: [number, number]; s: number; trunk: THREE.Color; leaf: THREE.Color; r: number}> = ({p, s, trunk, leaf, r}) => (
  <group position={[p[0], groundH(p[0], p[1]) - 0.2, p[1]]} rotation={[0, r, 0]} scale={s}>
    <Outlined geometry={RuinGeo.col} color={trunk} position={[0, 2.5, 0]} rotation={[0, 0, 0.12]} scale={[0.4, 5, 0.4]} />
    <group position={[0.6, 5.1, 0]}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Outlined key={i} geometry={FishGeo} color={leaf} rotation={[0.45, (i * Math.PI) / 3, Math.PI / 2 + 0.35]} position={[Math.cos((i * Math.PI) / 3) * 1.3, 0, -Math.sin((i * Math.PI) / 3) * 1.3]} scale={[2.2, 3.5, 0.6]} />
      ))}
    </group>
  </group>
);

export const OceanDrains: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();

  const mood = smooth(frame, MOOD);
  const pal = mixPalette(OCEAN_DRAINS, mood);
  const elev = smooth(frame, SUN);
  const moonElev = smooth(frame, MOON);
  const night = clamp01((0.02 - elev) / 0.3);
  const tension = smooth(frame, TL.tension as [number, number][]);
  const level = smooth(frame, WATER);

  const pose = computePose(frame, fps, SPEC, groundH);
  const sunDir = dirFromElev(elev, 0.25);
  const moonDir = dirFromElev(moonElev, 0.2);
  const sunW = clamp01((elev + 0.05) / 0.2);
  const lightDir = sunDir.clone().multiplyScalar(sunW).add(moonDir.clone().multiplyScalar(1 - sunW)).normalize();
  const sunCol = pal.horizon.clone().lerp(new THREE.Color('#ffffff'), 0.3);
  const moonCol = new THREE.Color('#dfe8ff').lerp(pal.accent, clamp01(mood - 1) * 0.55);
  const lightCol = sunCol.clone().lerp(moonCol, 1 - sunW);
  const lightInt = 2.6 * sunW + 0.85 * night * (1 - sunW) + 0.2;
  const fogCol = pal.horizon.clone().multiplyScalar(0.9);
  const fogDen = FOG_BASE + tension * 0.0016;

  const lightTarget = useMemo(() => new THREE.Object3D(), []);
  lightTarget.position.copy(pose.pos);
  const lampInt = 22 * night;

  // Wave
  const zw = waveZ(frame);
  const waveH = 70 * smoothstep(1400, 1500, frame) * (frame < 1990 ? 1 : 0);
  const showWave = waveH > 0.5;
  const waveCol = pal.water.clone().lerp(pal.accent, clamp01(mood - 1) * 0.35);

  // Pip
  const uPip = smooth(frame + 25, SPEC.u) + (frame > 1600 ? 0.015 : 0);
  const pp = pathPoint(SPEC, uPip), pq = pathPoint(SPEC, uPip + 0.004), pr = pathPoint(SPEC, uPip - 0.004);
  const tan = pq.clone().sub(pr).setY(0);
  const tl = tan.length();
  const run = pose.speed;
  const pipFwd = tl > 1e-5 ? tan.clone().divideScalar(tl) : new THREE.Vector3(0, 0, -1);
  const lead = frame > 1600 ? -1 : 1;
  const pipRight = new THREE.Vector3(-pipFwd.z, 0, pipFwd.x).multiplyScalar(2.4 * lead * (frame > 1600 ? -1 : 1));
  const pipXZ = pp.clone().add(pipRight);
  const pipYaw = frame > 1600 || tl < 1e-5 ? (frame > 1560 ? 3.14 - 0.3 : 0.1) : Math.atan2(pipFwd.x, -pipFwd.z);
  const showPip = frame > 230 && frame < 1985;
  const pipScale = showPip ? Math.min(1, (frame - 230) / 18) : 0;
  const pipFace = frame >= 1200 && frame < 1540 ? 0 : pipYaw;

  const flashSmall = TL.impacts.reduce((a, im) => (im.amp < 1 && frame >= im.frame ? Math.max(a, im.amp * 0.5 * Math.exp(-(frame - im.frame) / 4)) : a), 0);
  const flashBig = smooth(frame, [[0, 0], [1940, 0], [1975, 1], [2045, 1], [2110, 0], [2250, 0]]);
  const flash = Math.max(flashBig, flashSmall);

  const prevYaw = computePose(frame - 1, fps, SPEC, groundH).yaw;
  const whip = frame >= 1990 && frame < 2040 ? 0 : Math.abs(pose.yaw - prevYaw);
  const shock = pose.shock + whip * 22;

  const wood = pal.ground.clone().multiplyScalar(0.45).lerp(pal.zenith, 0.25);
  const stone = pal.ground.clone().lerp(pal.water, 0.45).multiplyScalar(0.55);
  const dark = pal.zenith.clone().lerp(pal.ground, 0.15);
  const groundC = new THREE.Color(OCEAN_DRAINS[0].ground);
  const darkC = new THREE.Color(OCEAN_DRAINS[0].zenith);
  const waterC = new THREE.Color(OCEAN_DRAINS[0].water);

  const handsRaise = smooth(frame, HANDS);
  const camCenter = pose.pos;
  const runAmt = clamp01(pose.speed / 5);

  return (
    <AbsoluteFill style={{background: '#000'}}>
      <Audio src={staticFile('audio/ocean-drains.wav')} />
      <PostFx shock={shock}>
        <ThreeCanvas width={width} height={height} linear={false} flat={false} dpr={1} shadows={SHADOWS}
          gl={{antialias: true, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace, preserveDrawingBuffer: true}}
          camera={{fov: 70, position: [0, 3.7, 12], near: 0.1, far: 2500}}>
          <PovCamera pose={pose} />
          <fogExp2 attach="fog" args={[fogCol, fogDen]} />
          <hemisphereLight args={[pal.zenith.clone().lerp(pal.horizon, 0.45), pal.ground.clone().multiplyScalar(0.55), 0.85 - night * 0.35]} />
          <directionalLight position={pose.pos.clone().addScaledVector(lightDir, 80)} target={lightTarget} color={lightCol} intensity={lightInt}
            castShadow={SHADOWS} shadow-mapSize-width={1024} shadow-mapSize-height={1024}
            shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={30} shadow-camera-bottom={-30}
            shadow-camera-near={1} shadow-camera-far={220} shadow-bias={-0.0008} />
          <primitive object={lightTarget} />
          <pointLight position={pose.pos.clone().add(new THREE.Vector3(0, 0.3, 0))} color={pal.horizon.clone().lerp(new THREE.Color('#fff'), 0.6)} intensity={lampInt} distance={32} decay={2} />

          <Sky zenith={pal.zenith} horizon={pal.horizon} sunColor={sunCol} sunDir={sunDir} sunGlow={sunW}
            moonDir={moonDir} moonScale={smooth(frame, MOON_SCALE)} moonColor={moonCol} night={clamp01(night * 1.4)} center={pose.pos} />

          <Terrain ground={groundC} dark={darkC} water={waterC} />
          <Water level={level} frame={frame} color={pal.water} />
          <Decor ground={groundC} dark={dark} water={waterC} accent={pal.accent} />

          <Palm p={[-9, 8]} s={1.2} trunk={wood} leaf={waterC.clone().multiplyScalar(0.6)} r={0.3} />
          <Palm p={[10, 5]} s={1} trunk={wood} leaf={waterC.clone().multiplyScalar(0.6)} r={2} />
          <Palm p={[-17, -1]} s={1.4} trunk={wood} leaf={waterC.clone().multiplyScalar(0.6)} r={4} />

          <Boat p={[-14, -35]} yaw={0.5} roll={0.35} s={1.5} wood={wood} sail={pal.accent} />
          <Boat p={[16, -58]} yaw={-0.8} roll={-0.5} s={1} wood={wood} sail={pal.accent.clone().lerp(pal.horizon, 0.4)} />
          <Boat p={[-20, -88]} yaw={2.2} roll={0.2} s={2} wood={wood} sail={pal.accent} />
          <Boat p={[9, -96]} yaw={0.1} roll={0.6} s={0.8} wood={wood} sail={pal.horizon} />
          <Fish frame={frame} colorA={pal.accent} colorB={pal.horizon} />
          <Ruins stone={stone} glow={pal.accent} frame={frame} night={night} />

          {showPip && (
            <Pip position={[pipXZ.x, groundH(pipXZ.x, pipXZ.z), pipXZ.z]} yaw={pipFace} phase={pp.x * 0 + smooth(frame + 25, SPEC.u) * 440 / 0.75 * Math.PI}
              moving={clamp01(run / 1.2)} point={smooth(frame, POINT)} scale={pipScale} body={pal.horizon.clone().lerp(new THREE.Color('#ffffff'), 0.2)}
              scarf={pal.accent} glow={pal.accent.clone().lerp(new THREE.Color('#fff'), 0.4)} frame={frame} />
          )}

          {showWave && (
            <group>
              <mesh position={[0, level + waveH / 2 - 4, zw - 200]}>
                <boxGeometry args={[1400, waveH + 8, 400]} />
                <meshToonMaterial {...toonProps(waveCol.clone().multiplyScalar(0.45))} fog={false} emissive={pal.accent.clone().multiplyScalar(0.05)} />
              </mesh>
              <mesh position={[0, level + waveH - 3.4, zw - 3]}>
                <boxGeometry args={[1400, 1.8, 7]} />
                <meshToonMaterial {...toonProps('#ffffff')} emissive="#bbbbbb" fog={false} />
              </mesh>
            </group>
          )}

          <Particles frame={frame} seed="dust" count={1200} intensity={(1 - night) * 0.7 * (frame < 1990 ? 1 : 1)} center={camCenter} box={[60, 12, 60]} velocity={[0.12, 0.01, -0.05]} size={0.05} color={pal.horizon.clone().lerp(new THREE.Color('#fff'), 0.5)} opacity={0.5} wobble={0.3} />
          <Particles frame={frame} seed="plankton" count={2600} intensity={night * (1 - smoothstep(1900, 1960, frame))} center={camCenter} box={[60, 16, 80]} velocity={[0, 0.012, 0]} size={0.055} color={pal.accent.clone().lerp(new THREE.Color('#fff'), 0.3)} wobble={0.6} />
          <Particles frame={frame} seed="drops" count={2400} intensity={smoothstep(1230, 1400, frame) * (frame < 1990 ? 1 : 0)} center={camCenter.clone().add(new THREE.Vector3(0, 12, -30))} box={[90, 60, 120]} velocity={[0, 0.1, 0]} size={0.07} color="#cfe6ff" opacity={0.85} />
          <Particles frame={frame} seed="spray" count={3000} intensity={smoothstep(1700, 1900, frame) * (frame < 1990 ? 1 : 0)} center={new THREE.Vector3(camCenter.x, 6, zw + 4)} box={[110, 26, 60]} velocity={[0, 0.03, 0.5]} size={0.3} color="#ffffff" opacity={0.8} wobble={0.8} />

          <PovHands position={pose.pos} quaternion={pose.quat} glove={pal.ground.clone().multiplyScalar(0.7)} sleeve={pal.accent.clone().multiplyScalar(0.7)} raise={handsRaise}
            swing={Math.sin(pose.phase) * runAmt * 1.5} frame={frame} />
        </ThreeCanvas>
      </PostFx>
      <Overlay frame={frame} labels={TL.labels} captions={TL.captions} flash={flash} tension={tension} />
    </AbsoluteFill>
  );
};

export const DURATION_FRAMES = DURATION;
export const IMPACT = IMPACT_FRAME;
