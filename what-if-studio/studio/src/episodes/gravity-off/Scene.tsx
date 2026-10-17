import React, {useLayoutEffect, useMemo} from 'react';
import * as THREE from 'three';
import {AbsoluteFill, Audio, random, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {PovCamera, computePose, pathPoint} from '../../lib/PovCamera';
import {Sky, dirFromElev} from '../../lib/Sky';
import {Particles} from '../../lib/Particles';
import {Outlined, Pip, PovHands} from '../../lib/Characters';
import {Overlay, PostFx} from '../../lib/Overlay';
import {LiftField, LiftItem, scatterItems} from '../../lib/Debris';
import {Instances, Terrain, mat4} from '../../lib/Scenery';
import {toonProps} from '../../lib/ToonMaterial';
import {GRAVITY_OFF, mixPalette} from '../../lib/palettes';
import {Key, clamp01, smooth, smoothstep} from '../../lib/anim';
import {CAM_H, CUP, DURATION, G_KEYS, HANDS, LAND, MOOD, PLAZA, POINT, SEA_H, SPEC, SUN, TL, groundH} from './world';

const SHADOWS = false;
const g = (f: number) => smooth(f, G_KEYS);
const C = (h: string) => new THREE.Color(h);

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  rock: new THREE.IcosahedronGeometry(0.7, 0),
  cone: new THREE.ConeGeometry(0.7, 1, 5),
  trunk: new THREE.CylinderGeometry(0.5, 0.7, 1, 5),
  roof: new THREE.ConeGeometry(0.75, 1, 4),
  pole: new THREE.CylinderGeometry(0.5, 0.5, 1, 5),
  cup: new THREE.CylinderGeometry(0.075, 0.055, 0.12, 8),
  plane: new THREE.PlaneGeometry(1, 1),
};

type BuildingSpec = {x: number; z: number; w: number; d: number; h: number; side: 1 | -1};
const BUILDINGS: BuildingSpec[] = (() => {
  const out: BuildingSpec[] = [];
  for (let i = 0; i < 9; i++) {
    for (const side of [-1, 1] as const) {
      const z = 28 - i * 10.5 + random(`bz${i}${side}`) * 2;
      const w = 9 + random(`bw${i}${side}`) * 4, d = 8 + random(`bd${i}${side}`) * 2;
      out.push({x: side * (17.5 + w / 2 + random(`bx${i}${side}`) * 2), z, w, d, h: 8 + random(`bh${i}${side}`) * 14, side});
    }
  }
  return out;
})();

const World: React.FC<{frame: number; pal: ReturnType<typeof mixPalette>; night: number}> = ({frame, pal, night}) => {
  const base = useMemo(() => GRAVITY_OFF.map((p) => ({ground: C(p.ground), water: C(p.water), accent: C(p.accent), zenith: C(p.zenith), horizon: C(p.horizon)})), []);
  const P0 = base[0];
  const items = useMemo(() => {
    const stone = [P0.ground.clone().multiplyScalar(1.05), P0.ground.clone().multiplyScalar(0.82)];
    const crate = [C('#b5733f'), C('#8f5a34'), C('#c98b4e'), P0.accent.clone().multiplyScalar(0.8)];
    const rocks = [C('#7d7f8c'), C('#9a9ca8'), C('#6a6d7a')];
    const leaf = [P0.water.clone().multiplyScalar(0.7), C('#3c8f5d'), C('#4fa86a')];
    const tiles: LiftItem[] = [];
    for (let x = -14, i = 0; x <= 14; x += 4) for (let z = 28; z >= -56; z -= 4, i++) {
      const r = (k: string) => random(`tile${i}-${k}`);
      tiles.push({
        pos: [x, groundH(x, z) + 0.12, z], scale: [3.7, 0.28, 3.7], rot: [0, 0, 0], color: stone[(Math.round(x / 4) + Math.round(z / 4)) & 1],
        H: 6 + r('h') * r('h2') * 330, delay: r('d') * 26, spin: [(r('a') - 0.5) * 7, (r('b') - 0.5) * 7, (r('c') - 0.5) * 7],
        drift: [(r('x') - 0.5) * 30, (r('z') - 0.5) * 30],
      });
    }
    const crates = scatterItems('crate', 90, {x: [-15, 15], z: [-54, 26]}, [0.6, 1.6], [20, 520], crate, groundH, (x, z) => !(Math.abs(x) < 4 && z > 0));
    const rks = scatterItems('rock', 80, {x: [-90, 90], z: [-52, 80]}, [0.8, 3.2], [20, 480], rocks, groundH, (x, z) => !PLAZA(x, z) && !(Math.abs(x) < 20 && z > 0));
    const pairs: LiftItem[][] = [[], []];
    scatterItems('tree', 26, {x: [-70, 70], z: [-45, 90]}, [1, 1.6], [30, 420], leaf, groundH, (x, z) => !PLAZA(x, z) && Math.abs(x) > 40 || z > 30)
      .forEach((t, i) => {
        const s = t.scale[0], gh = t.pos[1] - t.scale[1] * 0.5;
        const sync = {H: t.H, delay: t.delay, spin: [0, t.spin[1] * 0.3, 0] as [number, number, number], drift: t.drift};
        pairs[0].push({...sync, pos: [t.pos[0], gh + 1.4 * s, t.pos[2]], scale: [0.5 * s, 2.8 * s, 0.5 * s], rot: [0, 0, 0], color: C('#6b4a35')});
        pairs[1].push({...sync, pos: [t.pos[0], gh + 4.2 * s, t.pos[2]], scale: [3.4 * s, 4.6 * s, 3.4 * s], rot: [0, t.rot[1], 0], color: t.color});
      });
    const benches = scatterItems('bench', 16, {x: [-12, 12], z: [-52, 20]}, [1, 1.2], [30, 380], [C('#7a4f33'), C('#4d6b8a')], groundH)
      .map((b) => ({...b, scale: [2.4, 0.55, 0.8] as [number, number, number]}));
    const cars = scatterItems('car', 7, {x: [-10, 10], z: [-50, 14]}, [1, 1], [40, 460], [P0.accent, C('#f2c14e'), C('#4a9fd8'), C('#e8e8ee'), C('#7bd88f')], groundH)
      .map((b) => ({...b, scale: [4.2, 1.5, 1.9] as [number, number, number], pos: [b.pos[0], groundH(b.pos[0], b.pos[2]) + 0.75, b.pos[2]] as [number, number, number]}));
    const roofs: LiftItem[] = BUILDINGS.map((b, i) => ({
      pos: [b.x, groundH(b.x, b.z) + b.h + 1.6, b.z], scale: [b.w * 1.35, 3.2, b.d * 1.35], rot: [0, Math.PI / 4, 0], color: [C('#c4553d'), C('#a8453a'), C('#6d7fa6')][i % 3],
      H: 60 + random(`rf${i}`) * 300, delay: random(`rd${i}`) * 26, spin: [(random(`ra${i}`) - 0.5) * 3, (random(`rb${i}`) - 0.5) * 8, (random(`rc${i}`) - 0.5) * 3],
      drift: [(random(`rx${i}`) - 0.5) * 50, (random(`rz${i}`) - 0.5) * 50],
    }));
    return {tiles, crates, rks, trunks: pairs[0], crowns: pairs[1], benches, cars, roofs};
  }, []);

  const fixed = useMemo(() => {
    const bld: THREE.Matrix4[] = [], bcol: THREE.Color[] = [], win: THREE.Matrix4[] = [];
    BUILDINGS.forEach((b, i) => {
      const gy = groundH(b.x, b.z);
      bld.push(mat4(b.x, gy + b.h / 2, b.z, b.w, b.h, b.d));
      bcol.push([C('#c9a98a'), C('#b79b8b'), C('#d6b99a'), C('#a99aa5')][i % 4]);
      const fx = b.x - b.side * (b.w / 2 + 0.03);
      for (let fl = 0; fl < Math.floor(b.h / 3.1); fl++) for (let c = 0; c < 3; c++) {
        if (random(`w${i}-${fl}-${c}`) < 0.18) continue;
        win.push(mat4(fx, gy + 2 + fl * 3.1, b.z - b.d / 2 + (c + 0.5) * (b.d / 3), 0.05, 1.5, 1.4));
      }
    });
    const far: THREE.Matrix4[] = [];
    for (let i = 0; i < 46; i++) {
      const x = -260 + i * 11.5 + random(`fx${i}`) * 6, h = 8 + random(`fh${i}`) * 22, z = 130 + random(`fz${i}`) * 90;
      far.push(mat4(x, h / 2 + 5, z, 8 + random(`fw${i}`) * 8, h, 8));
    }
    const lampP: THREE.Matrix4[] = [], lampH: THREE.Matrix4[] = [];
    for (let i = 0; i < 9; i++) for (const sx of [-15.5, 15.5]) {
      const z = 28 - i * 10; const y = groundH(sx, z);
      lampP.push(mat4(sx, y + 2.2, z, 0.18, 4.4, 0.18));
      lampH.push(mat4(sx, y + 4.5, z, 0.7, 0.35, 0.7));
    }
    const mount: THREE.Matrix4[] = [];
    for (let i = 0; i < 14; i++) {
      const x = -330 + i * 52 + random(`mx${i}`) * 20, s = 60 + random(`ms${i}`) * 50;
      mount.push(mat4(x, s * 0.35 + 4, 300 + random(`mz${i}`) * 100, s * 1.8, s, s * 1.4, 0, random(`mr${i}`) * 3, 0));
    }
    return {bld, bcol, win, far, lampP, lampH, mount};
  }, []);

  const dark = pal.zenith.clone().lerp(pal.ground, 0.2);
  const winCol = pal.accent.clone().lerp(C('#ffe7a8'), 0.6).multiplyScalar(0.25 + night * 1.5);
  const S = -1.5 + SEA_H * g(frame);
  const seaTop = pal.water.clone().lerp(pal.horizon, 0.18);
  const geoSea = useMemo(() => {
    const p = new THREE.PlaneGeometry(1800, 1000, 90, 50);
    p.rotateX(-Math.PI / 2);
    return p;
  }, []);
  const baseSea = useMemo(() => geoSea.attributes.position.array.slice() as Float32Array, [geoSea]);
  useLayoutEffect(() => {
    const p = geoSea.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = baseSea[i * 3], z = baseSea[i * 3 + 2];
      p.setY(i, Math.sin(x * 0.04 + frame * 0.05) * 0.5 + Math.sin(z * 0.06 + frame * 0.04) * 0.45);
    }
    p.needsUpdate = true;
    geoSea.computeVertexNormals();
  }, [frame]);

  return (
    <>
      <Terrain height={groundH} bounds={{x0: -300, x1: 300, z0: -330, z1: 200, step: 6}}
        paint={(c, h, x, z) => {
          if (PLAZA(x, z)) c.copy(P0.ground).multiplyScalar(0.34).lerp(P0.water, 0.15);
          else if (z < -52) c.copy(P0.ground).lerp(P0.zenith, 0.35).multiplyScalar(0.8);
          else if (h > 7) c.copy(P0.water).multiplyScalar(0.4).lerp(P0.zenith, 0.2);
          else c.copy(P0.water).lerp(C('#4fa86a'), 0.45).multiplyScalar(0.62);
        }} />
      <mesh position={[0, -12.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4000, 24]} />
        <meshToonMaterial {...toonProps(P0.ground.clone().lerp(P0.zenith, 0.35).multiplyScalar(0.8))} />
      </mesh>
      <Instances geometry={GEO.box} matrices={fixed.bld} color="#ffffff" colors={fixed.bcol} />
      <Instances geometry={GEO.box} matrices={fixed.win} color={winCol} basic />
      <Instances geometry={GEO.pole} matrices={fixed.lampP} color={dark.clone().multiplyScalar(0.6)} />
      <Instances geometry={GEO.box} matrices={fixed.lampH} color={C('#ffe9a8').multiplyScalar(0.45 + night * 0.8)} basic />
      <Instances geometry={GEO.box} matrices={fixed.far} color={dark.clone().multiplyScalar(0.8)} />
      <Instances geometry={GEO.cone} matrices={fixed.mount} color={dark.clone().multiplyScalar(0.75)} />

      <LiftField frame={frame} g={g} geometry={GEO.box} items={items.tiles} outline={false} />
      <LiftField frame={frame} g={g} geometry={GEO.box} items={items.crates} />
      <LiftField frame={frame} g={g} geometry={GEO.rock} items={items.rks} />
      <LiftField frame={frame} g={g} geometry={GEO.trunk} items={items.trunks} outline={false} />
      <LiftField frame={frame} g={g} geometry={GEO.cone} items={items.crowns} />
      <LiftField frame={frame} g={g} geometry={GEO.box} items={items.benches} />
      <LiftField frame={frame} g={g} geometry={GEO.box} items={items.cars} />
      <LiftField frame={frame} g={g} geometry={GEO.roof} items={items.roofs} />

      <group position={[0, S, -570]}>
        <mesh geometry={geoSea}>
          <meshToonMaterial {...toonProps(seaTop)} emissive={pal.water.clone().multiplyScalar(0.12 + night * 0.2)} />
        </mesh>
        <mesh position={[0, -30, 0]}>
          <boxGeometry args={[1800, 60, 1000]} />
          <meshToonMaterial {...toonProps(pal.water.clone().multiplyScalar(0.55))} emissive={pal.water.clone().lerp(pal.accent, 0.15).multiplyScalar(0.35 + night * 0.45)} />
        </mesh>
      </group>
    </>
  );
};

export const GravityOff: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();

  const mood = smooth(frame, MOOD);
  const pal = mixPalette(GRAVITY_OFF, mood);
  const elev = smooth(frame, SUN);
  const night = clamp01((0.02 - elev) / 0.3);
  const tension = smooth(frame, TL.tension as Key[]);
  const gNow = g(frame);

  const pose = computePose(frame, fps, SPEC, groundH);
  const alt = pose.pos.y;
  const sunDir = dirFromElev(elev, 0.25);
  const moonDir = dirFromElev(0.9, 0.2);
  const sunW = clamp01((elev + 0.05) / 0.2);
  const lightDir = sunDir.clone().multiplyScalar(sunW).add(moonDir.clone().multiplyScalar(1 - sunW)).normalize();
  const sunCol = pal.horizon.clone().lerp(C('#ffffff'), 0.3);
  const moonCol = C('#dfe8ff').lerp(pal.accent, clamp01(mood - 2) * 0.5);
  const lightCol = sunCol.clone().lerp(moonCol, 1 - sunW);
  const lightInt = 2.6 * sunW + 1.7 * night * (1 - sunW) + 0.2;
  const fogCol = pal.horizon.clone().multiplyScalar(0.85);
  const fogDen = (0.0017 + tension * 0.0012) * Math.exp(-Math.max(0, alt) / 300) + 0.0004;

  const lightTarget = useMemo(() => new THREE.Object3D(), []);
  lightTarget.position.copy(pose.pos);

  // Pip floats next to you (same lift curve, small lag), then lands with you
  const u = smooth(frame, SPEC.u);
  const cp = pathPoint(SPEC, u);
  const flyAmt = smooth(frame, SPEC.fly!);
  const pipAlt = smooth(frame - 9, SPEC.alt!) + Math.sin(frame * 0.045) * 0.6 * flyAmt;
  const pipPos: [number, number, number] = [cp.x + 1.1 + Math.sin(frame * 0.02) * flyAmt * 0.8, groundH(cp.x + 1.1, cp.z - 3.4) + pipAlt, cp.z - 3.4];
  const pipTumble: [number, number, number] = [Math.sin(frame * 0.031) * 0.7 * flyAmt, 0, Math.cos(frame * 0.027) * 0.6 * flyAmt];
  const lookAtCam = frame >= 1330 && frame < 1500;

  // Cup in the right hand, slips away and floats beside you
  const handsRaise = smooth(frame, HANDS);
  const cupRise = smooth(frame, CUP);
  const cupLocal = new THREE.Vector3(0.16, -0.24 - (1 - handsRaise) * 0.6, -0.85).multiplyScalar(1);
  const cupPos = pose.pos.clone().add(cupLocal.clone().applyQuaternion(pose.quat)).add(new THREE.Vector3(0, cupRise * 0.55, 0));

  const flashSmall = TL.impacts.reduce((a, im) => (im.amp < 1 && frame >= im.frame ? Math.max(a, im.amp * 0.4 * Math.exp(-(frame - im.frame) / 4)) : a), 0);
  const flashBig = smooth(frame, [[0, 0], [1775, 0], [1792, 1], [1860, 1], [1960, 0], [2100, 0]]);
  const flash = Math.max(flashBig, flashSmall);
  const streaks = smoothstep(1560, 1700, frame) * (frame < 1790 ? 1 : 0);
  const prevYaw = computePose(frame - 1, fps, SPEC, groundH).yaw;
  const whip = Math.abs(pose.yaw - prevYaw) > 1 ? 0 : Math.abs(pose.yaw - prevYaw);
  const shock = pose.shock + whip * 14 + streaks * 0.5;

  const spray = smoothstep(1700, 1790, frame) * (frame < 1800 ? 1 : 0);
  const camCenter = pose.pos;
  const climb = smoothstep(120, 400, frame) * (frame < 1500 ? 1 : 0);

  return (
    <AbsoluteFill style={{background: '#000'}}>
      <Audio src={staticFile('audio/gravity-off.wav')} />
      <PostFx shock={shock}>
        <ThreeCanvas width={width} height={height} linear={false} flat={false} dpr={1} shadows={SHADOWS}
          gl={{antialias: true, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace, preserveDrawingBuffer: true}}
          camera={{fov: 70, position: [0, 1.7, 10], near: 0.1, far: 3500}}>
          <PovCamera pose={pose} />
          <fogExp2 attach="fog" args={[fogCol, fogDen]} />
          <hemisphereLight args={[pal.zenith.clone().lerp(pal.horizon, 0.45), pal.ground.clone().multiplyScalar(0.55), 0.9 - night * 0.1]} />
          <directionalLight position={pose.pos.clone().addScaledVector(lightDir, 80)} target={lightTarget} color={lightCol} intensity={lightInt}
            castShadow={SHADOWS} shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
          <primitive object={lightTarget} />
          <pointLight position={pose.pos.clone().add(new THREE.Vector3(0, 0.4, 0))} color={pal.accent.clone().lerp(C('#fff'), 0.5)} intensity={20 * night} distance={34} decay={2} />

          <Sky zenith={pal.zenith} horizon={pal.horizon} sunColor={sunCol} sunDir={sunDir} sunGlow={sunW}
            moonDir={moonDir} moonScale={1.4} moonColor={moonCol} night={clamp01(night * 1.4 + smoothstep(100, 500, alt) * 0.35)} center={pose.pos} />

          <World frame={frame} pal={pal} night={night} />

          <Pip position={pipPos} yaw={lookAtCam ? 3.14 : 3.14 - 0.55} phase={frame * 0.09} moving={flyAmt * 0.9} point={smooth(frame, POINT)}
            scale={1} body={pal.horizon.clone().lerp(C('#ffffff'), 0.25)} scarf={pal.accent} glow={pal.accent.clone().lerp(C('#fff'), 0.4)} frame={frame}
            tumble={pipTumble} />
          {frame < 1791 || frame > 1815 ? <Outlined geometry={GEO.cup} color="#f4efe6" position={[cupPos.x, cupPos.y, cupPos.z]} rotation={[frame * 0.02 * clamp01(cupRise), frame * 0.03 * clamp01(cupRise), 0]} scale={0.85} thickness={0.12} shadow={false} /> : null}

          <Particles frame={frame} seed="dust" count={1400} intensity={(1 - night) * 0.6 * (1 - clamp01(alt / 200))} center={camCenter} box={[60, 14, 60]} velocity={[0.1, 0.02, -0.05]} size={0.05} color={pal.horizon.clone().lerp(C('#fff'), 0.5)} opacity={0.5} wobble={0.3} />
          <Particles frame={frame} seed="motes" count={3600} intensity={smoothstep(120, 400, frame) * (frame < 1520 ? 1 : 0)} center={camCenter} box={[90, 50, 90]} velocity={[0.01, 0.045, 0.01]} size={0.09} color={pal.accent.clone().lerp(C('#fff'), 0.5)} opacity={0.75} wobble={0.8} />
          <Particles frame={frame} seed="drops" count={3200} intensity={smoothstep(200, 500, frame) * (frame < 1700 ? 1 : 0)} center={new THREE.Vector3(0, 220, -85)} box={[240, 520, 70]} velocity={[0, 0.16, 0]} size={0.5} color="#bfe4ff" opacity={0.85} wobble={1.2} />
          <Particles frame={frame} seed="fall" count={2400} intensity={streaks} center={camCenter} box={[40, 70, 40]} velocity={[0, 1.1, 0]} size={0.08} color="#ffffff" opacity={0.7} />
          <Particles frame={frame} seed="spray" count={3000} intensity={spray} center={new THREE.Vector3(0, 18, -40)} box={[110, 40, 130]} velocity={[0, 0.5, 0]} size={0.35} color="#ffffff" opacity={0.8} wobble={0.8} />

          <PovHands position={pose.pos} quaternion={pose.quat} glove={pal.ground.clone().multiplyScalar(0.7)} sleeve={pal.accent.clone().multiplyScalar(0.7)} raise={handsRaise}
            swing={Math.sin(frame * 0.15) * flyAmt * 1.3} frame={frame} />
        </ThreeCanvas>
      </PostFx>
      <Overlay frame={frame} labels={TL.labels} captions={TL.captions} flash={flash} tension={tension} streaks={streaks} />
    </AbsoluteFill>
  );
};
