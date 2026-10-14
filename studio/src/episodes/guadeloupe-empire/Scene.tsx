import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ACESFilmicToneMapping, DirectionalLight, FogExp2, Group, Object3D, SRGBColorSpace, Vector3 } from "three";
import { Character } from "../../lib/Characters";
import { handGeo, skinMat } from "../../lib/Characters";
import { WavingFlag } from "../../lib/Flag";
import { keyed } from "../../lib/noise";
import { Ocean } from "../../lib/Ocean";
import { Captions, ScreenFx } from "../../lib/Overlay";
import { MOODS, PALETTES, moodAt, type Mood } from "../../lib/palettes";
import { PovCamera, impactShake } from "../../lib/PovCamera";
import { Sky } from "../../lib/Sky";
import { bannerTexture } from "../../lib/textures";
import { toon } from "../../lib/ToonMaterial";
import { Fleet, PlayerBoat } from "./Boat";
import { BURSTS, Confetti, Fireworks, Spray } from "./Fx";
import { Globe, homeWorld } from "./Globe";
import { Clouds, HomeBeach, Islands, Skyline } from "./Places";
import { LOOP, TL, W, boatX, boatZ, camAt, inSpace, worldFrame } from "./world";

export const SHADOWS = true;
const PAL = PALETTES.guadeloupeEmpire;

const MOOD_TRACK: [number, string][] = [
  [0, "tropicalMorning"], [300, "tropicalMorning"], [520, "tropicalNoon"], [700, "sunset"], [800, "night"], [960, "night"],
  [1070, "tropicalMorning"], [1200, "tropicalNoon"], [1460, "empireGold"], [1640, "empireGold"], [1700, "space"], [2238, "space"],
  [2239, "tropicalMorning"], [2400, "tropicalMorning"],
];
const moodFor = (f: number): Mood => (inSpace(f) ? MOODS.space : moodAt(f, MOOD_TRACK));

const SUN_KEYS: [number, [number, number, number]][] = [
  [0, [0.55, 0.32, -0.77]], [520, [0.25, 0.9, -0.35]], [700, [-0.55, 0.1, -0.83]], [790, [-0.6, -0.25, -0.75]],
  [1000, [0.7, -0.2, -0.7]], [1100, [0.6, 0.35, -0.7]], [1300, [0.2, 0.85, -0.45]], [1500, [0.12, 0.22, -0.97]], [1700, [0.12, 0.3, -0.95]],
];
const sunDirAt = (f: number) => {
  if (inSpace(f)) return new Vector3(0.85, 0.35, 0.4).normalize();
  const wf = worldFrame(f);
  const v = new Vector3(
    keyed(wf, SUN_KEYS.map(([k, d]) => [k, d[0]])),
    keyed(wf, SUN_KEYS.map(([k, d]) => [k, d[1]])),
    keyed(wf, SUN_KEYS.map(([k, d]) => [k, d[2]])),
  );
  return v.normalize();
};

// Fog + scene-level state driven per frame.
const FogRig: React.FC<{ mood: Mood }> = ({ mood }) => {
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    if (!(scene.fog instanceof FogExp2)) scene.fog = new FogExp2(mood.fog, mood.fogDensity);
    const fog = scene.fog as FogExp2;
    fog.color.set(mood.fog);
    fog.density = mood.fogDensity;
  });
  return null;
};

// Sun light follows the camera so the 1024 shadow map always covers the foreground.
const SunLight: React.FC<{ mood: Mood; dir: Vector3; center: Vector3 }> = ({ mood, dir, center }) => {
  const light = useMemo(() => {
    const l = new DirectionalLight();
    l.castShadow = SHADOWS;
    l.shadow.mapSize.set(1024, 1024);
    const c = l.shadow.camera;
    c.left = -45; c.right = 45; c.top = 45; c.bottom = -45; c.near = 1; c.far = 400;
    l.shadow.bias = -0.0008;
    l.shadow.normalBias = 0.04;
    return l;
  }, []);
  const target = useMemo(() => new Object3D(), []);
  const up = Math.max(0.12, dir.y);
  light.position.set(center.x + dir.x * 150, center.y + up * 150, center.z + dir.z * 150);
  target.position.copy(center);
  light.target = target;
  light.color.set(mood.sun);
  light.intensity = mood.sunIntensity * (dir.y < 0 ? 0.25 : 1);
  return (
    <>
      <primitive object={light} />
      <primitive object={target} />
    </>
  );
};

// POV hands holding the imperial banner — placed in camera space after the camera moves.
const PovHands: React.FC<{ f: number; amount: number; wave: number }> = ({ f, amount, wave }) => {
  const camera = useThree((s) => s.camera);
  const ref = useRef<Group>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    ref.current.position.copy(camera.position);
    ref.current.quaternion.copy(camera.quaternion);
  });
  const tex = bannerTexture();
  const drop = (1 - amount) * -0.75;
  const lift = wave * 0.08 * Math.sin(W(f) * 60);
  const skin = skinMat("#6b3f2a");
  const sleeve = toon(PAL.madrasRed);
  return (
    <group ref={ref} visible={amount > 0.01}>
      {/* right hand gripping the pole */}
      <group position={[0.12, -0.23 + drop + lift, -0.45]} rotation={[0.35, -0.25, -0.12]} scale={0.8}>
        <mesh geometry={handGeo.forearm} material={skin} position={[0, 0, 0.42]} />
        <mesh geometry={handGeo.sleeve} material={sleeve} position={[0, 0, 0.62]} />
        <mesh geometry={handGeo.fist} material={skin} />
        <group position={[0, -0.12, 0]} rotation={[-0.95, 0, -0.12]}>
          <WavingFlag frame={f} loopFrames={LOOP} texture={tex} height={1.05} width={0.5} raise={1} seed={1} outline={0.006} rotationY={2.6} />
        </group>
      </group>
      {/* left hand, relaxed, half in frame */}
      <group position={[-0.15, -0.33 + drop * 1.2, -0.5]} rotation={[0.55, 0.3, 0.25]} scale={0.8}>
        <mesh geometry={handGeo.forearm} material={skin} position={[0, 0, 0.42]} />
        <mesh geometry={handGeo.sleeve} material={sleeve} position={[0, 0, 0.62]} />
        <mesh geometry={handGeo.fist} material={skin} />
      </group>
    </group>
  );
};

// Tonton Rémy (madras headwrap) and Ti-Jo (conch shell): beach → into the boat.
const Crew: React.FC<{ f: number; wf: number }> = ({ f, wf }) => {
  const toBoat = keyed(wf, [[140, 0], [262, 1]]);
  const remyBoard = keyed(wf, [[200, 0], [255, 1]]);
  const b = { x: boatX(wf), z: boatZ(wf) };
  const lerp = (a: number, c: number) => a + (c - a) * toBoat;
  const walking = wf > 140 && wf < 262 ? 1 : 0;
  const ph = wf / 14;
  const wave = wf < 140 ? 1 : 0;
  const conch = keyed(wf, [[1222, 0], [1236, 1], [1300, 1], [1320, 0]]);
  const lookBack = keyed(wf, [[722, 0], [742, 1], [778, 1], [796, 0]]);
  const inBoat = toBoat >= 1;
  return (
    <>
      <Character
        signature="madrasWrap"
        shirt="#f4f1e8"
        pants="#3a3f6b"
        position={[
          wf < 200 ? lerp(2.1, 1.6) : 1.6 + (b.x + 0.25 - 1.6) * remyBoard,
          wf < 200 ? 0.66 - toBoat * 0.9 : -0.25 + 0.63 * remyBoard,
          wf < 200 ? 8.3 + (3.0 - 8.3) * Math.min(1, (wf - 140) / 60 > 0 ? (wf - 140) / 60 : 0) : 3.0 + (b.z + 3.3 - 3.0) * remyBoard,
        ]}
        rotationY={keyed(wf, [[0, -0.25], [140, -0.25], [160, 3.14], [262, 3.14]])}
        pose={{
          walk: walking, phase: ph,
          armR: { raise: wave * (1.9 + 0.35 * Math.sin(W(f) * 50)), fwd: inBoat ? 0.9 : 0 },
          armL: { fwd: inBoat ? 0.6 + lookBack * 1.4 : 0, raise: lookBack * 0.6 },
          headYaw: inBoat ? 0.3 * Math.sin(W(f) * 5) : 0,
          bounce: lookBack * 0.08 * Math.abs(Math.sin(W(f) * 80)),
        }}
      />
      <Character
        signature="conch"
        scale={0.55}
        shirt={PAL.madrasYellow}
        pants="#2f9e57"
        position={[lerp(-1.45, b.x - 0.35), inBoat ? 0.4 : lerp(0.66, 0.4), lerp(9.2, b.z - 3.35)]}
        rotationY={keyed(wf, [[0, 0.2], [140, 0.2], [160, Math.PI], [262, Math.PI], [1220, Math.PI], [1236, 0.4], [1300, 0.4], [1330, Math.PI]])}
        pose={{
          walk: walking, phase: ph * 1.3,
          armL: { fwd: conch * 2.6 + wave * 0.3, raise: wave * (2.4 + 0.3 * Math.sin(W(f) * 70)) },
          armR: { raise: conch * 1.2 + (wave ? 0.4 : 0) },
          bounce: wave * 0.18 * Math.abs(Math.sin(W(f) * 45)) + conch * 0.06 * Math.abs(Math.sin(W(f) * 90)),
          headPitch: -conch * 0.3,
        }}
      />
    </>
  );
};

const World: React.FC<{ f: number }> = ({ f }) => {
  const wf = worldFrame(f);
  const space = inSpace(f);
  const mood = moodFor(f);
  const cam = camAt(f);
  const sunDir = sunDirAt(f);
  const moonDir = useMemo(() => new Vector3(-0.35, 0.55, -0.76).normalize(), []);
  const impacts = TL.impacts.map((i) => ({ frame: i.frame, strength: i.strength }));
  const hands = keyed(f, [[0, 1], [236, 1], [262, 0], [2290, 0], [2340, 1], [2400, 1]]);
  const night = mood.stars;
  // accent lights: boat lantern at night, firework flashes, empire glow in space
  const fwLight = BURSTS.reduce((acc, b) => acc + Math.max(0, 1 - Math.abs(wf - b.at - 4) / 14), 0);
  const fwPos = BURSTS.reduce((best, b) => (Math.abs(wf - b.at) < Math.abs(wf - best.at) ? b : best), BURSTS[0]);
  const pin = homeWorld();
  const empirePulse = 0.6 + 0.4 * Math.sin(W(f) * 20);

  return (
    <>
      <PovCamera frame={f} pos={cam.pos} look={cam.look} walk={cam.walk} stepPhase={cam.phase} tension={cam.tension}
        head={{ yaw: cam.yaw, pitch: cam.pitch }} impacts={impacts} fov={cam.fov} fovGain={space ? 0 : 12} roll={cam.roll} seed="gwada" />
      <PovHands f={f} amount={hands} wave={f < 120 || f > 2340 ? 1 : 0} />
      <FogRig mood={mood} />
      <Sky mood={mood} center={[cam.pos.x, 0, cam.pos.z]} sunDir={sunDir} moonDir={night > 0.05 ? moonDir : undefined} sunSize={space ? 0.0025 : 0.0014} />
      <hemisphereLight args={[mood.hemiSky, mood.hemiGround, mood.hemiIntensity]} />
      <SunLight mood={mood} dir={sunDir} center={space ? new Vector3(0, 0, 0) : new Vector3(cam.pos.x, 0, cam.pos.z - 10)} />

      {space ? (
        <>
          <Globe f={f} />
          <pointLight position={pin.clone().multiplyScalar(1.08)} color={PAL.madrasYellow} intensity={900 * empirePulse} distance={50} decay={2} />
        </>
      ) : (
        <>
          <Ocean frame={f} loopFrames={LOOP} center={[cam.pos.x, cam.pos.z]} color={PAL.lagoon} />
          <HomeBeach />
          <Islands wf={wf} f={f} />
          <Skyline wf={wf} f={f} />
          <Clouds f={f} />
          <Fleet wf={wf} f={f} />
          <PlayerBoat wf={wf} f={f} />
          <Crew f={f} wf={wf} />
          <Fireworks wf={wf} />
          <Confetti wf={wf} />
          <Spray wf={wf} f={f} />
          <pointLight position={[boatX(wf), 3.2, boatZ(wf) - 2.6]} color="#ffb35c" intensity={night * 60} distance={30} decay={2} />
          <pointLight position={fwPos.c} color={fwPos.color} intensity={fwLight * 250000} distance={900} decay={2} />
        </>
      )}
    </>
  );
};

export const GuadeloupeEmpire: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = keyed(f, TL.tension as [number, number][]);
  const kick = Math.abs(impactShake(f, TL.impacts));
  const flash = Math.max(
    keyed(f, [[1668, 0], [1696, 1], [1712, 1], [1740, 0]]),
    keyed(f, [[2218, 0], [2238, 1], [2252, 1], [2292, 0]]),
    TL.impacts.reduce((a, i) => a + (i.kind === "climax" ? Math.max(0, 0.5 - Math.abs(f - i.frame) / 10) : i.kind === "firework" || i.kind === "horn" ? Math.max(0, 0.12 - Math.abs(f - i.frame) / 25) : 0), 0),
  );
  const cam0 = camAt(f), cam1 = camAt(f + 1);
  const yawVel = Math.abs(cam1.yaw - cam0.yaw) + Math.abs(cam1.pitch - cam0.pitch);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <ScreenFx frame={f} vignette={0.45 + t * 0.25} aberration={t * 2.2 + kick * 6 + yawVel * 40} motionBlur={yawVel * 90 + kick * 3}
        flash={flash} grain={0.07} tint={t > 0.6 ? PAL.madrasRed : undefined} tintAmount={Math.max(0, t - 0.6) * 0.35}>
        <ThreeCanvas width={width} height={height} linear={false} flat={false} dpr={1} shadows={SHADOWS}
          gl={{ toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace, antialias: true, preserveDrawingBuffer: true }}
          camera={{ fov: 68, near: 0.05, far: 6000, position: [0, 1.7, 13] }}>
          <World f={f} />
        </ThreeCanvas>
      </ScreenFx>
      <Captions frame={f} fps={fps} texts={TL.texts} accent={PAL.madrasYellow} accentInk="#16121c" instantFrames={[0, 2370]} />
      <Audio src={staticFile("audio/guadeloupe-empire.wav")} />
    </AbsoluteFill>
  );
};
