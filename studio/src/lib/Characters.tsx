import React from 'react';
import * as THREE from 'three';
import {ToonMesh, boxGeo, coneGeo, icoGeo} from './Toon';

const capGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);

/** The POV hand: palm + 4 fingers + thumb + sleeve. Local space, forearm points to +z (towards the body). */
const Hand: React.FC<{side: 1 | -1; curl: number; skin: string; sleeve: string}> = ({side, curl, skin, sleeve}) => (
  <group>
    <ToonMesh geometry={boxGeo} color={skin} scale={[0.1, 0.035, 0.1]} outline={0.06} />
    {[0, 1, 2, 3].map((i) => (
      <group key={i} position={[-0.0375 + i * 0.025, 0, -0.05]} rotation={[-curl * 1.15, 0, 0]}>
        <ToonMesh geometry={boxGeo} color={skin} position={[0, 0, -0.03]} scale={[0.021, 0.026, 0.06]} outline={0.1} />
      </group>
    ))}
    <group position={[side * -0.055, 0, -0.02]} rotation={[0, side * 0.7 - curl * side * 0.5, 0]}>
      <ToonMesh geometry={boxGeo} color={skin} position={[0, 0, -0.025]} scale={[0.024, 0.026, 0.06]} outline={0.1} />
    </group>
    <ToonMesh geometry={capGeo} color={sleeve} position={[0, 0.005, 0.22]} rotation={[Math.PI / 2, 0, 0]} scale={[0.1, 0.34, 0.1]} outline={0.05} />
  </group>
);

/**
 * First-person hands, rendered in camera space.
 * grip: 1 = holding a rail, 0 = relaxed. swing: walk phase (steps). swim: 0..1 breaststroke.
 */
export const PovHands: React.FC<{grip: number; swing: number; swingAmp: number; swim: number; swimPhase: number; visible: number; skin: string; sleeve: string; gripY?: number; gripZ?: number}> = ({grip, swing, swingAmp, swim, swimPhase, visible, skin, sleeve, gripY = -0.52, gripZ = -1.15}) => {
  if (visible <= 0.01) return null;
  const hands = ([-1, 1] as const).map((side) => {
    const s = Math.sin(swing * Math.PI + (side === 1 ? 0 : Math.PI));
    const rest = new THREE.Vector3(side * 0.28, -0.46 + s * 0.02 * swingAmp * 8, -0.62 - s * 0.05 * swingAmp * 8);
    const rail = new THREE.Vector3(side * 0.34, gripY, gripZ);
    const sw = Math.sin(swimPhase * Math.PI * 2);
    const stroke = new THREE.Vector3(side * (0.2 + 0.28 * Math.max(0, sw)), -0.3 - 0.1 * sw, -0.7 - 0.3 * Math.max(0, -sw));
    const p = rest.clone().lerp(rail, grip).lerp(stroke, swim);
    p.multiplyScalar(visible).add(new THREE.Vector3(0, -0.5 * (1 - visible), 0));
    const curl = Math.min(1, 0.25 + grip * 0.75 + swim * -0.1);
    return (
      <group key={side} scale={1.6} position={p.toArray()} rotation={[0.2 + swim * sw * 0.2, -side * (0.12 + swim * 0.25 * sw), side * 0.08]}>
        <Hand side={side} curl={curl} skin={skin} sleeve={sleeve} />
      </group>
    );
  });
  return <group>{hands}</group>;
};

/**
 * PIP — original recurring character: a kid in a yellow cap and a long red scarf.
 * Pose is entirely driven by `t` (frames) – walk/run cycle, arm raise, look.
 */
export const Pip: React.FC<{position: [number, number, number]; heading: number; t: number; run: number; point: number; scale?: number; palette: {body: string; cap: string; scarf: string; skin: string}}> = ({position, heading, t, run, point, scale = 1, palette}) => {
  const f = t * (0.2 + run * 0.14);
  const legA = Math.sin(f * Math.PI) * (0.5 + run * 0.5);
  const armA = Math.sin(f * Math.PI + Math.PI) * (0.4 + run * 0.8);
  const bob = Math.abs(Math.sin(f * Math.PI)) * 0.06;
  const scarfWave = Math.sin(t * 0.35) * 0.25;
  return (
    <group position={position} rotation={[0, heading, 0]} scale={scale}>
      <group position={[0, 0.0 + bob, 0]}>
        {/* legs */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.1, 0.5, 0]} rotation={[legA * s, 0, 0]}>
            <ToonMesh geometry={boxGeo} color="#2a2f4a" position={[0, -0.25, 0]} scale={[0.14, 0.5, 0.16]} outline={0.08} />
          </group>
        ))}
        {/* torso */}
        <ToonMesh geometry={boxGeo} color={palette.body} position={[0, 0.8, 0]} scale={[0.4, 0.5, 0.26]} outline={0.05} />
        {/* arms */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.27, 0.98, 0]} rotation={[s === 1 ? -point * 2.6 : armA * s * -1, 0, s * 0.1]}>
            <ToonMesh geometry={boxGeo} color={palette.body} position={[0, -0.22, 0]} scale={[0.11, 0.46, 0.11]} outline={0.08} />
            <ToonMesh geometry={icoGeo} color={palette.skin} position={[0, -0.5, 0]} scale={0.14} outline={0.1} />
          </group>
        ))}
        {/* head */}
        <ToonMesh geometry={icoGeo} color={palette.skin} position={[0, 1.2, 0]} scale={0.44} outline={0.05} />
        {/* signature: yellow cap + long scarf */}
        <ToonMesh geometry={coneGeo} color={palette.cap} position={[0, 1.42, 0]} scale={[0.48, 0.3, 0.48]} outline={0.06} />
        <ToonMesh geometry={boxGeo} color={palette.cap} position={[0, 1.33, -0.24]} scale={[0.36, 0.04, 0.24]} outline={0.1} />
        <ToonMesh geometry={boxGeo} color={palette.scarf} position={[0, 1.0, 0]} scale={[0.36, 0.1, 0.32]} outline={0.06} />
        <group position={[0, 1.0, 0.16]} rotation={[0.4 + run * 0.6, scarfWave, 0]}>
          <ToonMesh geometry={boxGeo} color={palette.scarf} position={[0, 0, 0.35]} scale={[0.1, 0.04, 0.7]} outline={0.1} />
        </group>
      </group>
    </group>
  );
};
