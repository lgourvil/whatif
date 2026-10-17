import React, {useLayoutEffect, useMemo} from 'react';
import * as THREE from 'three';
import {SDF, polygonize, roundBox, smax, smin} from './sdf';
import {NOISE_GLSL} from './glsl';
import {texSet} from './PbrMaterials';

/**
 * Generic modern European hatchback (original design, no brand), built from an SDF:
 * one seamless body shell with regions (paint / glass / trim / head / tail lights / filler flap),
 * plus lathed tyres and alloy rims. Length ≈ 4.05 m, width ≈ 1.75 m. Front toward -Z, origin on the ground.
 */

let CAR: THREE.BufferGeometry | null = null;

export const getCarGeo = () => {
  if (CAR) return CAR;
  const lower = roundBox([0, 0.6, 0], [0.87, 0.3, 2.02], 0.17);
  const cabin: SDF = (x, y, z) => {
    // windscreen rake (front) and tailgate slope (rear) by shearing z with height
    const zz = z < 0.2 ? z + (y - 0.86) * 0.95 : z - (y - 0.86) * 0.32;
    return roundBox([0, 1.1, 0.42], [0.76 - Math.max(0, y - 0.9) * 0.22, 0.27, 1.1], 0.24)(x, y, zz);
  };
  const hood: SDF = (x, y, z) => roundBox([0, 0.82, -1.25], [0.84, 0.08, 0.8], 0.12)(x, y + (z + 1.25) * 0.06, z);
  const arch = (zc: number): SDF => (x, y, z) => Math.hypot(y - 0.33, z - zc) - 0.39;
  const field: SDF = (x, y, z) => {
    let d = smin(lower(x, y, z), cabin(x, y, z), 0.14);
    d = smin(d, hood(x, y, z), 0.1);
    d = smax(d, -arch(-1.3)(x, y, z), 0.04);
    d = smax(d, -arch(1.3)(x, y, z), 0.04);
    d = smax(d, 0.1 - y, 0.02);
    return d;
  };
  const g = polygonize(field, {min: [-0.95, 0.05, -2.15], max: [0.95, 1.45, 2.15], step: 0.022});
  const p = g.attributes.position as THREE.BufferAttribute;
  const reg = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let r = 0; // paint
    const ax = Math.abs(x);
    // greenhouse: band between belt line and roof, minus pillars
    const belt = 0.93 + (z < -0.5 ? (-0.5 - z) * 0.05 : 0);
    if (y > belt && y < 1.31) {
      const zPillarA = -0.62 + (y - 0.93) * 0.95; // A pillar follows the rake
      const nearA = Math.abs(z - zPillarA) < 0.07 && ax > 0.55;
      const nearB = Math.abs(z - 0.3) < 0.06 && ax > 0.6;
      const nearC = z > 1.3 && ax > 0.55 && ax < 0.7;
      r = nearA || nearB || nearC ? 2 : 1;
      if (ax > 0.64 && (y < belt + 0.025 || y > 1.29)) r = 2;
    }
    if (y < 0.36 || (Math.abs(z) > 1.95 && y < 0.5)) r = 2; // bumpers / sills
    if (z < -1.9 && y > 0.6 && y < 0.76 && ax > 0.42 && ax < 0.8) r = 3; // headlights
    if (z > 1.85 && y > 0.82 && y < 0.98 && ax > 0.5 && ax < 0.82) r = 4; // tail lights
    if (x < -0.8 && y > 0.78 && y < 0.92 && z > 1.0 && z < 1.17) r = 5; // fuel filler flap (car's left side, -X)
    reg[i] = r;
  }
  g.setAttribute('aRegion', new THREE.Float32BufferAttribute(reg, 1));
  g.computeBoundingSphere();
  CAR = g;
  return g;
};

export type CarLook = {paint: THREE.ColorRepresentation; burnt?: number; lights?: number; dirt?: number};

export const makeCarMaterial = (look: CarLook) => {
  const ts = texSet('paint');
  const m = new THREE.MeshPhysicalMaterial({color: '#ffffff', roughness: 0.35, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.08, roughnessMap: ts.roughnessMap});
  const u = {uPaint: {value: new THREE.Color(look.paint)}, uBurnt: {value: look.burnt ?? 0}, uLights: {value: look.lights ?? 0}, uDirt: {value: look.dirt ?? 0.3}};
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRegion;\nvarying float vReg;\nvarying vec3 vCar;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvReg = aRegion; vCar = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uPaint; uniform float uBurnt; uniform float uLights; uniform float uDirt;
varying float vReg; varying vec3 vCar;
${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 c = uPaint;
  float r = vReg;
  if (r > 0.5 && r < 1.5) c = vec3(0.012, 0.014, 0.016);
  else if (r > 1.5 && r < 2.5) c = vec3(0.025);
  else if (r > 2.5 && r < 3.5) c = vec3(0.6, 0.62, 0.65);
  else if (r > 3.5 && r < 4.5) c = vec3(0.25, 0.01, 0.01);
  else if (r > 4.5) c = uPaint * 0.82;
  // road grime toward the sills, dust on horizontal panels
  float dirt = smoothstep(0.75, 0.25, vCar.y) * (0.5 + 0.5 * wiFbm(vCar * 6.0)) * uDirt;
  c = mix(c, vec3(0.18, 0.16, 0.13), dirt * 0.7);
  // burnt: soot, blistered primer, rust
  float soot = uBurnt * (0.7 + 0.3 * wiFbm(vCar * 4.0));
  c = mix(c, mix(vec3(0.02), vec3(0.22, 0.09, 0.04), wiFbm(vCar * 9.0)), soot);
  diffuseColor.rgb = c;
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
{
  float r = vReg;
  if (r > 0.5 && r < 1.5) roughnessFactor = 0.04;
  else if (r > 1.5 && r < 2.5) roughnessFactor = 0.6;
  else if (r > 2.5 && r < 4.5) roughnessFactor = 0.12;
  roughnessFactor = mix(roughnessFactor, 0.95, uBurnt);
}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
material.clearcoat *= (vReg < 0.5 || vReg > 4.5) ? (1.0 - uBurnt) : (vReg < 1.5 ? 0.6 : 0.0);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (vReg > 2.5 && vReg < 3.5) totalEmissiveRadiance += vec3(8.0, 7.6, 7.0) * uLights;
if (vReg > 3.5 && vReg < 4.5) totalEmissiveRadiance += vec3(5.0, 0.15, 0.05) * uLights;`);
  };
  m.customProgramCacheKey = () => 'wi-car-v1';
  return {material: m, uniforms: u};
};

const tyreGeo = (() => {
  let g: THREE.BufferGeometry | null = null;
  return () => {
    if (g) return g;
    const pts: THREE.Vector2[] = [];
    const R = 0.315, w = 0.1, side = 0.055;
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI;
      pts.push(new THREE.Vector2(R - side + Math.sin(a) * side, -w + (1 - Math.cos(a)) * w));
    }
    g = new THREE.LatheGeometry(pts, 48);
    g.rotateZ(Math.PI / 2);
    return g;
  };
})();

const WHEELS: [number, number][] = [[-0.76, -1.3], [0.76, -1.3], [-0.76, 1.3], [0.76, 1.3]];

export const Car: React.FC<{position: THREE.Vector3 | [number, number, number]; yaw: number; look: CarLook; scale?: [number, number, number]; wheelSpin?: number}> = ({position, yaw, look, scale = [1, 1, 1], wheelSpin = 0}) => {
  const {material, uniforms} = useMemo(() => makeCarMaterial(look), []);
  const rubber = useMemo(() => {
    const t = texSet('rubber');
    return new THREE.MeshStandardMaterial({color: '#ffffff', map: t.map, normalMap: t.normalMap, roughness: 0.9});
  }, []);
  const rim = useMemo(() => new THREE.MeshStandardMaterial({color: '#9a9ea3', metalness: 1, roughness: 0.28}), []);
  useLayoutEffect(() => {
    uniforms.uPaint.value.set(look.paint);
    uniforms.uBurnt.value = look.burnt ?? 0;
    uniforms.uLights.value = look.lights ?? 0;
    uniforms.uDirt.value = look.dirt ?? 0.3;
  });
  const p = Array.isArray(position) ? position : position.toArray();
  return (
    <group position={p as [number, number, number]} rotation={[0, yaw, 0]} scale={scale}>
      <mesh geometry={getCarGeo()} material={material} castShadow receiveShadow />
      {WHEELS.map(([x, z], i) => (
        <group key={i} position={[x, 0.315, z]} rotation={[wheelSpin, 0, 0]}>
          <mesh geometry={tyreGeo()} material={rubber} castShadow receiveShadow />
          <mesh rotation={[0, 0, Math.PI / 2]} position={[x > 0 ? 0.06 : -0.06, 0, 0]} material={rim} castShadow>
            <cylinderGeometry args={[0.2, 0.2, 0.08, 24]} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[x > 0 ? 0.105 : -0.105, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.07, 0.02, 12]} />
            <meshStandardMaterial color="#2a2c30" metalness={0.8} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
};
