import React, {useLayoutEffect, useMemo, useState} from 'react';
import * as THREE from 'three';
import {useFrame, useThree} from '@react-three/fiber';
import {
  BlendFunction, BloomEffect, DepthOfFieldEffect, Effect, EffectAttribute, EffectComposer, EffectPass, RenderPass,
  SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode,
} from 'postprocessing';
import {N8AOPostPass} from 'n8ao';
import {continueRender, delayRender} from 'remotion';
import {Grade} from './grades';

/** Exposure (pre tone-mapping) — lets the "sensor" adapt with lag when light changes. */
class ExposureEffect extends Effect {
  constructor() {
    super('ExposureEffect', /* glsl */ `
uniform float uExposure;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = vec4(inputColor.rgb * uExposure, inputColor.a);
}`, {uniforms: new Map([['uExposure', new THREE.Uniform(1)]])});
  }
}

/**
 * Camera/lens + film emulation in one convolution pass:
 * barrel distortion (~24 mm), radial chromatic aberration, directional motion blur (whip pans / impacts),
 * cinema grade (white balance, lift/gamma/gain, split-tone, saturation, contrast), optical vignette,
 * fine film grain seeded by FRAME (deterministic).
 */
class LensGradeEffect extends Effect {
  constructor() {
    super('LensGradeEffect', /* glsl */ `
uniform float uFrame;
uniform float uDistort;
uniform float uCA;
uniform vec2 uBlur;
uniform float uTemp;
uniform float uTint;
uniform float uSat;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uGain;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uVignette;
uniform float uGrain;
uniform float uFade;
uniform vec3 uFadeColor;

float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

vec3 sampleLens(vec2 uv) {
  vec2 c = uv - 0.5;
  c.x *= resolution.x / resolution.y;
  float r2 = dot(c, c);
  vec2 dir = normalize(c + 1e-6);
  vec2 base = uv - (uv - 0.5) * (uDistort * r2);
  vec2 off = (uv - 0.5) * uCA * r2 * 2.0;
  vec3 col = vec3(0.0);
  float n = 0.0;
  // directional blur taps (no-op when uBlur ~ 0)
  for (int i = -6; i <= 6; i++) {
    float t = float(i) / 6.0;
    vec2 o = uBlur * t * texelSize;
    float w = 1.0 - abs(t) * 0.5;
    col.r += texture2D(inputBuffer, base + o - off).r * w;
    col.g += texture2D(inputBuffer, base + o).g * w;
    col.b += texture2D(inputBuffer, base + o + off).b * w;
    n += w;
    if (length(uBlur) < 0.5) { n = 1.0; break; }
  }
  return col / n;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = sampleLens(uv);
  // white balance (approximate Kelvin shift on R/B, tint on G)
  c *= vec3(1.0 + uTemp * 0.10, 1.0 - uTint * 0.06, 1.0 - uTemp * 0.12);
  // to a perceptual-ish space for grading
  vec3 g = pow(max(c, 0.0), vec3(1.0 / 2.2));
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g = mix(vec3(l), g, uSat);
  g = (g - 0.42) * uContrast + 0.42;
  g = g * uGain + uLift * (1.0 - g);
  float lw = smoothstep(0.0, 0.55, l), hw = smoothstep(0.45, 1.0, l);
  g *= mix(uShadowTint, vec3(1.0), lw);
  g *= mix(vec3(1.0), uHighTint, hw);
  // optical vignette (cos^4 falloff-ish)
  vec2 q = uv - 0.5; q.x *= resolution.x / resolution.y;
  float v = 1.0 - uVignette * smoothstep(0.18, 0.95, dot(q, q) * 2.4);
  g *= v;
  // film grain, stronger in mids
  float gr = h12(uv * resolution + vec2(uFrame * 37.0, uFrame * 91.0)) + h12(uv * resolution * 0.5 + uFrame * 13.0) - 1.0;
  g += gr * uGrain * (0.35 + 0.65 * (1.0 - abs(l - 0.5) * 2.0));
  g = mix(g, uFadeColor, uFade);
  outputColor = vec4(pow(max(g, 0.0), vec3(2.2)), 1.0);
}`, {
      attributes: EffectAttribute.CONVOLUTION,
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uFrame', new THREE.Uniform(0)], ['uDistort', new THREE.Uniform(0.04)], ['uCA', new THREE.Uniform(0.004)],
        ['uBlur', new THREE.Uniform(new THREE.Vector2())], ['uTemp', new THREE.Uniform(0)], ['uTint', new THREE.Uniform(0)],
        ['uSat', new THREE.Uniform(1)], ['uContrast', new THREE.Uniform(1)], ['uLift', new THREE.Uniform(new THREE.Vector3())],
        ['uGain', new THREE.Uniform(new THREE.Vector3(1, 1, 1))], ['uShadowTint', new THREE.Uniform(new THREE.Vector3(1, 1, 1))],
        ['uHighTint', new THREE.Uniform(new THREE.Vector3(1, 1, 1))], ['uVignette', new THREE.Uniform(0.3)], ['uGrain', new THREE.Uniform(0.03)],
        ['uFade', new THREE.Uniform(0)], ['uFadeColor', new THREE.Uniform(new THREE.Vector3(1, 1, 1))],
      ]),
    });
  }
}

export type PostFXProps = {
  frame: number;
  exposure: number;
  grade: Grade;
  /** world-space focus distance (m) */
  focus: number;
  /** world-space in-focus range (m) */
  focusRange?: number;
  /** bokeh strength 0..~6 */
  bokeh: number;
  /** motion-blur vector in pixels (screen space) */
  blur: [number, number];
  ca?: number;
  distort?: number;
  aoIntensity?: number;
  aoRadius?: number;
  bloom?: number;
  fade?: number;
  fadeColor?: THREE.Color;
  /** quality switches (render-time budget) */
  quality?: {msaa?: number; ao?: boolean; aoHalf?: boolean; dof?: boolean; smaa?: boolean};
};

/**
 * Hand-built postprocessing chain (built once — no per-frame pass/shader rebuild):
 * Render → N8AO → DoF → [exposure + bloom + AgX tone mapping] → lens/grade/grain → SMAA.
 * Rendering happens in useFrame(priority 1) which R3F calls from advance(); nothing animates on its own.
 */
export const PostFX: React.FC<PostFXProps> = (p) => {
  const {gl, scene, camera, size} = useThree();
  const [smaaHandle] = useState(() => delayRender('SMAA lookup textures'));
  const Q = {msaa: 4, ao: true, aoHalf: true, dof: true, smaa: true, ...(p.quality ?? {})};
  const fx = useMemo(() => {
    const composer = new EffectComposer(gl, {multisampling: Q.msaa, frameBufferType: THREE.HalfFloatType});
    composer.addPass(new RenderPass(scene, camera));
    const ao = new N8AOPostPass(scene, camera, size.width, size.height);
    ao.configuration.aoSamples = 12;
    ao.configuration.denoiseSamples = 6;
    ao.configuration.denoiseRadius = 10;
    ao.configuration.screenSpaceRadius = false;
    ao.configuration.halfRes = Q.aoHalf;
    ao.configuration.depthAwareUpsampling = true;
    if (Q.ao) composer.addPass(ao);
    const dof = new DepthOfFieldEffect(camera, {worldFocusDistance: 2, worldFocusRange: 2, bokehScale: 2, resolutionScale: 0.5});
    if (Q.dof) composer.addPass(new EffectPass(camera, dof));
    const exp = new ExposureEffect();
    const bloom = new BloomEffect({mipmapBlur: true, luminanceThreshold: 1.0, luminanceSmoothing: 0.35, intensity: 0.6, radius: 0.72});
    const tm = new ToneMappingEffect({mode: ToneMappingMode.AGX});
    composer.addPass(new EffectPass(camera, exp, bloom, tm));
    const lens = new LensGradeEffect();
    composer.addPass(new EffectPass(camera, lens));
    const smaa = new SMAAEffect({preset: SMAAPreset.HIGH});
    (smaa as unknown as THREE.EventDispatcher<{load: object}>).addEventListener('load', () => continueRender(smaaHandle));
    composer.addPass(new EffectPass(camera, smaa));
    composer.setSize(size.width, size.height);
    return {composer, ao, dof, exp, bloom, lens};
  }, []);
  useLayoutEffect(() => {
    gl.toneMapping = THREE.NoToneMapping;
    const {ao, dof, exp, bloom, lens} = fx;
    ao.configuration.intensity = p.aoIntensity ?? 2.2;
    ao.configuration.aoRadius = p.aoRadius ?? 0.8;
    ao.configuration.distanceFalloff = 0.5;
    const coc = dof.cocMaterial as unknown as {worldFocusDistance: number; worldFocusRange: number};
    coc.worldFocusDistance = p.focus;
    coc.worldFocusRange = p.focusRange ?? Math.max(0.35, p.focus * 0.8);
    dof.bokehScale = p.bokeh;
    exp.uniforms.get('uExposure')!.value = p.exposure;
    bloom.intensity = p.bloom ?? 0.6;
    const u = lens.uniforms;
    const g = p.grade;
    u.get('uFrame')!.value = p.frame % 997;
    u.get('uDistort')!.value = p.distort ?? 0.035;
    u.get('uCA')!.value = p.ca ?? 0.004;
    (u.get('uBlur')!.value as THREE.Vector2).set(p.blur[0], p.blur[1]);
    u.get('uTemp')!.value = g.temp;
    u.get('uTint')!.value = g.tint;
    u.get('uSat')!.value = g.sat;
    u.get('uContrast')!.value = g.contrast;
    (u.get('uLift')!.value as THREE.Vector3).set(...g.lift);
    (u.get('uGain')!.value as THREE.Vector3).set(...g.gain);
    (u.get('uShadowTint')!.value as THREE.Vector3).set(...g.shadows);
    (u.get('uHighTint')!.value as THREE.Vector3).set(...g.highlights);
    u.get('uVignette')!.value = g.vignette;
    u.get('uGrain')!.value = g.grain;
    u.get('uFade')!.value = p.fade ?? 0;
    const fc = p.fadeColor ?? new THREE.Color(1, 1, 1);
    (u.get('uFadeColor')!.value as THREE.Vector3).set(fc.r, fc.g, fc.b);
  });
  useFrame(() => {
    fx.composer.render(1 / 30);
  }, 1);
  return null;
};
