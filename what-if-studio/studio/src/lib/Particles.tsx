import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {random} from 'remotion';

type ParticlesProps = {
  frame: number;
  seed: string;
  count: number;
  /** 0..1 share of instances visible */
  intensity: number;
  center: THREE.Vector3;
  box: [number, number, number];
  /** velocity in units per frame */
  velocity: [number, number, number];
  size: number;
  color: THREE.ColorRepresentation;
  wobble?: number;
  opacity?: number;
  emissive?: boolean;
};

/** Deterministic closed-form particles: pos = wrap(seed + v*frame), no accumulated simulation. */
export const Particles: React.FC<ParticlesProps> = ({
  frame, seed, count, intensity, center, box, velocity, size, color, wobble = 0, opacity = 1,
}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const rnd = useMemo(() => {
    const a = new Float32Array(count * 5);
    for (let i = 0; i < count; i++) for (let k = 0; k < 5; k++) a[i * 5 + k] = random(`${seed}-${i}-${k}`);
    return a;
  }, [count, seed]);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const m = ref.current!;
    const vis = Math.floor(count * Math.min(1, Math.max(0, intensity)));
    for (let i = 0; i < count; i++) {
      if (i >= vis) {
        dummy.scale.setScalar(0);
      } else {
        const r = i * 5;
        const w = (v: number, s: number) => ((v % s) + s) % s;
        const x = w(rnd[r] * box[0] + velocity[0] * frame, box[0]) - box[0] / 2;
        const y = w(rnd[r + 1] * box[1] + velocity[1] * frame, box[1]) - box[1] / 2;
        const z = w(rnd[r + 2] * box[2] + velocity[2] * frame, box[2]) - box[2] / 2;
        const ph = rnd[r + 3] * 6.283;
        dummy.position.set(
          center.x + x + Math.sin(frame * 0.05 + ph) * wobble,
          center.y + y + Math.cos(frame * 0.043 + ph) * wobble,
          center.z + z,
        );
        dummy.scale.setScalar(size * (0.5 + rnd[r + 4]));
        dummy.rotation.set(ph, ph * 2, 0);
      }
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [frame, intensity, center.x, center.y, center.z]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <octahedronGeometry args={[1, 0]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </instancedMesh>
  );
};

/* ------------------------------------------------------------------------------------------------
 * Camera-facing volumetric billboards (smoke, fire, gas), instanced, closed-form per frame.
 * The episode supplies one entry per instance per frame; nothing is simulated or accumulated.
 * ---------------------------------------------------------------------------------------------- */

export type Puff = {p: THREE.Vector3; size: number; alpha: number; rot: number; seed: number; tint?: THREE.Color; stretch?: number};
export type PuffLight = {pos: THREE.Vector3; color: THREE.Color; intensity: number};

const PUFF_VERT = /* glsl */ `
attribute vec3 iPos; attribute vec4 iData; attribute vec3 iTint;
varying vec2 vUv; varying vec4 vData; varying vec3 vTint; varying vec3 vWorld;
void main() {
  vUv = uv; vData = iData; vTint = iTint;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float c = cos(iData.z), s = sin(iData.z);
  vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
  float stretch = iData.w > 0.0 ? 1.0 : 1.0;
  vec3 w = iPos + (right * q.x + up * q.y * stretch) * iData.x;
  vWorld = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const PUFF_NOISE = /* glsl */ `
float ph(vec3 p){ p = fract(p * 0.3183099 + vec3(0.71,0.113,0.419)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float pn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(ph(i),ph(i+vec3(1,0,0)),f.x),mix(ph(i+vec3(0,1,0)),ph(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(ph(i+vec3(0,0,1)),ph(i+vec3(1,0,1)),f.x),mix(ph(i+vec3(0,1,1)),ph(i+vec3(1,1,1)),f.x),f.y),f.z); }
float pf(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<3;i++){ s+=a*pn(p); p=p*2.02+11.3; a*=0.5;} return s * 1.15; }`;

const SMOKE_FRAG = /* glsl */ `
uniform vec3 uAmbient; uniform vec3 uSunColor; uniform vec3 uSunDir;
uniform vec3 uLPos[4]; uniform vec3 uLCol[4];
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uTime;
varying vec2 vUv; varying vec4 vData; varying vec3 vTint; varying vec3 vWorld;
${PUFF_NOISE}
void main() {
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float n = pf(vec3(vUv * 2.2 + vData.w * 7.0, vData.w * 13.0 + uTime * 0.04));
  float n2 = pf(vec3(vUv * 5.5 - vData.w * 3.0, uTime * 0.07 + vData.w));
  // billowy edge: radial falloff eroded by two octaves of noise
  float d = smoothstep(1.0, 0.15, r + (n - 0.5) * 1.1 + (n2 - 0.5) * 0.5) * (0.55 + 0.45 * n);
  float a = d * vData.y;
  a *= smoothstep(-0.2, 0.6, vWorld.y); // soft against the ground
  a *= smoothstep(0.6, 2.5, length(vWorld - cameraPosition)); // never a flat card in front of the lens
  if (a < 0.003) discard;
  // fake self-shadowing: lit side toward the sun / fires, darker core
  vec3 nrm = normalize(vec3(c * 2.0, 0.6));
  float sunL = clamp(0.55 + 0.45 * dot(normalize(vec3(c.x, c.y, 0.3)), normalize(vec3(0.0, uSunDir.y, 0.5))), 0.0, 1.0);
  vec3 col = uAmbient + uSunColor * sunL * 0.6;
  for (int i = 0; i < 4; i++) {
    vec3 L = uLPos[i] - vWorld;
    float dd = dot(L, L);
    col += uLCol[i] / (1.0 + dd * 0.06) * (0.6 + 0.4 * (1.0 - d));
  }
  col *= vTint * (0.75 + 0.35 * n);
  float dist = length(vWorld - cameraPosition);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, fog);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

const FIRE_FRAG = /* glsl */ `
uniform float uTime; uniform float uHeat;
uniform vec3 uFogColor; uniform float uFogDensity;
varying vec2 vUv; varying vec4 vData; varying vec3 vTint; varying vec3 vWorld;
${PUFF_NOISE}
void main() {
  vec2 c = vUv - vec2(0.5, 0.3);
  float n = pf(vec3(vUv.x * 3.0, vUv.y * 2.2 - uTime * 2.2, vData.y * 7.0 + uTime * 0.6));
  float shape = smoothstep(0.55, 0.0, length(vec2(c.x * 1.6, max(c.y, 0.0) * 0.75 + min(c.y, 0.0) * 2.2)) + (n - 0.5) * 0.55 - vUv.y * 0.18);
  float t = shape * vData.y;
  if (t < 0.01) discard;
  vec3 col = mix(vec3(1.0, 0.18, 0.02), vec3(1.0, 0.55, 0.12), smoothstep(0.2, 0.6, t));
  col = mix(col, vec3(1.0, 0.92, 0.7), smoothstep(0.65, 1.0, t));
  col *= vTint * uHeat * (0.6 + t * 2.4);
  float dist = length(vWorld - cameraPosition);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  gl_FragColor = vec4(col * (1.0 - fog * 0.7), t);
}`;

type PuffProps = {
  puffs: Puff[];
  max: number;
  kind: 'smoke' | 'fire';
  frame: number;
  fogColor: THREE.Color;
  fogDensity: number;
  ambient?: THREE.Color;
  sunColor?: THREE.Color;
  sunDir?: THREE.Vector3;
  lights?: PuffLight[];
  heat?: number;
};

export const Puffs: React.FC<PuffProps> = ({puffs, max, kind, frame, fogColor, fogDensity, ambient, sunColor, sunDir, lights = [], heat = 6}) => {
  const {geo, mat} = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3));
    g.setAttribute('iData', new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4));
    g.setAttribute('iTint', new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3));
    g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({
      vertexShader: PUFF_VERT,
      fragmentShader: kind === 'smoke' ? SMOKE_FRAG : FIRE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uAmbient: {value: new THREE.Color()}, uSunColor: {value: new THREE.Color()}, uSunDir: {value: new THREE.Vector3(0, 1, 0)},
        uLPos: {value: [0, 1, 2, 3].map(() => new THREE.Vector3())}, uLCol: {value: [0, 1, 2, 3].map(() => new THREE.Color(0, 0, 0))},
        uFogColor: {value: new THREE.Color()}, uFogDensity: {value: 0}, uTime: {value: 0}, uHeat: {value: 6},
      },
    });
    return {geo: g, mat: m};
  }, [max, kind]);

  useLayoutEffect(() => {
    const P = geo.attributes.iPos as THREE.InstancedBufferAttribute;
    const D = geo.attributes.iData as THREE.InstancedBufferAttribute;
    const T = geo.attributes.iTint as THREE.InstancedBufferAttribute;
    const n = Math.min(max, puffs.length);
    for (let i = 0; i < n; i++) {
      const q = puffs[i];
      P.setXYZ(i, q.p.x, q.p.y, q.p.z);
      D.setXYZW(i, q.size, q.alpha, q.rot, q.seed);
      const t = q.tint ?? new THREE.Color(1, 1, 1);
      T.setXYZ(i, t.r, t.g, t.b);
    }
    geo.instanceCount = n;
    P.needsUpdate = D.needsUpdate = T.needsUpdate = true;
    const u = mat.uniforms;
    u.uTime.value = frame / 30;
    u.uFogColor.value.copy(fogColor);
    u.uFogDensity.value = fogDensity;
    u.uHeat.value = heat;
    if (ambient) u.uAmbient.value.copy(ambient);
    if (sunColor) u.uSunColor.value.copy(sunColor);
    if (sunDir) u.uSunDir.value.copy(sunDir);
    for (let i = 0; i < 4; i++) {
      const l = lights[i];
      u.uLPos.value[i].copy(l ? l.pos : new THREE.Vector3());
      u.uLCol.value[i].copy(l ? l.color.clone().multiplyScalar(l.intensity) : new THREE.Color(0, 0, 0));
    }
  });
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={kind === 'fire' ? 3 : 2} />;
};

/** Glowing embers / sparks: tiny HDR emissive spheres, closed-form positions supplied by the caller. */
export const Embers: React.FC<{pts: {p: THREE.Vector3; s: number}[]; max: number; color?: THREE.Color}> = ({pts, max, color}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current!;
    const o = new THREE.Object3D();
    for (let i = 0; i < max; i++) {
      const e = pts[i];
      if (e) { o.position.copy(e.p); o.scale.setScalar(e.s); } else o.scale.setScalar(0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, max]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 4]} />
      <meshBasicMaterial color={color ?? new THREE.Color(9, 3.2, 0.8)} toneMapped />
    </instancedMesh>
  );
};
