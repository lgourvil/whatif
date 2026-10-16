import React from 'react';
import * as THREE from 'three';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {Hand, handTrack} from '../../lib/Hands';
import {Vape} from './Vape';
import {HAND_R, HAND_L, VAPE_IN_HAND} from './hands';

/** Close-up test bench for the hands and the hero prop (camera at origin looking -z). */
export const HandLab: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const r = handTrack(HAND_R, frame);
  const l = handTrack(HAND_L, frame);
  return (
    <AbsoluteFill style={{background: '#7fa8d8'}}>
      <ThreeCanvas width={width} height={height} linear={false} flat={false} dpr={1}
        gl={{antialias: true, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace, stencil: true}}
        camera={{fov: 70, position: [0, 0, 0], near: 0.05, far: 100}}>
        <hemisphereLight args={['#bcd4ff', '#806050', 1.0]} />
        <directionalLight position={[2, 4, 3]} intensity={1.8} />
        <group position={r.pos} quaternion={r.quat}>
          <Hand side={1} pose={r.pose} skin="#f0b48a" sleeve="#3b3f58" wristFlex={r.wrist} wristDev={r.dev}>
            <group position={VAPE_IN_HAND.pos} rotation={VAPE_IN_HAND.rot}><Vape pct={100} frame={frame} /></group>
          </Hand>
        </group>
        <group position={l.pos} quaternion={l.quat}>
          <Hand side={-1} pose={l.pose} skin="#f0b48a" sleeve="#3b3f58" wristFlex={l.wrist} />
        </group>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
