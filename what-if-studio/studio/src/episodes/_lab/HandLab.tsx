import React, {useLayoutEffect} from 'react';
import * as THREE from 'three';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import {Hand, useNarratorLook, handInCamera} from '../../lib/PovHands';
import {POSES, PoseName} from '../../lib/HandPoses';
import {KeyLight, SceneEnv, sunDir, useHdris} from '../../lib/Environment';
import {PostFX} from '../../lib/PostFX';
import {GRADES} from '../../lib/grades';
import {FrameDriver} from '../../lib/FrameDriver';

const Cam: React.FC = () => {
  const cam = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    cam.position.set(0, 1.6, 0); cam.lookAt(0, 1.3, -1); cam.fov = 60; cam.near = 0.01; cam.far = 500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  });
  return null;
};

const LIST: PoseName[] = ['relaxed', 'grip', 'point', 'palm_out', 'open', 'fist', 'pinch', 'brace'];

export const HandLab: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const env = useHdris(['sunset']);
  const look = useNarratorLook();
  const cam = new THREE.Vector3(0, 1.6, 0);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(cam, new THREE.Vector3(0, 1.3, -1), new THREE.Vector3(0, 1, 0)));
  const pose = POSES[LIST[Math.floor(frame / 3) % LIST.length]];
  const pose2 = pose;
  const view = frame % 3;
  const eul: [number, number, number][] = [[0.9, 0, 0], [0.5, 1.5, 0.0], [-0.6, 0.2, Math.PI]];
  const R = handInCamera(cam, q, new THREE.Vector3(0.0, 0.02, -0.42), eul[view]);
  const L = handInCamera(cam, q, new THREE.Vector3(-5, -0.13, -0.4), [0.2, -0.4, 1.4]);
  return (
    <AbsoluteFill style={{background: '#000'}}>
      <ThreeCanvas width={width} height={height} frameloop="never" linear={false} flat={false} dpr={1} shadows={{type: THREE.PCFSoftShadowMap}}
        gl={{antialias: true, outputColorSpace: THREE.SRGBColorSpace, preserveDrawingBuffer: true}}>
        <Cam />
        <SceneEnv map={env?.sunset ?? null} intensity={0.8} background />
        <KeyLight dir={sunDir(18, 120)} color="#ffd2a0" intensity={3.2} focus={new THREE.Vector3(0, 1.3, -0.5)} extent={2} />
        <mesh position={[0, 0.9, -0.9]} receiveShadow castShadow>
          <boxGeometry args={[2, 0.05, 1]} />
          <meshStandardMaterial color="#6b5a4a" roughness={0.6} />
        </mesh>
        <Hand {...R} pose={pose} visible skin={look.skin} sleeve={look.sleeve} />
        <Hand {...L} left pose={pose2} visible skin={look.skin} sleeve={look.sleeve} />
        <PostFX frame={frame} exposure={1} grade={GRADES.goldenCalm} focus={0.4} bokeh={1.5} blur={[0, 0]} />
        <FrameDriver frame={frame} fps={fps} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
