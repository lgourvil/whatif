import React, {useMemo} from 'react';
import * as THREE from 'three';
import {AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {PovCamera, computePose} from '../../lib/PovCamera';
import {Sky, dirFromElev} from '../../lib/Sky';
import {Particles} from '../../lib/Particles';
import {Outlined, Pip, PovHands} from '../../lib/Characters';
import {Overlay, PostFx} from '../../lib/Overlay';
import {Terrain} from '../../lib/Terrain';
import {Clouds} from '../../lib/Clouds';
import {ZeroG, bodyState} from '../../lib/ZeroG';
import {toonProps} from '../../lib/ToonMaterial';
import {GRAVITY_OFF, mixPalette} from '../../lib/palettes';
import {clamp01, smooth, smoothstep} from '../../lib/anim';
import {BENCHES, BLOBS, CARS, CLOCK, CRATES, DURATION, FLASH, HANDS, HOUSES, LAMPS, LAND, MOOD, PIP, PIP_BODY, PLAZA_R, POINT, POND, POND_FILL, R, ROCKS, SPAWN, SPEC, TL, TREES, TUFTS, groundH} from './world';

const SHADOWS = false;

const T = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

const GEO = {
  trunk: new THREE.CylinderGeometry(0.22, 0.34, 2.6, 5),
  cone: new THREE.ConeGeometry(1, 1, 6),
  clod: new THREE.IcosahedronGeometry(1, 0),
  box: new THREE.BoxGeometry(1, 1, 1),
  pole: new THREE.CylinderGeometry(0.07, 0.1, 4.2, 5),
  blob: new THREE.IcosahedronGeometry(1, 1),
  tuft: new THREE.ConeGeometry(0.18, 0.7, 4),
  roof: new THREE.ConeGeometry(1, 1, 4),
};

const tints = (n: number, base: THREE.Color, spread: number, seed: number) =>
  Array.from({length: n}, (_, i) => base.clone().offsetHSL((((i * 7919 + seed) % 97) / 97 - 0.5) * spread * 0.3, 0, (((i * 104729 + seed) % 89) / 89 - 0.5) * spread));

export const GravityOff: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();

  const mood = smooth(frame, MOOD);
  const pal = mixPalette(GRAVITY_OFF, mood);
  const base = GRAVITY_OFF[0];
  const tension = smooth(frame, TL.tension as [number, number][]);
  const pose = computePose(frame, fps, SPEC, groundH);
  const alt = smooth(frame, SPEC.lift!);
  const space = smoothstep(130, 300, alt);

  const elev = 0.85;
  const sunDir = dirFromElev(elev, 0.4);
  const sunCol = pal.horizon.clone().lerp(new THREE.Color('#ffffff'), 0.45);
  const fogCol = pal.horizon.clone().multiplyScalar(0.92);
  const fogDen = 0.0013 + tension * 0.0006;
  const lightTarget = useMemo(() => new THREE.Object3D(), []);
  lightTarget.position.copy(pose.pos);

  // static palette-derived colours (props are always painted with the calm palette so they come back identical)
  const C = useMemo(() => {
    const b = {z: new THREE.Color(base.zenith), h: new THREE.Color(base.horizon), g: new THREE.Color(base.ground), w: new THREE.Color(base.water), a: new THREE.Color(base.accent)};
    const bark = b.g.clone().multiplyScalar(0.28).lerp(new THREE.Color('#7a4a2b'), 0.7);
    const wood = bark.clone().lerp(b.h, 0.15);
    return {
      b, bark, wood,
      leaf: tints(TREES.length, b.g.clone().multiplyScalar(0.72), 0.12, 3),
      leaf2: tints(TREES.length, b.g.clone().multiplyScalar(0.92), 0.12, 11),
      rock: tints(ROCKS.length, b.z.clone().lerp(b.h, 0.55).multiplyScalar(0.55), 0.18, 5),
      crate: tints(CRATES.length, b.h.clone().lerp(new THREE.Color('#b57a45'), 0.55), 0.2, 9),
      wall: tints(HOUSES.length, b.h.clone().lerp(new THREE.Color('#ffffff'), 0.3), 0.35, 13),
      roof: tints(HOUSES.length, b.a.clone().multiplyScalar(0.9), 0.3, 17),
      car: Array.from({length: CARS.length}, (_, i) => [b.a, b.w, b.h, b.z.clone().lerp(b.w, 0.4)][i % 4].clone()),
      blob: tints(BLOBS.length, b.w.clone(), 0.25, 21),
      tuft: tints(TUFTS.length, b.g.clone().multiplyScalar(0.8), 0.25, 31),
      bench: b.a.clone().lerp(wood, 0.55),
      stone: b.h.clone().lerp(new THREE.Color('#ffffff'), 0.62),
      road: b.z.clone().multiplyScalar(0.42).lerp(b.g, 0.2),
      dirt: bark.clone().multiplyScalar(0.8),
    };
  }, []);

  const colorAt = useMemo(() => (x: number, y: number, z: number, out: THREE.Color) => {
    const d = Math.hypot(x, z);
    out.copy(C.b.g);
    if (d > 70) out.lerp(C.b.g.clone().multiplyScalar(0.75), smoothstep(70, 200, d) * 0.6);
    if (y > 1.2) out.lerp(C.b.h, 0.18);
  }, [C]);

  // pond
  const fill = smooth(frame, POND_FILL);
  const waterCol = C.b.w.clone().lerp(C.dirt, 1 - fill);
  // Pip
  const pst = bodyState(PIP_BODY, frame, CLOCK);
  const pipFloat = pst.landed ? 0 : smoothstep(PIP_BODY.t0, PIP_BODY.t0 + 40, frame);
  const pipYaw = Math.atan2(SPAWN.x - PIP.x, -(SPAWN.z - PIP.z));

  // fx
  const flashFall = smooth(frame, FLASH);
  const falling = frame > R && frame < LAND;
  const fallK = falling ? smoothstep(R, R + 30, frame) : 0;
  const prevYaw = computePose(frame - 1, fps, SPEC, groundH).yaw;
  const shock = pose.shock + fallK * 0.9 + Math.abs(pose.yaw - prevYaw) * 6;
  const camXZ = new THREE.Vector3(pose.pos.x, 0, pose.pos.z);
  const rise = smoothstep(R, R - 1, frame) * smoothstep(60, 300, frame);
  const landDust = smoothstep(LAND - 2, LAND + 4, frame) * (1 - smoothstep(LAND + 10, LAND + 70, frame));

  return (
    <AbsoluteFill style={{background: '#000'}}>
      <Audio src={staticFile('audio/gravity-off.wav')} />
      <PostFx shock={shock}>
        <ThreeCanvas width={width} height={height} linear={false} flat={false} dpr={1} shadows={SHADOWS}
          gl={{antialias: true, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace, preserveDrawingBuffer: true}}
          camera={{fov: 70, position: [0, 1.7, 8], near: 0.1, far: 3000}}>
          <PovCamera pose={pose} />
          <fogExp2 attach="fog" args={[fogCol, fogDen]} />
          <hemisphereLight args={[pal.zenith.clone().lerp(pal.horizon, 0.5), C.b.g.clone().multiplyScalar(0.55), 0.95 - space * 0.35]} />
          <directionalLight position={pose.pos.clone().addScaledVector(sunDir, 80)} target={lightTarget} color={sunCol} intensity={2.7 - space * 0.6}
            castShadow={SHADOWS} shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
          <primitive object={lightTarget} />
          <pointLight position={pose.pos.clone().add(new THREE.Vector3(0, 0.4, 0))} color={pal.accent.clone().lerp(new THREE.Color('#fff'), 0.6)} intensity={10 * tension} distance={30} decay={2} />

          <Sky zenith={pal.zenith} horizon={pal.horizon} sunColor={sunCol} sunDir={sunDir} sunGlow={1}
            moonDir={dirFromElev(0.3, 2)} moonScale={0} moonColor={new THREE.Color('#dfe8ff')} night={space} center={pose.pos} />

          <Terrain height={groundH} colorAt={colorAt} half={420} step={10} skirt={C.b.g.clone().multiplyScalar(0.7)} />

          {/* plaza, pond, ring road */}
          <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[PLAZA_R, PLAZA_R, 0.12, 28]} /><meshToonMaterial {...toonProps(C.stone)} /></mesh>
          {[[7, 7.7], [13.5, 14.2], [19.6, 20.4]].map(([a, b], i) => (
            <mesh key={i} position={[0, 0.125, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[a, b, 40]} /><meshToonMaterial {...toonProps(C.stone.clone().multiplyScalar(0.72))} /></mesh>
          ))}
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[33, 44, 48]} /><meshToonMaterial {...toonProps(C.road)} side={THREE.DoubleSide} /></mesh>
          <mesh position={[POND.x, 0.18, POND.z]}><cylinderGeometry args={[POND.r + 0.9, POND.r + 1.1, 0.5, 18]} /><meshToonMaterial {...toonProps(C.stone.clone().multiplyScalar(0.8))} /></mesh>
          <mesh position={[POND.x, 0.34, POND.z]}><cylinderGeometry args={[POND.r, POND.r, 0.2, 18]} /><meshToonMaterial {...toonProps(waterCol)} /></mesh>

          {/* weightless props */}
          <ZeroG frame={frame} clock={CLOCK} geometry={GEO.trunk} bodies={TREES} color={C.bark} local={T(0, 1.3, 0)} />
          <ZeroG frame={frame} clock={CLOCK} geometry={GEO.cone} bodies={TREES} color={C.leaf} local={T(0, 3.9, 0, 2.2, 3.2, 2.2)} />
          <ZeroG frame={frame} clock={CLOCK} geometry={GEO.cone} bodies={TREES} color={C.leaf2} local={T(0, 5.6, 0, 1.6, 2.6, 1.6, 0.5)} />
          <ZeroG frame={frame} clock={CLOCK} geometry={GEO.clod} bodies={TREES} color={C.dirt} local={T(0, -0.1, 0, 0.8, 0.45, 0.8)} outline={false} />
          <ZeroG frame={frame} clock={CLOCK} geometry={GEO.clod} bodies={ROCKS} color={C.rock} local={T(0, 0.3, 0, 1, 0.7, 1)} />
          <ZeroG frame={frame} clock={CLOCK} geometry={GEO.box} bodies={CRATES} color={C.crate} local={T(0, 0.5, 0)} />
          <ZeroG frame={frame} clock={CLOCK} geometry={GEO.box} bodies={BENCHES} color={C.bench} local={T(0, 0.55, 0, 2.2, 0.14, 0.6)} />
          <ZeroG frame={frame} clock={CLOCK} geometry={GEO.box} bodies={BENCHES} color={C.bench} local={T(0, 0.95, -0.3, 2.2, 0.6, 0.1)} />
          <ZeroG frame={frame} clock={CLOCK} geometry={GEO.pole} bodies={LAMPS} color={C.road} local={T(0, 2.1, 0)} />
          <ZeroG frame={frame} clock={CLOCK} geometry={GEO.clod} bodies={LAMPS} color="#fff2b0" local={T(0, 4.4, 0, 0.32, 0.32, 0.32)} emissive="#ffe08a" />
          <ZeroG frame={frame} clock={CLOCK} geometry={GEO.box} bodies={CARS} color={C.car} local={T(0, 0.75, 0, 4.2, 0.9, 1.9)} />
          <ZeroG frame={frame} clock={CLOCK} geometry={GEO.box} bodies={CARS} color={C.b.z.clone().lerp(C.b.w, 0.5)} local={T(-0.3, 1.5, 0, 2.2, 0.75, 1.7)} />
          <ZeroG frame={frame} clock={CLOCK} geometry={GEO.box} bodies={HOUSES} color={C.wall} local={T(0, 2.4, 0, 7, 4.8, 7)} />
          <ZeroG frame={frame} clock={CLOCK} geometry={GEO.roof} bodies={HOUSES} color={C.roof} local={T(0, 6.2, 0, 6.2, 3, 6.2, Math.PI / 4)} />
          <ZeroG frame={frame} clock={CLOCK} geometry={GEO.clod} bodies={HOUSES} color={C.dirt} local={T(0, -0.2, 0, 3.8, 0.9, 3.8)} outline={false} />
          <ZeroG frame={frame} clock={CLOCK} geometry={GEO.tuft} bodies={TUFTS} color={C.tuft} outline={false} />
          <ZeroG frame={frame} clock={CLOCK} geometry={GEO.blob} bodies={BLOBS} color={C.blob} outline={false} emissive={C.b.w.clone().multiplyScalar(0.25)} />

          <Clouds seed="lo" clusters={46} lo={104} hi={142} radius={300} size={15} color={new THREE.Color('#ffffff').lerp(pal.horizon, 0.2)} shade={pal.zenith.clone().lerp(pal.horizon, 0.7)} tint={pal.horizon} />
          <Clouds seed="hi" clusters={16} lo={190} hi={215} radius={420} size={24} color={new THREE.Color('#ffffff').lerp(pal.horizon, 0.35)} shade={pal.zenith.clone().lerp(pal.horizon, 0.6)} tint={pal.horizon} />

          {/* Pip, tumbling in zero-g */}
          <group position={[PIP.x, pst.y + 1, PIP.z]} rotation={[pst.ax, 0, pst.az]}>
            <group position={[0, -1, 0]}>
              <Pip position={[0, 0, 0]} yaw={pipYaw} phase={frame * 0.13} moving={pipFloat * 0.9} point={smooth(frame, POINT)} body={pal.accent.clone().lerp(new THREE.Color('#ffffff'), 0.12)}
                scarf={new THREE.Color('#ffffff').lerp(pal.horizon, 0.3)} glow={pal.accent.clone().lerp(new THREE.Color('#fff'), 0.4)} frame={frame} />
            </group>
          </group>

          {/* ambient motes: pollen & leaves rising, then speed streaks while you fall */}
          <Particles frame={frame} seed="motes" count={1400} intensity={smoothstep(30, 260, frame) * rise} center={pose.pos} box={[60, 36, 60]} velocity={[0.01, 0.06, 0.005]} size={0.09}
            color={new THREE.Color('#ffffff').lerp(pal.horizon, 0.3)} opacity={0.85} wobble={0.5} world />
          <Particles frame={frame} seed="petals" count={500} intensity={smoothstep(60, 300, frame) * smoothstep(1000, 700, frame)} center={pose.pos} box={[50, 30, 50]} velocity={[0.02, 0.05, 0]} size={0.16}
            color={pal.accent.clone().lerp(new THREE.Color('#fff'), 0.2)} wobble={0.6} world />
          <Particles frame={frame} seed="air" count={900} intensity={smoothstep(930, 1200, frame) * smoothstep(R, R - 1, frame)} center={pose.pos} box={[80, 60, 80]} velocity={[0, 0.5, 0]} size={0.07} stretch={9}
            color={pal.accent.clone().lerp(new THREE.Color('#ffffff'), 0.5)} opacity={0.8} world />
          <Particles frame={frame} seed="streak" count={1800} intensity={fallK * (falling ? 1 : 0)} center={pose.pos} box={[70, 90, 70]} velocity={[0, 0, 0]} size={0.08} stretch={26}
            color="#ffffff" opacity={0.7} world />
          <Particles frame={frame} seed="dust" count={2200} intensity={landDust} center={new THREE.Vector3(camXZ.x, 2.5, camXZ.z)} box={[44, 6, 44]} velocity={[0.05, 0.05, 0.03]} size={0.5}
            color={C.stone.clone().lerp(new THREE.Color('#ffffff'), 0.3)} opacity={0.6} wobble={1} />

          <PovHands position={pose.pos} quaternion={pose.quat} glove={C.b.h.clone().multiplyScalar(0.8)} sleeve={C.b.a.clone().multiplyScalar(0.7)} raise={smooth(frame, HANDS)}
            swing={Math.sin(frame * 0.06) * smooth(frame, SPEC.float!) * 1.4} frame={frame} />
        </ThreeCanvas>
      </PostFx>
      <Overlay frame={frame} labels={TL.labels} captions={TL.captions} flash={Math.max(flashFall, 0)} tension={tension} />
    </AbsoluteFill>
  );
};

export const IMPACT = LAND;
export const DURATION_FRAMES = DURATION;
