import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {random} from 'remotion';

export const dirFromElev = (elev: number, azim = 0.25) =>
  new THREE.Vector3(Math.sin(azim) * Math.cos(elev), Math.sin(elev), -Math.cos(azim) * Math.cos(elev)).normalize();

const vert = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const frag = `
varying vec3 vDir;
uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float glow;
void main(){
  float h = vDir.y;
  float up = clamp(h, 0.0, 1.0);
  up = floor(pow(up, 0.55) * 8.0) / 8.0;
  vec3 col = mix(horizon, zenith, up);
  if (h < 0.0) col = mix(horizon, horizon * 0.55, clamp(-h * 4.0, 0.0, 1.0));
  float s = max(dot(normalize(vDir), sunDir), 0.0);
  col += sunColor * pow(s, 10.0) * glow * 0.45;
  col = mix(col, sunColor, step(0.9982, s) * glow);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

type SkyProps = {
  zenith: THREE.Color; horizon: THREE.Color; sunColor: THREE.Color;
  sunDir: THREE.Vector3; sunGlow: number;
  moonDir: THREE.Vector3; moonScale: number; moonColor: THREE.Color;
  night: number; center: THREE.Vector3;
};

const STAR_N = 650;

export const Sky: React.FC<SkyProps> = (p) => {
  const uniforms = useMemo(() => ({
    zenith: {value: new THREE.Color()}, horizon: {value: new THREE.Color()},
    sunDir: {value: new THREE.Vector3()}, sunColor: {value: new THREE.Color()}, glow: {value: 1},
  }), []);
  uniforms.zenith.value.copy(p.zenith);
  uniforms.horizon.value.copy(p.horizon);
  uniforms.sunDir.value.copy(p.sunDir);
  uniforms.sunColor.value.copy(p.sunColor);
  uniforms.glow.value = p.sunGlow;

  const stars = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = stars.current!;
    const o = new THREE.Object3D();
    for (let i = 0; i < STAR_N; i++) {
      const a = random(`st-a-${i}`) * Math.PI * 2;
      const e = Math.asin(0.05 + random(`st-e-${i}`) * 0.95);
      o.position.set(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).multiplyScalar(820);
      o.scale.setScalar(1.6 + random(`st-s-${i}`) * 3.2);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, []);

  const moonPos = p.moonDir.clone().multiplyScalar(560);
  return (
    <group position={p.center}>
      <mesh renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[900, 32, 24]} />
        <shaderMaterial vertexShader={vert} fragmentShader={frag} uniforms={uniforms}
          side={THREE.BackSide} depthWrite={false} fog={false} />
      </mesh>
      <instancedMesh ref={stars} args={[undefined, undefined, STAR_N]} frustumCulled={false} renderOrder={-9}>
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={p.night} fog={false} depthWrite={false} />
      </instancedMesh>
      <group position={moonPos} scale={p.moonScale}>
        <mesh renderOrder={-8}>
          <icosahedronGeometry args={[40, 1]} />
          <meshBasicMaterial color={p.moonColor} fog={false} />
        </mesh>
        {[[-12, 10, 36, 7], [14, -8, 37, 9], [4, 18, 38, 5], [-18, -14, 34, 6]].map(([x, y, z, r], i) => (
          <mesh key={i} position={[x, y, z]} renderOrder={-7}>
            <icosahedronGeometry args={[r, 0]} />
            <meshBasicMaterial color={p.moonColor.clone().multiplyScalar(0.7)} fog={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
};
