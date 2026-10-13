import React, {useMemo} from 'react';
import * as THREE from 'three';
import {random} from 'remotion';
import type {Palette} from './palettes';

const vert = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const frag = `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunDir; uniform float uGlow;
varying vec3 vDir;
void main(){
  float h = clamp(vDir.y, -0.1, 1.0);
  float k = pow(max(h,0.0), 0.55);
  vec3 c = mix(uHorizon, uZenith, k);
  float s = max(dot(normalize(vDir), uSunDir), 0.0);
  float disc = smoothstep(0.9975, 0.9985, s);
  c += uSun * (pow(s, 24.0) * 0.55 * uGlow + pow(s, 400.0) * 0.6);
  c = mix(c, uSun * 1.8 + vec3(0.25), disc);
  c = mix(c, uHorizon, smoothstep(0.02, -0.08, vDir.y));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Gradient dome + sun disc + night stars (InstancedMesh, fixed layout from random()). */
export const Sky: React.FC<{palette: Palette; sunDir: THREE.Vector3; night?: number; glow?: number}> = ({palette, sunDir, night = 0, glow = 1}) => {
  const uniforms = useMemo(
    () => ({uZenith: {value: new THREE.Color()}, uHorizon: {value: new THREE.Color()}, uSun: {value: new THREE.Color()}, uSunDir: {value: new THREE.Vector3()}, uGlow: {value: 1}}),
    [],
  );
  uniforms.uZenith.value.copy(palette.zenith);
  uniforms.uHorizon.value.copy(palette.horizon);
  uniforms.uSun.value.copy(palette.sun);
  uniforms.uSunDir.value.copy(sunDir).normalize();
  uniforms.uGlow.value = glow;

  const starRef = React.useRef<THREE.InstancedMesh>(null);
  React.useLayoutEffect(() => {
    const m = starRef.current;
    if (!m) return;
    const d = new THREE.Object3D();
    for (let i = 0; i < 700; i++) {
      const th = random(`s-th-${i}`) * Math.PI * 2;
      const el = 0.12 + random(`s-el-${i}`) * 0.88;
      const r = 880;
      d.position.set(Math.cos(th) * Math.cos(el * 1.4) * r, Math.sin(el * 1.4) * r, Math.sin(th) * Math.cos(el * 1.4) * r);
      d.scale.setScalar(1.5 + random(`s-sc-${i}`) * 2.5);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <group>
      <mesh renderOrder={-10}>
        <sphereGeometry args={[900, 24, 16]} />
        <shaderMaterial vertexShader={vert} fragmentShader={frag} uniforms={uniforms} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      {night > 0.01 ? (
        <instancedMesh ref={starRef} args={[undefined, undefined, 700]} frustumCulled={false}>
          <octahedronGeometry args={[1, 0]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={night} fog={false} depthWrite={false} />
        </instancedMesh>
      ) : null}
    </group>
  );
};
