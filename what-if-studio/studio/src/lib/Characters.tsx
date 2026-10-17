import React from 'react';
import * as THREE from 'three';
import {outlineMaterial, toonProps} from './ToonMaterial';

type OProps = {
  geometry: THREE.BufferGeometry;
  color: THREE.ColorRepresentation;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
  thickness?: number;
  shadow?: boolean;
  emissive?: THREE.ColorRepresentation;
};

/** Toon mesh + inverted-hull outline (duplicate mesh, BackSide, slightly larger, black). */
export const Outlined: React.FC<OProps> = ({geometry, color, position, rotation, scale = 1, thickness = 0.06, shadow = true, emissive}) => {
  const s: [number, number, number] = typeof scale === 'number' ? [scale, scale, scale] : scale;
  return (
    <group position={position} rotation={rotation} scale={s}>
      <mesh geometry={geometry} castShadow={shadow}>
        <meshToonMaterial {...toonProps(color)} emissive={emissive ?? '#000000'} />
      </mesh>
      <mesh geometry={geometry} material={outlineMaterial()} scale={1 + thickness} />
    </group>
  );
};

const G = {
  body: new THREE.CylinderGeometry(0.3, 0.34, 0.85, 6),
  head: new THREE.IcosahedronGeometry(0.28, 0),
  leg: new THREE.BoxGeometry(0.15, 0.62, 0.17),
  arm: new THREE.BoxGeometry(0.12, 0.55, 0.12),
  ant: new THREE.CylinderGeometry(0.015, 0.015, 0.4, 4),
  bulb: new THREE.OctahedronGeometry(0.07, 0),
  scarf: new THREE.BoxGeometry(0.2, 0.08, 0.45),
  visor: new THREE.BoxGeometry(0.34, 0.1, 0.12),
};

type PipProps = {
  position: [number, number, number];
  yaw: number;
  phase: number; // walk phase
  moving: number; // 0..1
  point: number; // 0..1 arm raised toward the horizon
  scale?: number;
  body: THREE.ColorRepresentation;
  scarf: THREE.ColorRepresentation;
  glow: THREE.ColorRepresentation;
  frame: number;
  /** extra whole-body rotation (weightless tumbling) */
  tumble?: [number, number, number];
};

/** Pip: original recurring companion. Round low-poly body, visor, long scarf and a glowing antenna. */
export const Pip: React.FC<PipProps> = ({position, yaw, phase, moving, point, scale = 1, body, scarf, glow, frame, tumble = [0, 0, 0]}) => {
  const sw = Math.sin(phase) * 0.7 * moving;
  const bob = Math.abs(Math.sin(phase)) * 0.05 * moving;
  return (
    <group position={position} rotation={[0, -yaw, 0]} scale={scale}>
      <group position={[0, bob + 1, 0]} rotation={tumble}>
      <group position={[0, -1, 0]}>
        <Outlined geometry={G.body} color={body} position={[0, 0.95, 0]} />
        <Outlined geometry={G.head} color={body} position={[0, 1.6, 0]} />
        <Outlined geometry={G.visor} color="#111111" position={[0, 1.62, -0.2]} thickness={0.03} />
        <mesh position={[0, 1.95, 0]} geometry={G.ant}><meshBasicMaterial color="#222" /></mesh>
        <mesh position={[0, 2.17, 0]} geometry={G.bulb}><meshBasicMaterial color={glow} /></mesh>
        {[0, 1, 2].map((i) => (
          <Outlined key={i} geometry={G.scarf} color={scarf} thickness={0.1}
            position={[0.02 * i, 1.34 - 0.03 * i, 0.4 + i * 0.4]}
            rotation={[Math.sin(frame * 0.2 + i) * 0.25, Math.sin(frame * 0.13 + i * 1.3) * 0.3, 0]} />
        ))}
        <group position={[-0.22, 0.62, 0]} rotation={[sw, 0, 0]}>
          <Outlined geometry={G.leg} color="#2b2b3a" position={[0, -0.3, 0]} />
        </group>
        <group position={[0.22, 0.62, 0]} rotation={[-sw, 0, 0]}>
          <Outlined geometry={G.leg} color="#2b2b3a" position={[0, -0.3, 0]} />
        </group>
        <group position={[-0.42, 1.28, 0]} rotation={[-sw * 0.8, 0, 0.15]}>
          <Outlined geometry={G.arm} color={body} position={[0, -0.25, 0]} />
        </group>
        <group position={[0.42, 1.28, 0]} rotation={[sw * 0.8 - point * 2.9, 0, -0.15]}>
          <Outlined geometry={G.arm} color={body} position={[0, -0.25, 0]} />
        </group>
      </group>
      </group>
    </group>
  );
};

const H = {
  palm: new THREE.BoxGeometry(0.16, 0.05, 0.17),
  finger: new THREE.BoxGeometry(0.035, 0.03, 0.12),
  fore: new THREE.BoxGeometry(0.1, 0.1, 0.55),
};

/** First-person hands, placed in world space from the camera pose (so they sit "on" the camera). */
export const PovHands: React.FC<{
  position: THREE.Vector3; quaternion: THREE.Quaternion;
  glove: THREE.ColorRepresentation; sleeve: THREE.ColorRepresentation;
  raise: number; swing: number; frame: number;
}> = ({position, quaternion, glove, sleeve, raise, swing, frame}) => {
  const hand = (side: number) => {
    const sw = Math.sin(frame * 0.0 + swing * side) * 0.12;
    return (
      <group position={[side * 0.2, -0.3 - (1 - raise) * 0.6 + sw, -0.7 + sw * 0.5]} scale={0.7} rotation={[0.35 + (1 - raise) * 0.4, -side * 0.12, side * 0.18]}>
        <Outlined geometry={H.fore} color={sleeve} position={[0, 0, 0.3]} thickness={0.05} shadow={false} />
        <Outlined geometry={H.palm} color={glove} thickness={0.1} shadow={false} />
        {[-0.055, -0.018, 0.018, 0.055].map((x, i) => (
          <Outlined key={i} geometry={H.finger} color={glove} position={[x, 0, -0.12]} thickness={0.12} shadow={false} />
        ))}
      </group>
    );
  };
  return (
    <group position={position} quaternion={quaternion}>
      {hand(-1)}
      {hand(1)}
    </group>
  );
};
