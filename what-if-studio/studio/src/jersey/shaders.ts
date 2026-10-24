export const QUAD_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export const ACCUM_FS = /* glsl */ `
uniform sampler2D tSrc; uniform float uWeight; varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb * uWeight, 1.0); }`;

export const BRIGHT_FS = /* glsl */ `
uniform sampler2D tSrc; uniform float uThreshold; uniform vec2 uTexel; varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * max(l - uThreshold, 0.0) / max(l, 1e-4), 1.0);
}`;

export const BLUR_FS = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270;
  c += (texture2D(tSrc, vUv + uDir * 1.3846).rgb + texture2D(tSrc, vUv - uDir * 1.3846).rgb) * 0.3162;
  c += (texture2D(tSrc, vUv + uDir * 3.2308).rgb + texture2D(tSrc, vUv - uDir * 3.2308).rgb) * 0.0703;
  gl_FragColor = vec4(c, 1.0);
}`;

export const COMPOSITE_FS = /* glsl */ `
uniform sampler2D tScene, tB1, tB2, tStreak;
uniform vec2 uRes; uniform float uFlash, uFade, uShockR, uShockA, uCA, uTime, uBloom, uExposure;
varying vec2 vUv;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 p = (vUv - 0.5) * asp;
  float d = length(p);
  float ring = exp(-pow((d - uShockR) / 0.04, 2.0)) * uShockA;
  vec2 uv = vUv - normalize(p + 1e-5) / asp * ring * 0.035;
  vec2 ca = (uv - 0.5) * uCA;
  vec3 col = vec3(texture2D(tScene, uv + ca).r, texture2D(tScene, uv).g, texture2D(tScene, uv - ca).b);
  vec3 bloom = texture2D(tB1, uv).rgb * 0.55 + texture2D(tB2, uv).rgb * 0.9 + texture2D(tStreak, uv).rgb * vec3(1.0, 0.62, 0.35) * 0.7;
  col += bloom * uBloom;
  col += vec3(1.0, 0.72, 0.45) * ring * 1.6;
  col = aces(col * uExposure);
  col *= mix(1.0, smoothstep(1.15, 0.25, d), 0.6);
  col = pow(col, vec3(1.0 / 2.2));
  col = mix(col, vec3(1.0, 0.97, 0.94), uFlash);
  col += (hash(vUv * uRes + fract(uTime) * 91.0) - 0.5) * 0.03;
  col *= 1.0 - uFade;
  gl_FragColor = vec4(col, 1.0);
}`;

export const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export const SKY_FS = /* glsl */ `
uniform float uGlow; varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float back = max(0.0, -d.z);
  vec3 col = mix(vec3(0.003, 0.003, 0.004), vec3(0.018, 0.016, 0.018), back * 0.8 + smoothstep(-0.2, 0.5, d.y) * 0.2);
  col += vec3(1.0, 0.32, 0.08) * pow(back, 14.0) * 0.12 * uGlow;
  col += vec3(0.9, 0.3, 0.1) * pow(max(0.0, -d.y), 3.0) * 0.02 * uGlow;
  gl_FragColor = vec4(col, 1.0);
}`;

export const FOG_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export const FOG_FS = /* glsl */ `
uniform float uTime, uSeed, uAmt; uniform vec3 uCol; varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec2 p = vUv * 3.0 + vec2(uSeed * 7.0, uSeed * 3.0);
  float f = fbm(p + vec2(uTime * 0.06, uTime * 0.025) + fbm(p * 0.7 - uTime * 0.04));
  float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x) * smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
  gl_FragColor = vec4(uCol * smoothstep(0.35, 0.9, f) * edge * uAmt, 1.0);
}`;

export const PARTICLE_VS = /* glsl */ `
attribute float aSize; attribute vec3 aColor; attribute float aAlpha;
uniform float uPx; varying vec3 vColor; varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uPx / -mv.z, 1.0, 48.0);
  vColor = aColor; vAlpha = aAlpha * smoothstep(0.25, 1.2, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

export const PARTICLE_FS = /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = exp(-d * d * 4.0) + 0.6 * exp(-d * d * 30.0);
  gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
}`;

export const BURST_FS = /* glsl */ `
uniform float uAmt, uTime; varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
  float core = exp(-r * r * 9.0);
  float halo = exp(-r * 4.0) * 0.35;
  float rays = pow(abs(sin(a * 9.0 + uTime * 0.6)) * abs(sin(a * 5.0 - uTime * 0.4)), 6.0) * exp(-r * 2.2);
  float streak = exp(-abs(p.y) * 60.0) * exp(-abs(p.x) * 2.5);
  vec3 col = vec3(1.0, 0.45, 0.15) * (halo + rays * 0.8) + vec3(1.0, 0.85, 0.7) * (core * 1.5 + streak * 1.2);
  gl_FragColor = vec4(col * uAmt * smoothstep(1.0, 0.7, r + 0.0 * streak), 1.0);
}`;
