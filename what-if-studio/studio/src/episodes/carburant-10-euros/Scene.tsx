import React, {useLayoutEffect, useMemo} from 'react';
import * as THREE from 'three';
import {AbsoluteFill, Audio, getInputProps, random, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import {PovCamera, adaptExposure, computePose, laggedQuat} from '../../lib/PovCamera';
import {Hand, handInCamera, useNarratorLook} from '../../lib/PovHands';
import {HandPose, PoseKey, poseAt, tremble} from '../../lib/HandPoses';
import {KeyLight, PhysicalSky, SceneEnv, Stars, sunDir, useHdris} from '../../lib/Environment';
import {PostFX} from '../../lib/PostFX';
import {gradeAt} from '../../lib/grades';
import {FrameDriver} from '../../lib/FrameDriver';
import {Embers, Puff, PuffLight, Puffs} from '../../lib/Particles';
import {BodyPose, Outfit, Person, makeBodyMaterial} from '../../lib/Characters';
import {Car} from '../../lib/Vehicles';
import {TikTokOverlay} from '../../lib/Overlay';
import {useFontsReady} from '../../lib/fonts';
import {Key, clamp01, smooth, smoothNoise, smoothstep} from '../../lib/anim';
import {makeFabricMaterial} from '../../lib/SkinMaterial';
import {
  BannerSheet, Barricade, Canopy, Ground, Hills, Hose, Houses, Nozzle, PumpIsland, PumpUnit, Shop, StreetLights, Totem, Trees,
  useNozzleMats, usePumpScreen,
} from './Station';
import {emit, embers} from './fx';
import {
  CAR_FIRE, CAR_N, DURATION, FILLER, FOG, GRADE_TRACK, LIGHT, LOOP, PALLET_FIRE, POLICE, PUMP1, ROAD_Z, ROUNDABOUT, SPEC,
  SUN_AZ, SUN_ELEV, TL, TOTEM, VEST_ON, priceAt, sceneFrame,
} from './world';

const ground = () => 0;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const C = (h: string) => new THREE.Color(h);
const lerpC = (keys: [number, string][], f: number) => {
  if (f <= keys[0][0]) return C(keys[0][1]);
  for (let i = 0; i < keys.length - 1; i++) {
    if (f < keys[i + 1][0]) {
      const t = smoothstep(keys[i][0], keys[i + 1][0], f);
      return C(keys[i][1]).lerp(C(keys[i + 1][1]), t);
    }
  }
  return C(keys[keys.length - 1][1]);
};
/** keyed vector track (camera-space hand placement) */
type Track = [number, number, number, number, number, number, number][];
const track = (f: number, t: Track) => {
  const comp = (i: number) => smooth(f, t.map((r) => [r[0], r[i]] as Key));
  return {p: V(comp(1), comp(2), comp(3)), e: [comp(4), comp(5), comp(6)] as [number, number, number]};
};

/* ------------------------------------------------------------------ hand choreography */

const R_POSES: PoseKey[] = [
  {frame: 0, pose: 'grip'}, {frame: 150, pose: 'squeeze'}, {frame: 690, pose: 'grip'}, {frame: 730, pose: 'relaxed'},
  {frame: 770, pose: 'pinch'}, {frame: 915, pose: 'relaxed'}, {frame: 1075, pose: 'point'}, {frame: 1190, pose: 'relaxed'},
  {frame: 1640, pose: 'brace'}, {frame: 1780, pose: 'relaxed'}, {frame: 1945, pose: 'point'}, {frame: 2070, pose: 'relaxed'},
  {frame: 2176, pose: 'palm_out', stiffness: 260}, {frame: 2230, pose: 'brace'}, {frame: 2330, pose: 'relaxed'},
];
const L_POSES: PoseKey[] = [
  {frame: 0, pose: 'relaxed'}, {frame: 270, pose: 'reach'}, {frame: 300, pose: 'touch_surface'}, {frame: 385, pose: 'relaxed'},
  {frame: 770, pose: 'pinch'}, {frame: 915, pose: 'relaxed'}, {frame: 1655, pose: 'shield_eyes'}, {frame: 1790, pose: 'relaxed'},
  {frame: 2176, pose: 'palm_out', stiffness: 260}, {frame: 2230, pose: 'brace'}, {frame: 2330, pose: 'relaxed'},
];

// camera-space wrist placement [frame, x, y, z, rx, ry, rz] (YXZ euler, camera looks -Z)
const R_TRACK: Track = [
  [0, 0.17, -0.235, -0.36, 0.25, 0.55, -1.15], [690, 0.17, -0.235, -0.36, 0.25, 0.55, -1.15],
  [735, 0.26, -0.55, -0.32, 0.3, 0.4, -0.9], [770, 0.21, -0.16, -0.44, 0.55, 0.35, -1.2], [900, 0.2, -0.14, -0.44, 0.55, 0.3, -1.2],
  [930, 0.22, -0.6, -0.3, 0.6, 0.2, -1.0], [1060, 0.22, -0.6, -0.3, 0.3, 0.2, -0.6], [1085, 0.11, -0.13, -0.46, 0.2, 0.45, -0.35],
  [1170, 0.12, -0.13, -0.46, 0.2, 0.5, -0.35], [1200, 0.24, -0.6, -0.32, 0.3, 0.3, -0.6], [1630, 0.24, -0.6, -0.32, 0.3, 0.3, -0.6],
  [1655, 0.17, -0.22, -0.4, 0.75, 0.25, -0.5], [1775, 0.17, -0.22, -0.4, 0.75, 0.25, -0.5], [1800, 0.24, -0.6, -0.32, 0.3, 0.3, -0.6],
  [1935, 0.24, -0.6, -0.32, 0.3, 0.3, -0.6], [1960, 0.1, -0.1, -0.47, 0.15, 0.32, -0.3], [2060, 0.1, -0.1, -0.47, 0.15, 0.32, -0.3],
  [2090, 0.24, -0.6, -0.32, 0.3, 0.3, -0.6], [2172, 0.24, -0.6, -0.32, 0.3, 0.3, -0.6], [2182, 0.14, -0.1, -0.36, 1.25, 0.15, -0.25],
  [2300, 0.15, -0.12, -0.37, 1.15, 0.2, -0.3], [2345, 0.25, -0.62, -0.32, 0.3, 0.3, -0.6], [2384, 0.25, -0.62, -0.32, 0.3, 0.3, -0.6],
];
const L_TRACK: Track = [
  [0, -0.24, -0.62, -0.3, 0.3, -0.3, 0.6], [255, -0.24, -0.62, -0.3, 0.3, -0.3, 0.6], [300, -0.04, -0.13, -0.5, 0.05, -0.15, 0.25],
  [385, -0.04, -0.13, -0.5, 0.05, -0.15, 0.25], [420, -0.24, -0.62, -0.3, 0.3, -0.3, 0.6], [740, -0.24, -0.62, -0.3, 0.3, -0.3, 0.6],
  [770, -0.21, -0.16, -0.44, 0.55, -0.35, 1.2], [900, -0.2, -0.14, -0.44, 0.55, -0.3, 1.2], [930, -0.22, -0.6, -0.3, 0.6, -0.2, 1.0],
  [1630, -0.24, -0.62, -0.3, 0.3, -0.3, 0.6], [1660, -0.13, 0.085, -0.27, 0.12, -1.25, 0.1], [1785, -0.13, 0.085, -0.27, 0.12, -1.25, 0.1],
  [1810, -0.24, -0.62, -0.3, 0.3, -0.3, 0.6], [2172, -0.24, -0.62, -0.3, 0.3, -0.3, 0.6], [2182, -0.14, -0.1, -0.36, 1.25, -0.15, 0.25],
  [2300, -0.15, -0.12, -0.37, 1.15, -0.2, 0.3], [2345, -0.25, -0.62, -0.32, 0.3, -0.3, 0.6], [2384, -0.25, -0.62, -0.32, 0.3, -0.3, 0.6],
];
const R_VIS: Key[] = [[0, 1], [735, 1], [745, 0], [760, 0], [768, 1], [935, 1], [940, 0], [1060, 0], [1070, 1], [1195, 1], [1205, 0], [1640, 0], [1648, 1], [1795, 1], [1805, 0], [1945, 0], [1952, 1], [2080, 1], [2090, 0], [2174, 0], [2177, 1], [2340, 1], [2350, 0], [2384, 0]];
const L_VIS: Key[] = [[0, 0], [262, 0], [268, 1], [410, 1], [418, 0], [762, 0], [768, 1], [935, 1], [940, 0], [1640, 0], [1648, 1], [1800, 1], [1808, 0], [2174, 0], [2177, 1], [2340, 1], [2350, 0], [2384, 0]];
/** nozzle: held in camera space → locked in the filler → back in hand → parked */
const NOZ_LOCK: Key[] = [[0, 0], [45, 0], [105, 1], [690, 1], [728, 0], [2384, 0]];

// nozzle pose relative to the right wrist (hand-local): handle across the palm, spout beyond the thumb
const NOZ_IN_HAND_POS = V(0.0, -0.03, -0.083);
const NOZ_IN_HAND_Q = new THREE.Quaternion(); // handle across the fist, head on the little-finger side
// nozzle in the filler (world): spout tip inside the neck, handle toward the narrator
const NOZ_WORLD_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.35, -0.12, 'YXZ'));
const NOZ_WORLD_P = FILLER.clone().add(V(-0.25, 0.05, 0.1));
// nozzle held up in front of the chest at frame 0 (camera space): spout forward-right-down
const basis = (x: THREE.Vector3, upHint: THREE.Vector3) => {
  const X = x.clone().normalize();
  const Y = upHint.clone().addScaledVector(X, -upHint.dot(X)).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
};
const NOZ_CAM_Q = basis(V(0.55, -0.35, -0.75), V(0, 1, 0.25));
const NOZ_CAM_P: [number, number, number, number][] = [[0, 0.06, -0.21, -0.4], [700, 0.06, -0.21, -0.4], [742, 0.24, -0.62, -0.3], [2384, 0.24, -0.62, -0.3]];

/* ------------------------------------------------------------------ crowd */

type Agent = {pos: THREE.Vector3; yaw: number; pose: BodyPose; outfit: number; show: boolean};
const OUTFITS: Outfit[] = [
  {skin: '#c79a80', top: '#3b4652', pants: '#2a3140', shoes: '#2b2622', hair: '#2a211b', vest: 1},
  {skin: '#a87a5c', top: '#5b4033', pants: '#33302c', shoes: '#1e1c1a', hair: '#151210', vest: 1},
  {skin: '#e0b59a', top: '#7b2b2b', pants: '#2c3542', shoes: '#3b2e25', hair: '#8a6a45', vest: 1},
  {skin: '#7a5440', top: '#2b2e33', pants: '#1f2226', shoes: '#151515', hair: '#0d0b0a', vest: 1},
  {skin: '#d2a488', top: '#4d5a3a', pants: '#3a3a3a', shoes: '#2a2a2a', hair: '#5a5a5a', vest: 1},
  {skin: '#c99479', top: '#283445', pants: '#28303d', shoes: '#4a3526', hair: '#3a2a1e', vest: 0},
  {skin: '#b88a70', top: '#1d2633', pants: '#161b22', shoes: '#0e0e0e', hair: '#1d2633', vest: 0}, // riot police (navy, helmet)
  {skin: '#cfa38a', top: '#6b6f74', pants: '#30343a', shoes: '#262626', hair: '#2b2018', vest: 0},
];

const crowdAt = (sf: number): Agent[] => {
  const a: Agent[] = [];
  const N = 18;
  for (let i = 0; i < N; i++) {
    const r = (n: number) => random(`cr${i}-${n}`);
    const appear = 860 + r(0) * 380;
    if (sf < appear) continue;
    const ang = -0.2 + r(1) * 1.9; // spread on the east side of the ring
    const rad = 9 + r(2) * 6;
    const base = V(ROUNDABOUT.x + Math.cos(ang) * rad * 0.9, 0, ROUNDABOUT.z + Math.sin(ang) * rad * 0.75);
    let pos = base.clone();
    let yaw = Math.atan2(-(POLICE.x - base.x), -(POLICE.z - base.z)) + (r(3) - 0.5) * 0.8; // face the police (-Z forward)
    let walk = 0, walkAmt = 0, armsUp = 0, hunch = 0, thr = 0, turn = 0;
    const chant = smoothstep(1000, 1060, sf) * (1 - smoothstep(1600, 1650, sf)) * (r(4) > 0.35 ? 1 : 0.25);
    armsUp = chant * (0.5 + 0.5 * Math.max(0, Math.sin(sf * 0.05 + r(5) * 6)));
    // tear gas: flee east / cough
    const flee = smoothstep(1630 + r(6) * 60, 1700 + r(6) * 60, sf);
    if (flee > 0) {
      const d = (sf - 1640 - r(6) * 60) * 0.06 * (0.6 + r(7) * 0.6);
      pos = base.clone().add(V(Math.max(0, d) * 0.9, 0, Math.max(0, d) * 0.25));
      yaw = -Math.PI / 2 + (r(8) - 0.5) * 0.5; // run toward +X
      walk = sf * 0.42 + r(9) * 6;
      walkAmt = flee * (1 - smoothstep(1780, 1840, sf));
      hunch = flee * 0.6 * (1 - smoothstep(1800, 1900, sf));
    }
    // back to fight: throwing at the police after 1950
    if (sf > 1880) {
      const back = smoothstep(1880, 1950, sf);
      pos = pos.clone().lerp(base.clone().add(V(4 + r(10) * 3, 0, 2 + r(11) * 2)), back);
      yaw = Math.atan2(-(POLICE.x - pos.x), -(POLICE.z - pos.z));
      thr = Math.max(0, Math.sin(sf * 0.07 + r(12) * 6)) ** 4 * back * (r(13) > 0.4 ? 1 : 0);
      armsUp = 0;
    }
    a.push({pos, yaw, pose: {walk, walkAmt, armsUp, pump: sf * 0.35 + r(14) * 6, throw: thr, turn: (r(15) - 0.5) * 0.4, lean: 0, hunch}, outfit: i % 5 === 3 ? 7 : i % 5, show: true});
  }
  // riot police line
  if (sf > 1595) {
    for (let j = 0; j < 7; j++) {
      const adv = smoothstep(1600, 1760, sf) * 6;
      a.push({pos: V(POLICE.x - 5 + j * 1.6, 0, POLICE.z + 7 + adv), yaw: Math.PI, pose: {walk: sf * 0.2 + j, walkAmt: smoothstep(1600, 1620, sf) * (1 - smoothstep(1740, 1760, sf)) * 0.5, armsUp: 0, pump: 0, turn: 0, lean: 0.05}, outfit: 6, show: true});
    }
  }
  // station customers (daytime)
  if (sf < 900) {
    a.push({pos: V(-5.4, 0, -0.6), yaw: Math.PI / 2 * 0.8, pose: {walk: 0, walkAmt: 0, armsUp: 0, pump: 0, turn: 0, lean: 0.05}, outfit: 7, show: true});
    a.push({pos: V(-9.5 + Math.min(1, sf / 600) * 3.5, 0, 3.4 - Math.min(1, sf / 600) * 0.5), yaw: -Math.PI / 2, pose: {walk: sf * 0.21, walkAmt: sf < 600 ? 1 : 0, armsUp: 0, pump: 0, turn: 0, lean: 0}, outfit: 2, show: true});
    a.push({pos: V(5.6, 0, 3.2), yaw: 2.6, pose: {walk: 0, walkAmt: 0, armsUp: 0, pump: 0, turn: 0.3, lean: 0}, outfit: 4, show: true});
  }
  return a;
};

const CrowdView: React.FC<{agents: Agent[]}> = ({agents}) => {
  const mats = useMemo(() => OUTFITS.map((o) => makeBodyMaterial(o)), []);
  const helmet = useMemo(() => new THREE.MeshPhysicalMaterial({color: '#1b2430', roughness: 0.25, clearcoat: 1}), []);
  const shield = useMemo(() => new THREE.MeshPhysicalMaterial({color: '#cfd8e0', roughness: 0.1, transparent: true, opacity: 0.35, side: THREE.DoubleSide}), []);
  return (
    <group>
      {Array.from({length: 32}).map((_, i) => {
        const ag = agents[i];
        if (!ag) return null;
        return (
          <group key={i}>
            <Person position={ag.pos} yaw={ag.yaw} pose={ag.pose} material={mats[ag.outfit]} />
            {ag.outfit === 6 && (
              <group position={ag.pos} rotation={[0, ag.yaw, 0]}>
                <mesh position={[0, 1.73, -0.01]} material={helmet} castShadow><sphereGeometry args={[0.13, 16, 12]} /></mesh>
                <mesh position={[0.05, 1.0, -0.38]} material={shield}><boxGeometry args={[0.6, 1.1, 0.015]} /></mesh>
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
};

/* ------------------------------------------------------------------ narrator body (seen when looking down) */

const NarratorBody: React.FC<{pos: THREE.Vector3; yaw: number; vest: number}> = ({pos, yaw, vest}) => {
  const mats = useMemo(() => [0, 1].map((v) => makeBodyMaterial({skin: '#c99479', top: '#2c3646', pants: '#2a3242', shoes: '#4a3526', hair: '#3a2a1e', vest: v}, true)), []);
  const fwd = V(Math.sin(yaw), 0, -Math.cos(yaw));
  const p = pos.clone().addScaledVector(fwd, 0.1).add(V(0, -1.66, 0));
  return (
    <Person position={p} yaw={-yaw} pose={{walk: 0, walkAmt: 0, armsUp: 0, pump: 0, turn: 0, lean: 0.04}} material={mats[vest > 0.5 ? 1 : 0]}
      />
  );
};

/* ------------------------------------------------------------------ the gilet jaune held up */

const Vest: React.FC<{a: THREE.Vector3; b: THREE.Vector3; frame: number; camFwd: THREE.Vector3}> = ({a, b, frame, camFwd}) => {
  const mat = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 320;
    const x = c.getContext('2d')!;
    x.fillStyle = '#d9ef00'; x.fillRect(0, 0, 256, 320);
    x.fillStyle = '#b9bcbf'; x.fillRect(0, 190, 256, 26); x.fillRect(0, 248, 256, 26);
    x.fillStyle = '#c8de00';
    for (let i = 0; i < 400; i++) x.fillRect(random(`vs${i}`) * 256, random(`vt${i}`) * 320, 3, 3);
    // arm holes + neck (transparent)
    x.globalCompositeOperation = 'destination-out';
    x.beginPath(); x.ellipse(0, 60, 40, 70, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(256, 60, 40, 70, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(128, 0, 46, 34, 0, 0, Math.PI * 2); x.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshPhysicalMaterial({map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, sheen: 0.8, sheenColor: C('#f6ff7a'), emissive: C('#3a4400'), emissiveIntensity: 0.25});
  }, []);
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1, 16, 20), []);
  useLayoutEffect(() => {
    const p = geo.attributes.position as THREE.BufferAttribute;
    const w = a.distanceTo(b);
    const across = b.clone().sub(a);
    const out = camFwd.clone().setY(0).normalize();
    for (let i = 0; i < p.count; i++) {
      const u = (i % 17) / 16, v = Math.floor(i / 17) / 20; // v: 0 bottom .. 1 top
      const hang = 1 - v;
      const top = a.clone().lerp(b, u);
      const sag = Math.sin(u * Math.PI) * 0.05;
      const fold = Math.sin(u * Math.PI * 5 + frame * 0.04) * 0.025 * hang + Math.sin(u * 13 + v * 3) * 0.006;
      const q = top.clone().add(V(0, -sag - hang * 0.66, 0)).addScaledVector(out, fold + hang * 0.06 * Math.sin(frame * 0.07)).addScaledVector(across, (u - 0.5) * hang * 0.12 / Math.max(w, 0.2));
      p.setXYZ(i, q.x, q.y, q.z);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  });
  return <mesh geometry={geo} material={mat} castShadow receiveShadow frustumCulled={false} />;
};

/* ------------------------------------------------------------------ main */

const FOG_COL: [number, string][] = [[0, '#d9b98f'], [990, '#c9a98a'], [1290, '#8f8a8c'], [1420, '#5b5a66'], [1560, '#1c2029'], [1700, '#2a2c33'], [1840, '#1c1718'], [2175, '#2e1a12'], [2384, '#26150f']];
const SUN_COL: [number, string][] = [[0, '#ffbe78'], [990, '#ffb06a'], [1290, '#ff9a5a'], [1420, '#ff7a45']];

type Quality = {msaa?: number; ao?: boolean; aoHalf?: boolean; dof?: boolean; smaa?: boolean; shadows?: boolean; shadowMap?: number; fx?: boolean; crowd?: boolean; particles?: boolean; body?: boolean};
const QUALITY: Quality = {msaa: 0, ao: true, aoHalf: true, dof: true, smaa: true, shadows: true, shadowMap: 2048, fx: true, crowd: true, particles: true, body: true, ...((getInputProps() as {q?: Quality}).q ?? {})};

export const Carburant: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const sf = sceneFrame(frame);
  const fontsOk = useFontsReady();
  const env = useHdris(['sunset', 'night']);
  const look = useNarratorLook('#2c3646');
  const nozMats = useNozzleMats('#1f7a4a');
  const screen = usePumpScreen();

  // ---- camera
  const pose = computePose(sf, fps, SPEC, ground);
  const qLag = laggedQuat(sf, fps, SPEC, ground, 6, 0.6);
  const tension = smooth(frame, TL.tension as Key[]);
  const camFwd = V(0, 0, -1).applyQuaternion(pose.quat);
  // whip-pan blur from angular speed (only on fast moves)
  const prevQ = computePose(sf - 1, fps, SPEC, ground).quat;
  const ang = prevQ.angleTo(pose.quat);
  const blurPx = ang > 0.03 && frame < LOOP ? Math.min(60, (ang - 0.03) * 900) : 0;
  const dq = pose.quat.clone().invert().multiply(prevQ);
  const de = new THREE.Euler().setFromQuaternion(dq, 'YXZ');
  const bl = V(-de.y, de.x, 0).normalize();

  // ---- light & atmosphere
  const elev = smooth(sf, SUN_ELEV as Key[]);
  const sd = sunDir(elev, SUN_AZ);
  const sunI = 6 * smoothstep(-1.5, 7, elev);
  const sunC = lerpC(SUN_COL, sf);
  const night = 1 - smoothstep(-8, 2, elev);
  const fogDen = smooth(sf, FOG as Key[]);
  const fogC = lerpC(FOG_COL, sf);
  const envI = Math.max(0.025, 1.0 * smoothstep(-6, 8, elev));
  const lightsOn = smoothstep(1180, 1300, sf) * (sf > 2330 ? (random(`cf${frame}`) > 0.4 ? 1 : 0.1) : 1);
  const expoTarget = (f: number) => 1 / Math.pow(Math.max(0.12, smooth(sceneFrame(Math.max(0, f)), LIGHT as Key[])), 0.5);
  const exposure = frame >= LOOP ? expoTarget(frame) : adaptExposure(frame, expoTarget, 18);

  // ---- story state
  const price = frame >= LOOP ? 1.0 : priceAt(frame);
  const rupture = sf >= 1290 && frame < LOOP ? 1 : 0;
  const glitch = smoothstep(2330, 2384, frame) * (frame < LOOP ? 1 : 0);
  const litres = clamp01((sf - 150) / 540) * 38;
  useLayoutEffect(() => { screen.draw(frame >= LOOP ? 1 : priceAt(Math.min(frame, 1289)), litres, rupture > 0, sf); });

  // fires
  const palletBurn = smoothstep(1000, 1150, sf);
  const carBurn = smoothstep(1760, 1830, sf);
  const boom = sf >= 2175 ? Math.exp(-(sf - 2175) / 10) : 0;
  const smallBoom = sf >= 2000 && sf < 2060 ? Math.exp(-(sf - 2000) / 6) : 0;
  const flick = (s: string) => 0.75 + 0.25 * smoothNoise(s, sf / 2.5) + 0.1 * smoothNoise(`${s}b`, sf / 0.8);
  const policeOn = smoothstep(1530, 1560, sf);
  const policePhase = Math.floor(sf / 7) % 2;

  // ---- particles
  const wind = V(0.012, 0, 0.006);
  const smoke: Puff[] = [], gas: Puff[] = [], fire: Puff[] = [], sparks: {p: THREE.Vector3; s: number}[] = [];
  if (frame < LOOP) {
    emit(sf, {seed: 'ps', start: 1000, end: 2400, rate: 0.28, life: 230, origin: () => PALLET_FIRE.clone().add(V(0, 1.2, 0)), strength: () => palletBurn,
      rise: 0.045, wind: wind.clone().multiplyScalar(1.4), spread: 1.2, size0: 1.2, growth: 0.03, alpha: 0.4, tint: (a) => C('#7a716b').lerp(C('#3b3633'), a)}, smoke);
    emit(sf, {seed: 'ts', start: 1150, end: 2400, rate: 0.22, life: 230, origin: () => PALLET_FIRE.clone().add(V(1.6, 1.0, -0.6)), strength: (t) => smoothstep(1150, 1250, t),
      rise: 0.06, wind: wind.clone().multiplyScalar(1.6), spread: 0.6, size0: 1.0, growth: 0.028, alpha: 0.55, tint: () => C('#1d1a19')}, smoke);
    emit(sf, {seed: 'cs', start: 1760, end: 2400, rate: 0.3, life: 220, origin: () => CAR_FIRE.clone().add(V(0, 1.4, 0)), strength: (t) => smoothstep(1760, 1830, t) * (t > 2175 ? 1.5 : 1),
      rise: 0.055, wind: wind.clone().multiplyScalar(1.5), spread: 1.4, size0: 1.3, growth: 0.03, alpha: 0.5, tint: () => C('#262220')}, smoke);
    emit(sf, {seed: 'pf', start: 1000, end: 2400, rate: 0.8, life: 22, origin: () => PALLET_FIRE.clone().add(V(0, 0.25, 0)), strength: () => palletBurn * flick('pf'),
      rise: 0.06, wind: V(0.01, 0, 0.004), spread: 1.2, size0: 1.3, growth: -0.02, alpha: 1, turb: 0.1, fadeIn: 0.15}, fire);
    emit(sf, {seed: 'cf', start: 1760, end: 2400, rate: 0.9, life: 24, origin: () => CAR_FIRE.clone().add(V(0, 0.7, 0)), strength: () => carBurn * flick('cf') * (sf > 2175 ? 1.6 : 1),
      rise: 0.07, wind: V(0.01, 0, 0.004), spread: 2.2, size0: 1.6, growth: -0.02, alpha: 1, turb: 0.1, fadeIn: 0.15}, fire);
    // explosion fireball at 10 €
    emit(sf, {seed: 'xb', start: 2175, end: 2181, rate: 8, life: 45, origin: () => CAR_FIRE.clone().add(V(0, 1.2, 0)), rise: 0.12, wind: V(0, 0, 0), spread: 5,
      size0: 2.5, growth: 0.12, alpha: 1, turb: 1.5, fadeIn: 0.02}, fire);
    emit(sf, {seed: 'xs', start: 2178, end: 2190, rate: 3, life: 220, origin: () => CAR_FIRE.clone().add(V(0, 3, 0)), rise: 0.08, wind: wind.clone().multiplyScalar(2), spread: 6,
      size0: 3, growth: 0.08, alpha: 0.75, tint: () => C('#241d1a')}, smoke);
    emit(sf, {seed: 'sb', start: 2000, end: 2004, rate: 6, life: 30, origin: () => V(-13, 1, -27), rise: 0.1, wind: V(0, 0, 0), spread: 2.5, size0: 1.5, growth: 0.08, alpha: 1, turb: 0.8, fadeIn: 0.02}, fire);
    // tear gas: canisters land closer and closer to the narrator
    const cans: [number, THREE.Vector3][] = [[1620, V(-15, 0.2, -23)], [1650, V(-11.5, 0.2, -20)], [1688, V(-8.6, 0.2, -17.2)]];
    cans.forEach(([t, land], i) => {
      emit(sf, {seed: `g${i}`, start: t + 22, end: t + 200, rate: 0.35, life: 160, origin: () => land, rise: 0.01, wind: V(0.02, 0, 0.016), spread: 1.5, size0: 1.5, growth: 0.04,
        alpha: 0.32, turb: 0.6, tint: () => C('#d9dbd6')}, gas);
      // canister flight + trail
      const k = (sf - t) / 22;
      if (k > 0 && k < 1) {
        const from = POLICE.clone().add(V(0, 2, 8));
        const pp = from.clone().lerp(land, k).add(V(0, Math.sin(k * Math.PI) * 9, 0));
        for (let j = 0; j < 6; j++) {
          const kj = Math.max(0, k - j * 0.04);
          gas.push({p: from.clone().lerp(land, kj).add(V(0, Math.sin(kj * Math.PI) * 9, 0)), size: 0.5 + j * 0.15, alpha: 0.5 - j * 0.07, rot: j, seed: j * 0.1});
        }
        sparks.push({p: pp, s: 0.05});
      }
    });
    embers(sf, 'pe', PALLET_FIRE, 1050, 2400, 1.0, 100, sparks, V(0.01, 0, 0.004), palletBurn);
    embers(sf, 'ce', CAR_FIRE, 1780, 2400, 1.2, 110, sparks, V(0.012, 0, 0.005), carBurn * (sf > 2175 ? 2 : 1));
    // ash & embers raining over everything after 10 €
    if (sf > 2176) {
      for (let i = 0; i < 700; i++) {
        const r = (n: number) => random(`ash${i}-${n}`);
        const t = (sf - 2176) + r(0) * 400;
        const base = pose.pos;
        const p = V(base.x + (r(1) - 0.5) * 30 + Math.sin(t * 0.03 + r(2) * 6) * 0.6, ((10 - t * 0.03 + r(3) * 10) % 10 + 10) % 10 - 0.5, base.z + (r(4) - 0.5) * 30 + t * 0.01);
        sparks.push({p, s: 0.01 + r(5) * 0.018});
      }
    }
  }
  const fireLights: PuffLight[] = [
    {pos: PALLET_FIRE.clone().add(V(0, 1.5, 0)), color: C('#ff7a2a'), intensity: palletBurn * 3 * flick('pl')},
    {pos: CAR_FIRE.clone().add(V(0, 1.5, 0)), color: C('#ff6a1a'), intensity: carBurn * 4 * flick('cl') + boom * 40},
    {pos: POLICE.clone().add(V(0, 2.2, 6)), color: policePhase ? C('#2a5cff') : C('#ff2a2a'), intensity: policeOn * 1.5},
  ];
  const ambientSmoke = fogC.clone().multiplyScalar(0.9).add(C('#141414'));

  // ---- hands
  const handAt = (track_: Track, f: number) => track(f, track_);
  const rT = handAt(R_TRACK, sf), lT = handAt(L_TRACK, sf);
  const tr = (seed: string) => (n: string) => smoothNoise(`${seed}${n}`, sf / 4) * (0.6 + tension * 2.2) + smoothNoise(`${seed}${n}x`, sf / 1.3) * tension * 1.5;
  const rPose: HandPose = tremble(poseAt(sf, fps, R_POSES), tr('r'), 1);
  const lPose: HandPose = tremble(poseAt(sf, fps, L_POSES), tr('l'), 1);
  const breathe = V(0, Math.sin(sf * 0.09) * 0.004, 0);
  const shakeV = V(smoothNoise('hx', sf / 2) * tension * 0.008, smoothNoise('hy', sf / 2) * tension * 0.008, 0);
  const R = handInCamera(pose.pos, qLag, rT.p.clone().add(breathe).add(shakeV), rT.e);
  const L = handInCamera(pose.pos, qLag, lT.p.clone().add(breathe).sub(shakeV), lT.e);
  // nozzle phase: hand is driven by the nozzle (camera-held → locked in the filler)
  const lock = smooth(sf, NOZ_LOCK);
  const holding = sf < 742;
  let nozP = NOZ_WORLD_P.clone(), nozQ = NOZ_WORLD_Q.clone();
  if (holding) {
    const nc = (i: number) => smooth(sf, NOZ_CAM_P.map((r) => [r[0], r[i]] as Key));
    const camNozP = V(nc(1), nc(2), nc(3)).add(breathe).add(shakeV).applyQuaternion(qLag).add(pose.pos);
    const camNozQ = qLag.clone().multiply(NOZ_CAM_Q);
    nozP = camNozP.lerp(NOZ_WORLD_P, lock);
    nozQ = camNozQ.slerp(NOZ_WORLD_Q, lock);
    // hand = nozzle ∘ inverse(nozzle-in-hand)
    const hq = nozQ.clone().multiply(NOZ_IN_HAND_Q.clone().invert());
    const hp = nozP.clone().sub(NOZ_IN_HAND_POS.clone().applyQuaternion(hq));
    R.position.copy(hp);
    R.quaternion.copy(hq);
  }
  // left hand touching the pump screen: lock to the screen plane
  const touch = smoothstep(285, 300, sf) * (1 - smoothstep(380, 392, sf));
  if (touch > 0) {
    // middle fingertip on the screen glass; fingers point from the narrator toward the pump face
    const scr = PUMP1.clone().add(V(0.262, 1.3 + Math.sin(sf * 0.15) * 0.004, 0.08));
    const qT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.32, 0.95, 0.12, 'YXZ'));
    const pT = scr.clone().sub(V(-0.008, -0.012, -0.188).applyQuaternion(qT));
    L.position.lerp(pT, touch);
    L.quaternion.slerp(qT, touch);
  }
  const rVis = smooth(sf, R_VIS as Key[]) > 0.5;
  const lVis = smooth(sf, L_VIS as Key[]) > 0.5;
  const pinchLocal = V(-0.04, -0.02, -0.13);
  const pinchR = pinchLocal.clone().applyQuaternion(R.quaternion).add(R.position);
  const pinchL = V(0.04, -0.02, -0.13).applyQuaternion(L.quaternion).add(L.position);
  const vestShown = sf > 768 && sf < 936;

  // DoF focus: hands when they act, far otherwise
  const handFocus = (sf < 740 ? 0.6 : 0) + (sf > 768 && sf < 935 ? 0.45 : 0) + (sf > 1075 && sf < 1190 ? 0.5 : 0) + (sf > 1650 && sf < 1790 ? 0.3 : 0)  + (sf > 2178 && sf < 2330 ? 0.4 : 0);
  const look0 = sf > 250 && sf < 400; // pump screen
  const focus = look0 ? 1.1 : handFocus > 0 ? smooth(sf, [[0, 0.62], [110, 1.15], [150, 1.1], [700, 1.1], [740, 8], [768, 0.5], [935, 0.5], [960, 12], [1075, 0.55], [1190, 14], [1650, 0.4], [1790, 12], [2178, 0.45], [2330, 0.45], [2384, 16]] as Key[]) : 14;
  const bokeh = handFocus > 0 || look0 ? 2.2 : 0.5;

  // narrator's car fuel flap open
  const queue = useMemo(() => [3, 8.6, 14.2, 19.8, 25.4, 31, 36.6, 42.2], []);
  const paints = ['#7d8a94', '#1e3a5f', '#8c1c1c', '#e9e9e4', '#2f3a33', '#5a5f66', '#b9b3a6', '#203040'];
  const grade = gradeAt(sf, GRADE_TRACK);
  const flash = Math.max(boom * 0.75, smallBoom * 0.2, frame >= LOOP - 12 ? smoothstep(LOOP - 12, LOOP, frame) * (1 - smoothstep(LOOP, LOOP + 22, frame)) : 0, frame >= LOOP && frame < LOOP + 22 ? 1 - smoothstep(LOOP, LOOP + 22, frame) : 0);
  const shockBlur = Math.max(boom, smallBoom * 0.5) * 30;

  const bodyYaw = pose.yaw;
  const agents = crowdAt(sf);

  return (
    <AbsoluteFill style={{background: '#000'}}>
      <Audio src={staticFile('audio/carburant-10-euros.wav')} />
      <ThreeCanvas width={width} height={height} frameloop="never" linear={false} flat={false} dpr={1}
        shadows={QUALITY.shadows ? {type: THREE.PCFSoftShadowMap} : false} gl={{antialias: true, outputColorSpace: THREE.SRGBColorSpace, preserveDrawingBuffer: true, powerPreference: 'high-performance'}}
        camera={{fov: 76, near: 0.01, far: 3000, position: [0, 1.66, 0]}}>
        <PovCamera pose={pose} near={0.01} far={3000} />
        <fogExp2 attach="fog" args={[fogC, fogDen]} />
        <SceneEnv map={env ? (elev < -3 ? env.night : env.sunset) : null} intensity={envI} rotationY={1.2} />
        <PhysicalSky dir={sd} turbidity={8} rayleigh={elev > 0 ? 1.6 : 0.6} mie={0.006} mieG={0.82} center={pose.pos} />
        <Stars opacity={night * (1 - smoothstep(1700, 1800, sf)) * 0.9} center={pose.pos} frame={sf} />
        <KeyLight dir={sd} color={sunC} intensity={sunI} focus={pose.pos.clone().addScaledVector(camFwd.clone().setY(0).normalize(), 8)} extent={18} mapSize={QUALITY.shadowMap} />
        {fireLights.map((l, i) => (
          <pointLight key={i} position={l.pos} color={l.color} intensity={l.intensity * 60} decay={2} distance={0} />
        ))}

        <Ground />
        <Hills />
        <Trees />
        <Houses lightsOn={night} />
        <StreetLights on={night} />
        <Shop lightsOn={Math.max(0.2, lightsOn)} />
        <Canopy lightsOn={lightsOn} />
        {[-0.95, -6.5, 4.6].map((x) => <PumpIsland key={x} x={x} />)}
        <PumpUnit position={PUMP1} yaw={0} screen={screen.mat} accent="#1f7a4a" bagged={rupture} />
        <PumpUnit position={V(-6.5, 0, -0.9)} yaw={Math.PI} screen={screen.mat} accent="#1f7a4a" bagged={rupture} />
        <PumpUnit position={V(4.6, 0, -0.9)} yaw={Math.PI} screen={screen.mat} accent="#1f7a4a" bagged={rupture} />
        <Totem price={price} frame={frame} rupture={rupture} glitch={glitch} lightsOn={Math.max(lightsOn, 0.25)} />

        {/* narrator's car with the filler open */}
        <Car position={CAR_N} yaw={0} look={{paint: '#5b6770', dirt: 0.35}} />
        <mesh position={FILLER.clone().add(V(0.0, 0, 0.0))} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.03, 0.03, 0.05, 16]} />
          <meshStandardMaterial color="#0a0a0a" roughness={0.6} />
        </mesh>
        <mesh position={FILLER.clone().add(V(-0.02, 0, 0.13))} rotation={[0, -1.2, 0]}>
          <boxGeometry args={[0.012, 0.13, 0.16]} />
          <meshPhysicalMaterial color="#5b6770" roughness={0.35} clearcoat={1} />
        </mesh>
        {/* other cars at the pumps, queue on the road */}
        {sf < 900 && <Car position={V(-3.8, 0, -1.4)} yaw={Math.PI} look={{paint: '#1e3a5f', dirt: 0.4}} />}
        {queue.map((x, i) => {
          const arrive = 470 + i * 34;
          const px = Math.max(x, x + (arrive + 60 - sf) * 0.45);
          if (sf < arrive - 200 || px > 140) return null;
          const burn = i === 0 ? Math.max(carBurn * 0.8, sf > 2175 ? 1 : 0) : 0;
          return <Car key={i} position={V(px, 0, ROAD_Z + 1.75)} yaw={Math.PI / 2} look={{paint: paints[i], dirt: 0.3, burnt: burn, lights: sf < 1290 && i > 0 ? 0.6 : 0}} wheelSpin={-px / 0.315} />;
        })}
        {/* police vans */}
        {sf > 1520 && [0, 1].map((i) => {
          const z = Math.min(POLICE.z - i * 7, POLICE.z - i * 7 - (1600 - sf) * 1.2);
          return (
            <group key={i}>
              <Car position={V(POLICE.x + (i ? 2.2 : -1.4), 0, z)} yaw={Math.PI} look={{paint: '#1b2a4a', lights: 1}} scale={[1.08, 1.32, 1.18]} />
              <mesh position={[POLICE.x + (i ? 2.2 : -1.4), 1.98, z]}>
                <boxGeometry args={[1.1, 0.1, 0.25]} />
                <meshBasicMaterial color={(policePhase + i) % 2 ? new THREE.Color(0.3, 0.6, 12) : new THREE.Color(12, 0.4, 0.3)} />
              </mesh>
            </group>
          );
        })}

        <Barricade burn={palletBurn} frame={sf} />
        {sf > 1000 && sf < 1700 && (
          <>
            <BannerSheet a={V(-17.5, 2.1, -19)} b={V(-14.2, 2.1, -20.3)} text="ON VEUT ROULER" frame={sf} seed={1} />
            <BannerSheet a={V(-21.5, 2.2, -16.5)} b={V(-18.2, 2.2, -17.2)} text="TROP C'EST TROP" frame={sf} seed={2} />
          </>
        )}
        {QUALITY.crowd && <CrowdView agents={agents} />}
        {QUALITY.body && <NarratorBody pos={pose.pos} yaw={bodyYaw} vest={sf > VEST_ON ? 1 : 0} />}

        {/* hands, nozzle, hose, vest */}
        <Hand {...R} visible={rVis || holding} pose={rPose} skin={look.skin} sleeve={look.sleeve} />
        <Hand {...L} left visible={lVis || touch > 0} pose={lPose} skin={look.skin} sleeve={look.sleeve} />
        {holding ? <Nozzle mats={nozMats} position={nozP} quaternion={nozQ} /> : null}
        <Hose from={PUMP1.clone().add(V(0.28, 1.55, 0.32))} to={holding ? nozP.clone().add(V(-0.08, -0.02, 0).applyQuaternion(nozQ)) : PUMP1.clone().add(V(0.3, 0.95, 0.32))} sag={holding ? 0.5 : 0.25} />
        {vestShown && <Vest a={pinchL} b={pinchR} frame={sf} camFwd={camFwd} />}

        <Puffs puffs={smoke} max={1400} kind="smoke" frame={sf} fogColor={fogC} fogDensity={fogDen} ambient={ambientSmoke} sunColor={sunC.clone().multiplyScalar(sunI * 0.25)} sunDir={sd} lights={fireLights} />
        <Puffs puffs={gas} max={900} kind="smoke" frame={sf} fogColor={fogC} fogDensity={fogDen} ambient={ambientSmoke.clone().multiplyScalar(1.6)} sunColor={sunC.clone().multiplyScalar(sunI * 0.2)} sunDir={sd} lights={fireLights} />
        <Puffs puffs={fire} max={700} kind="fire" frame={sf} fogColor={fogC} fogDensity={fogDen} heat={7} />
        <Embers pts={sparks} max={1400} />

        {QUALITY.fx && <PostFX quality={QUALITY} frame={frame} exposure={exposure} grade={grade} focus={focus} bokeh={bokeh} blur={[bl.x * (blurPx + shockBlur), bl.y * (blurPx + shockBlur)]}
          ca={0.003 + tension * 0.004 + boom * 0.02} distort={0.035} aoIntensity={2.4} bloom={0.55 + night * 0.3} />}
        <FrameDriver frame={frame} fps={fps} />
      </ThreeCanvas>
      {fontsOk && (
        <TikTokOverlay frame={frame} hook={TL.hook} hookEnd={TL.hookEnd} steps={TL.prices as [number, number][]} format={(v) => v.toFixed(2).replace('.', ',')}
          unit="€" label="LE LITRE" relances={TL.relances} flash={flash} tension={tension} loopStart={LOOP} hookBack={DURATION - 16} />
      )}
    </AbsoluteFill>
  );
};

export {DURATION};
