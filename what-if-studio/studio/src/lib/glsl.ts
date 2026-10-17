/** Shared deterministic GLSL helpers (no time-based randomness: every offset is passed in by frame). */
export const NOISE_GLSL = /* glsl */ `
float wiHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float wiNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wiHash(i + vec3(0, 0, 0)), wiHash(i + vec3(1, 0, 0)), f.x),
                 mix(wiHash(i + vec3(0, 1, 0)), wiHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(wiHash(i + vec3(0, 0, 1)), wiHash(i + vec3(1, 0, 1)), f.x),
                 mix(wiHash(i + vec3(0, 1, 1)), wiHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float wiFbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * wiNoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
// screen-space bump (same maths as three's bumpmap chunk, but height comes from a procedural function)
vec3 wiPerturbNormal(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
  vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
  vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN);
  vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;
