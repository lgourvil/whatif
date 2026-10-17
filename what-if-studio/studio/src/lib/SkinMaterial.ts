import * as THREE from 'three';
import {NOISE_GLSL} from './glsl';

/**
 * Physical skin for procedural (SDF-built) hands.
 * Needs per-vertex attributes built with the mesh:
 *   aSkin = (redness, dorsal 0..1, jointU (signed metres to nearest finger joint), thinness 0..1)
 *   aNail = (nail-local across -1..1, nail-local along 0..1, mask 0..1)
 * Everything is computed in REST space (pre-skinning `position`), so pores/creases stick to the skin.
 * Subsurface look: per-channel wrapped diffuse (red light bleeds past the terminator)
 * + thin-edge back-light translucency. No transmission pass (too costly and wrong for skin).
 */
export type SkinOpts = {tone?: THREE.ColorRepresentation; sss?: number; bump?: number};

export const makeSkinMaterial = ({tone = '#c4917a', sss = 1, bump = 1}: SkinOpts = {}) => {
  const m = new THREE.MeshPhysicalMaterial({
    color: tone,
    roughness: 0.48,
    metalness: 0,
    sheen: 0.35,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color('#ffb59a'),
    clearcoat: 0.9,
    clearcoatRoughness: 0.18,
    specularIntensity: 0.55,
  });
  const uniforms = {uSSS: {value: sss}, uBump: {value: bump}};
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aSkin;
attribute vec3 aNail;
varying vec3 vRest;
varying vec4 vSkin;
varying vec3 vNail;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vRest = position; vSkin = aSkin; vNail = aNail;`);

    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uSSS;
uniform float uBump;
varying vec3 vRest;
varying vec4 vSkin;
varying vec3 vNail;
${NOISE_GLSL}
float nailMask() {
  vec2 q = vec2(vNail.x, (vNail.y - 0.5) * 2.0);
  float r = length(vec2(q.x * 1.05, max(abs(q.y) - 0.25, 0.0) * 1.35));
  return vNail.z * (1.0 - smoothstep(0.82, 0.98, r));
}
float skinHeight() {
  float pores = wiNoise(vRest * 2300.0) * 0.6 + wiNoise(vRest * 760.0) * 0.4;
  float h = pores * 0.5;
  // dorsal knuckle wrinkles: bands across the finger around each joint
  float ju = vSkin.z;
  float wr = (0.5 + 0.5 * sin(ju * 2600.0 + wiNoise(vRest * 300.0) * 3.0)) * exp(-pow(ju / 0.0045, 2.0));
  h -= wr * vSkin.y * 0.7;
  // palmar flexion creases: two sharp grooves at the joint
  float cr = exp(-pow((abs(ju) - 0.0012) / 0.0005, 2.0));
  h -= cr * (1.0 - vSkin.y) * 2.4;
  // fine cross-hatched skin texture on the back of the hand
  vec3 r = vRest * vec3(1400.0, 1400.0, 400.0);
  h += (wiNoise(r) - 0.5) * vSkin.y * 0.6;
  return h * (1.0 - nailMask() * 0.9);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float nm = nailMask();
  float mott = wiFbm(vRest * 160.0) - 0.5;
  vec3 base = diffuseColor.rgb * (1.0 + mott * 0.16);
  vec3 redTone = diffuseColor.rgb * vec3(1.08, 0.72, 0.68);
  base = mix(base, redTone, clamp(vSkin.x, 0.0, 1.0) * 0.55);
  // palm: lighter, pinker
  base = mix(base, diffuseColor.rgb * vec3(1.1, 0.93, 0.88), (1.0 - vSkin.y) * 0.5);
  // veins on the back of the hand / wrist
  float vn = wiNoise(vRest * vec3(70.0, 70.0, 22.0) + 3.1);
  float vein = smoothstep(0.035, 0.0, abs(vn - 0.5)) * vSkin.y * smoothstep(-0.06, -0.02, vRest.z) * smoothstep(0.08, 0.0, vRest.z);
  base = mix(base, diffuseColor.rgb * vec3(0.78, 0.84, 0.95), vein * 0.22);
  // nail: pink bed, pale lunula, white free edge, slightly darker cuticle ring
  vec3 nailC = diffuseColor.rgb * vec3(1.12, 0.86, 0.84);
  nailC = mix(nailC, vec3(0.93, 0.86, 0.82), smoothstep(0.82, 0.95, vNail.y));
  nailC = mix(nailC, diffuseColor.rgb * vec3(1.18, 1.05, 1.0), (1.0 - smoothstep(0.08, 0.22, vNail.y)) * 0.6);
  float cut = vNail.z * (smoothstep(0.75, 0.9, length(vec2(vNail.x, (vNail.y - 0.5) * 2.0))) - smoothstep(0.95, 1.1, length(vec2(vNail.x, (vNail.y - 0.5) * 2.0))));
  base *= 1.0 - cut * 0.12;
  diffuseColor.rgb = mix(base, nailC, nm);
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(0.56, 0.42, vSkin.y) + (wiNoise(vRest * 420.0) - 0.5) * 0.12;
roughnessFactor = mix(roughnessFactor, 0.3, nailMask());`)
      .replace('#include <normal_fragment_maps>', `
{
  float h = skinHeight() * 0.0002 * uBump;
  normal = wiPerturbNormal(-vViewPosition, normal, vec2(dFdx(h), dFdy(h)), faceDirection);
}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
material.clearcoat *= nailMask();`)
      .replace('reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );', `{
  float ndl = dot( geometryNormal, directLight.direction );
  vec3 wrapC = vec3(0.42, 0.16, 0.10) * uSSS;
  vec3 wrapped = clamp((vec3(ndl) + wrapC) / (1.0 + wrapC), 0.0, 1.0);
  // thin edges glow red when the light is behind them
  float back = pow(clamp(dot(geometryViewDir, -directLight.direction), 0.0, 1.0), 3.0) * vSkin.w * uSSS;
  vec3 transl = back * vec3(0.9, 0.22, 0.10) * 0.55 * (1.0 - clamp(ndl, 0.0, 1.0));
  reflectedLight.directDiffuse += (wrapped + transl) * directLight.color * BRDF_Lambert( material.diffuseColor );
}`);
  };
  m.customProgramCacheKey = () => 'wi-skin-v1';
  return m;
};

/** Woven fabric (jacket sleeve, clothing) with procedural weave bump; uses mesh UVs. */
export const makeFabricMaterial = (color: THREE.ColorRepresentation, opts: {weave?: number; rough?: number; sheen?: number} = {}) => {
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness: opts.rough ?? 0.86, metalness: 0,
    sheen: opts.sheen ?? 0.8, sheenRoughness: 0.7, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35),
  });
  const weave = opts.weave ?? 900;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObj;\n${NOISE_GLSL}
float fabH() {
  vec3 p = vObj * ${weave.toFixed(1)};
  float a = sin(p.x + p.y * 0.5 + sin(p.z) * 0.5);
  float b = sin(p.z * 1.0 - p.y * 0.5 + sin(p.x) * 0.5);
  return (a * b) * 0.5 + wiNoise(vObj * ${(weave * 0.06).toFixed(1)}) * 1.5;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= 0.9 + 0.2 * wiFbm(vObj * ${(weave * 0.012).toFixed(2)});`)
      .replace('#include <normal_fragment_maps>', `{
  float h = fabH() * 0.00025;
  normal = wiPerturbNormal(-vViewPosition, normal, vec2(dFdx(h), dFdy(h)), faceDirection);
}`);
  };
  m.customProgramCacheKey = () => `wi-fabric-${weave}`;
  return m;
};
