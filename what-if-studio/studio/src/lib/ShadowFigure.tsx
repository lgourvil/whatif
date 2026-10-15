import React, {useMemo} from 'react';
import * as THREE from 'three';

const geo = () => {
  const torso = new THREE.Shape();
  torso.moveTo(-0.25, 1.5); torso.lineTo(0.25, 1.5); torso.lineTo(0.17, 0.9); torso.lineTo(-0.17, 0.9); torso.closePath();
  return {
    torso: new THREE.ExtrudeGeometry(torso, {depth: 0.05, bevelEnabled: false}).translate(0, 0, -0.025),
    leg: new THREE.BoxGeometry(0.13, 0.92, 0.05),
    arm: new THREE.BoxGeometry(0.1, 0.72, 0.05),
    head: new THREE.CylinderGeometry(0.15, 0.15, 0.05, 12).rotateX(Math.PI / 2),
    eye: new THREE.PlaneGeometry(0.06, 0.11),
  };
};

type Props = {
  position: [number, number, number];
  /** facing angle: local +z (front) points to (sin θ, cos θ) in the x/z plane */
  yaw: number;
  /** 0 = lying flat on the ground (a shadow), 1 = standing up */
  rise: number;
  scale?: number;
  stretch?: number;
  phase?: number;
  walk?: number;
  wave?: number;
  eyes?: number;
  color?: THREE.ColorRepresentation;
  eyeColor?: THREE.ColorRepresentation;
};

/** Living paper-cut shadow: flat black silhouette that peels up off the ground, glowing eyes, waving arm. */
export const ShadowFigure: React.FC<Props> = ({position, yaw, rise, scale = 1, stretch = 1, phase = 0, walk = 0, wave = 0, eyes = 1, color = '#07060d', eyeColor = '#ffffff'}) => {
  const g = useMemo(geo, []);
  const sway = Math.sin(phase) * 0.07 * walk;
  const flip = 1 + Math.sin(phase * 2) * 0.06 * walk;
  const lying = 1 - rise;
  const armR = -Math.PI * 0.9 * wave + Math.sin(phase * 3) * 0.35 * wave;
  const eyeS = Math.max(0, (rise - 0.5) * 2) * eyes;
  const mat = <meshBasicMaterial color={color} />;
  return (
    <group position={[position[0], position[1] + 0.03 + lying * 0.02, position[2]]} rotation={[0, yaw, 0]}>
      <group rotation={[-lying * Math.PI / 2, 0, sway]} scale={[scale * flip, scale * stretch, scale]}>
        <mesh geometry={g.torso}>{mat}</mesh>
        <mesh geometry={g.leg} position={[-0.09, 0.46, 0]} rotation={[0, 0, 0.06 + Math.sin(phase) * 0.25 * walk]}>{mat}</mesh>
        <mesh geometry={g.leg} position={[0.09, 0.46, 0]} rotation={[0, 0, -0.06 - Math.sin(phase) * 0.25 * walk]}>{mat}</mesh>
        <mesh geometry={g.head} position={[0, 1.68, 0]}>{mat}</mesh>
        <group position={[-0.3, 1.46, 0]} rotation={[0, 0, 0.12 - Math.sin(phase) * 0.3 * walk]}>
          <mesh geometry={g.arm} position={[0, -0.34, 0]}>{mat}</mesh>
        </group>
        <group position={[0.3, 1.46, 0]} rotation={[0, 0, -0.12 + armR]}>
          <mesh geometry={g.arm} position={[0, -0.34, 0]}>{mat}</mesh>
        </group>
        {[-1, 1].map((s) => [0.032, -0.032].map((z) => (
          <mesh key={`${s}${z}`} geometry={g.eye} position={[s * 0.055, 1.7, z]} rotation={[0, z < 0 ? Math.PI : 0, 0]} scale={[eyeS, eyeS, eyeS]}>
            <meshBasicMaterial color={eyeColor} fog={false} />
          </mesh>
        )))}
      </group>
    </group>
  );
};
