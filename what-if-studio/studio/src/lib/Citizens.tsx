import React from 'react';
import * as THREE from 'three';
import {Outlined} from './Characters';

/**
 * Citizens v1: generic low-poly passers-by with two-segment arms (shoulder + elbow), head yaw/pitch, walk cycle,
 * a held-prop slot in the right hand and a few signature silhouettes (cap, beanie, bun + cane, hood, bob).
 * Local frame: feet at origin, facing +z, 1.75 m tall at scale 1.
 */
export type Hair = 'none' | 'cap' | 'beanie' | 'bun' | 'hood' | 'bob';

const G = {
  torso: new THREE.CylinderGeometry(0.2, 0.25, 0.62, 7),
  hips: new THREE.CylinderGeometry(0.24, 0.22, 0.2, 7),
  leg: new THREE.CylinderGeometry(0.085, 0.07, 0.86, 6).translate(0, -0.43, 0),
  shoe: new THREE.BoxGeometry(0.12, 0.08, 0.24),
  upper: new THREE.CylinderGeometry(0.068, 0.06, 0.3, 6).translate(0, -0.15, 0),
  fore: new THREE.CylinderGeometry(0.058, 0.05, 0.27, 6).translate(0, -0.135, 0),
  hand: new THREE.IcosahedronGeometry(0.06, 0),
  neck: new THREE.CylinderGeometry(0.07, 0.08, 0.1, 6),
  head: new THREE.IcosahedronGeometry(0.165, 1),
  eye: new THREE.BoxGeometry(0.03, 0.04, 0.02),
  nose: new THREE.ConeGeometry(0.03, 0.07, 4).rotateX(Math.PI / 2),
  capTop: new THREE.SphereGeometry(0.175, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
  brim: new THREE.BoxGeometry(0.22, 0.025, 0.16),
  bun: new THREE.IcosahedronGeometry(0.085, 0),
  pom: new THREE.IcosahedronGeometry(0.05, 0),
  hood: new THREE.SphereGeometry(0.205, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62),
  bob: new THREE.CylinderGeometry(0.19, 0.2, 0.2, 8),
  cane: new THREE.CylinderGeometry(0.014, 0.014, 0.9, 5),
};

export type CitizenProps = {
  position: [number, number, number];
  yaw: number;
  scale?: number;
  phase?: number;
  walk?: number;
  /** 0 = arm down, 1 = right hand at the mouth */
  raise?: number;
  headYaw?: number;
  headPitch?: number;
  stoop?: number;
  coat: THREE.ColorRepresentation;
  pants?: THREE.ColorRepresentation;
  skin: THREE.ColorRepresentation;
  hair?: Hair;
  hairColor?: THREE.ColorRepresentation;
  cane?: boolean;
  /** rendered in the right hand (e.g. a tiny vape) */
  held?: React.ReactNode;
};

export const MOUTH: [number, number, number] = [0, 1.6, 0.17];

/** World position of a citizen's mouth (for emitting breath, smoke, speech bubbles...). */
export const mouthOf = (pos: [number, number, number], yaw: number, scale = 1, stoop = 0): [number, number, number] => {
  const z = MOUTH[2] + stoop * 0.2;
  const y = MOUTH[1] - stoop * 0.12;
  return [pos[0] + Math.sin(yaw) * z * scale, pos[1] + y * scale, pos[2] + Math.cos(yaw) * z * scale];
};

export const Citizen: React.FC<CitizenProps> = ({
  position, yaw, scale = 1, phase = 0, walk = 0, raise = 0, headYaw = 0, headPitch = 0, stoop = 0,
  coat, pants = '#2b2b3a', skin, hair = 'none', hairColor = '#2a1c14', cane = false, held,
}) => {
  const sw = Math.sin(phase) * 0.55 * walk;
  const bob = Math.abs(Math.cos(phase)) * 0.035 * walk;
  const dark = new THREE.Color(coat).multiplyScalar(0.7);
  // right arm: shoulder swings forward, elbow folds the forearm up to the mouth
  const rShoulder = -raise * 0.95 + (1 - raise) * sw * 0.8;
  const rElbow = -raise * 2.05 - 0.15;
  const lShoulder = -sw * 0.8 + (cane ? -0.35 : 0);
  return (
    <group position={position} rotation={[0, yaw, 0]} scale={scale}>
      <group position={[0, bob, 0]}>
        {/* legs */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.11, 0.92, 0]} rotation={[s * sw, 0, 0]}>
            <Outlined geometry={G.leg} color={pants} thickness={0.05} />
            <Outlined geometry={G.shoe} color="#1d1d24" position={[0, -0.86, 0.05]} thickness={0.08} />
          </group>
        ))}
        <Outlined geometry={G.hips} color={pants} position={[0, 0.98, 0]} thickness={0.05} />
        <group position={[0, 1.0, 0]} rotation={[stoop * 0.45, 0, 0]}>
          <Outlined geometry={G.torso} color={coat} position={[0, 0.33, 0]} thickness={0.05} />
          {/* zip line / scarf detail */}
          <Outlined geometry={G.eye} color={dark} position={[0, 0.36, 0.22]} scale={[0.6, 12, 0.5]} outline={false} />
          <Outlined geometry={G.neck} color={skin} position={[0, 0.68, 0]} thickness={0.05} />
          {/* head */}
          <group position={[0, 0.83, 0]} rotation={[-headPitch - stoop * 0.3, headYaw, 0]}>
            <Outlined geometry={G.head} color={skin} thickness={0.06} />
            <Outlined geometry={G.nose} color={skin} position={[0, -0.01, 0.17]} thickness={0.1} />
            {[-1, 1].map((s) => <Outlined key={s} geometry={G.eye} color="#111" position={[s * 0.06, 0.03, 0.15]} outline={false} />)}
            {hair === 'cap' && (<>
              <Outlined geometry={G.capTop} color={hairColor} position={[0, 0.03, 0]} thickness={0.04} />
              <Outlined geometry={G.brim} color={hairColor} position={[0, 0.04, 0.17]} thickness={0.06} />
            </>)}
            {hair === 'beanie' && (<>
              <Outlined geometry={G.capTop} color={hairColor} position={[0, 0.02, 0]} scale={[1, 1.25, 1]} thickness={0.04} />
              <Outlined geometry={G.pom} color="#ffffff" position={[0, 0.25, 0]} thickness={0.1} />
            </>)}
            {hair === 'bun' && (<>
              <Outlined geometry={G.capTop} color={hairColor} position={[0, 0.02, -0.01]} thickness={0.04} />
              <Outlined geometry={G.bun} color={hairColor} position={[0, 0.17, -0.1]} thickness={0.08} />
            </>)}
            {hair === 'hood' && <Outlined geometry={G.hood} color={coat} position={[0, 0.0, -0.03]} rotation={[-0.35, 0, 0]} thickness={0.04} />}
            {hair === 'bob' && <Outlined geometry={G.bob} color={hairColor} position={[0, 0.02, -0.03]} thickness={0.04} />}
          </group>
          {/* right arm (holds the prop) */}
          <group position={[-0.27, 0.56, 0]} rotation={[rShoulder, 0, -0.08 - raise * 0.3]}>
            <Outlined geometry={G.upper} color={coat} thickness={0.06} />
            <group position={[0, -0.3, 0]} rotation={[rElbow, 0, raise * 0.5]}>
              <Outlined geometry={G.fore} color={coat} thickness={0.06} />
              <Outlined geometry={G.hand} color={skin} position={[0, -0.29, 0]} thickness={0.08} />
              <group position={[0, -0.32, 0.03]} rotation={[Math.PI / 2 + 0.3, 0, 0]}>{held}</group>
            </group>
          </group>
          {/* left arm */}
          <group position={[0.27, 0.56, 0]} rotation={[lShoulder, 0, 0.08]}>
            <Outlined geometry={G.upper} color={coat} thickness={0.06} />
            <group position={[0, -0.3, 0]} rotation={[-0.2 + (cane ? -0.4 : 0), 0, 0]}>
              <Outlined geometry={G.fore} color={coat} thickness={0.06} />
              <Outlined geometry={G.hand} color={skin} position={[0, -0.29, 0]} thickness={0.08} />
              {cane && <Outlined geometry={G.cane} color="#5a3a22" position={[0, -0.62, 0.05]} rotation={[0.75, 0, 0]} thickness={0.2} />}
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};
