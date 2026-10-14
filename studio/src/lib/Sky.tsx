import React, { useMemo } from "react";
import {
  BackSide, Color, IcosahedronGeometry, InstancedMesh, MeshBasicMaterial, Object3D, ShaderMaterial, SphereGeometry, Vector3,
} from "three";
import { hash } from "./noise";
import type { Mood } from "./palettes";

const DOME_R = 2400;

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Gradient dome: horizon → zenith, a soft sun glow and a hard toon sun disc.
const skyFrag = /* glsl */ `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uSunSize; uniform float uBelow;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, -1.0, 1.0);
  float t = pow(clamp(h, 0.0, 1.0), 0.55);
  vec3 col = mix(uHorizon, uTop, t);
  col = mix(col, uHorizon * 0.85, clamp(-h * 4.0, 0.0, 1.0) * uBelow);
  float d = dot(normalize(vDir), normalize(uSunDir));
  float glow = smoothstep(0.92, 1.0, d);
  col += uSunColor * glow * 0.35;
  float disc = step(1.0 - uSunSize, d);
  col = mix(col, uSunColor * 1.25, disc);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

type Props = {
  mood: Mood;
  center: [number, number, number];
  sunDir: Vector3; // normalized, points toward the sun
  moonDir?: Vector3;
  starCount?: number;
  sunSize?: number;
};

export const Sky: React.FC<Props> = ({ mood, center, sunDir, moonDir, starCount = 1400, sunSize = 0.0012 }) => {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new Color() },
          uHorizon: { value: new Color() },
          uSunDir: { value: new Vector3(0, 1, 0) },
          uSunColor: { value: new Color() },
          uSunSize: { value: sunSize },
          uBelow: { value: 1 },
        },
      }),
    [sunSize],
  );
  const geo = useMemo(() => new SphereGeometry(DOME_R, 48, 24), []);
  mat.uniforms.uTop.value.set(mood.skyTop);
  mat.uniforms.uHorizon.value.set(mood.skyHorizon);
  mat.uniforms.uSunDir.value.copy(sunDir);
  mat.uniforms.uSunColor.value.set(mood.sun);

  // Stars: one InstancedMesh, fixed positions on the upper dome, twinkle-free (deterministic).
  const stars = useMemo(() => {
    const g = new IcosahedronGeometry(1, 0);
    const m = new MeshBasicMaterial({ color: "#ffffff", transparent: true, fog: false, depthWrite: false });
    const mesh = new InstancedMesh(g, m, starCount);
    const o = new Object3D();
    for (let i = 0; i < starCount; i++) {
      const u = hash(i * 3.1 + 1);
      const v = hash(i * 7.7 + 2);
      const theta = u * Math.PI * 2;
      const y = 0.08 + v * 0.92;
      const r = Math.sqrt(1 - y * y);
      o.position.set(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(DOME_R * 0.92);
      o.scale.setScalar(1.6 + hash(i * 1.3) * 3.2);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    mesh.frustumCulled = false;
    return mesh;
  }, [starCount]);
  (stars.material as MeshBasicMaterial).opacity = mood.stars;
  stars.visible = mood.stars > 0.01;

  const moonPos = moonDir ? moonDir.clone().multiplyScalar(DOME_R * 0.85) : null;

  return (
    <group position={center}>
      <mesh geometry={geo} material={mat} renderOrder={-10} frustumCulled={false} />
      <primitive object={stars} />
      {moonPos ? (
        <mesh position={moonPos} renderOrder={-5}>
          <icosahedronGeometry args={[60, 1]} />
          <meshBasicMaterial color="#f4f1ff" fog={false} transparent opacity={mood.stars} />
        </mesh>
      ) : null}
    </group>
  );
};
