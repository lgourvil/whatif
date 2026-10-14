import React, { useMemo } from "react";
import { AdditiveBlending, BackSide, Color, Euler, Float32BufferAttribute, IcosahedronGeometry, Quaternion, ShaderMaterial, Vector3, type BufferAttribute } from "three";
import { WavingFlag } from "../../lib/Flag";
import { keyed, noise3 } from "../../lib/noise";
import { OUTLINES, outlineMaterial, toon } from "../../lib/ToonMaterial";
import { bannerTexture } from "../../lib/textures";
import { PALETTES } from "../../lib/palettes";
import { GLOBE_R, LOOP } from "./world";

const PAL = PALETTES.guadeloupeEmpire;
const D = Math.PI / 180;

export const llToVec = (lat: number, lon: number) =>
  new Vector3(Math.cos(lat * D) * Math.sin(lon * D), Math.sin(lat * D), Math.cos(lat * D) * Math.cos(lon * D));

// Rough, stylised continents: unions of lat/lon blobs (+ noise on the coast).
const BLOBS: [number, number, number][] = [
  [52, -105, 20], [42, -95, 16], [62, -125, 13], [33, -84, 8], [62, -80, 12], [48, -70, 8], [72, -40, 9], [68, -100, 12], [28, -103, 9],
  [19, -98, 6], [13, -87, 4], [9, -80, 2.5],
  [-8, -60, 17], [-22, -55, 12], [-35, -64, 8], [-48, -70, 5], [5, -67, 9], [-5, -40, 6],
  [50, 10, 9], [46, 24, 9], [60, 22, 9], [41, -4, 5], [53, -2, 3.5], [64, 14, 6], [42, 13, 3],
  [8, 18, 17], [-8, 25, 15], [-25, 25, 10], [20, 3, 13], [24, 28, 9], [10, 40, 6], [-19, 47, 3.5],
  [55, 85, 24], [40, 100, 17], [30, 78, 11], [62, 130, 15], [20, 102, 7], [27, 48, 8], [36, 138, 4], [0, 112, 6], [-4, 135, 5],
  [-25, 134, 12], [-38, 146, 5], [-42, 172, 3],
  // the Antilles (exaggerated so they read at globe scale)
  [21.7, -79, 2.4], [19, -71, 2], [18.2, -66.5, 1.2], [18.1, -77.3, 1.2], [16.2, -61.6, 1.7], [14.6, -61, 1.2], [15.4, -61.3, 1.1], [13.2, -60.9, 0.9],
];
export const HOME = { lat: 16.2, lon: -61.6 };
const homeVec = llToVec(HOME.lat, HOME.lon);

// globe orientation: this lat/lon faces the camera (+z)
const CENTER = { lat: 24, lon: -38 };
export const GLOBE_EULER = new Euler(CENTER.lat * D, -CENTER.lon * D, 0, "XYZ");
export const homeWorld = () => homeVec.clone().applyEuler(GLOBE_EULER).multiplyScalar(GLOBE_R);

// empire radius (degrees of arc from Guadeloupe)
export const empireDeg = (f: number) =>
  keyed(f, [[1700, 42], [1760, 66], [1810, 96], [1950, 96], [1975, 88], [2090, 9], [2160, 2.2], [2240, 2.2]]);

export const Globe: React.FC<{ f: number }> = ({ f }) => {
  const data = useMemo(() => {
    // detail n splits each edge into n+1 → 20·(n+1)² faces (~33k here)
    const g = new IcosahedronGeometry(GLOBE_R, 40);
    const p = g.attributes.position;
    const faces = p.count / 3;
    const ang = new Float32Array(faces);
    const land = new Uint8Array(faces);
    const stripe = new Uint8Array(faces);
    const c = new Vector3();
    for (let fi = 0; fi < faces; fi++) {
      c.set(0, 0, 0);
      for (let k = 0; k < 3; k++) c.x += p.getX(fi * 3 + k), c.y += p.getY(fi * 3 + k), c.z += p.getZ(fi * 3 + k);
      c.normalize();
      const lat = Math.asin(c.y) / D;
      const lon = Math.atan2(c.x, c.z) / D;
      ang[fi] = Math.acos(Math.min(1, c.dot(homeVec))) / D;
      const wobble = noise3(c.x * 6, c.y * 6, c.z * 6) * 3.5;
      let isLand = false;
      for (const [bl, bo, br] of BLOBS) {
        const d = Math.acos(Math.min(1, c.dot(llToVec(bl, bo)))) / D;
        if (d < br + (br > 3 ? wobble : 0)) { isLand = true; break; }
      }
      land[fi] = isLand ? 1 : 0;
      stripe[fi] = (Math.floor((lat + 90) / 4) + Math.floor((lon + 180) / 4)) % 3;
    }
    g.setAttribute("color", new Float32BufferAttribute(new Float32Array(p.count * 3), 3));
    return { g, ang, land, stripe, faces };
  }, []);

  const R = empireDeg(f);
  const col = data.g.attributes.color as BufferAttribute;
  const ocean = new Color("#1c6fb3"), oceanE = new Color("#7a2e6e"), green = new Color(PAL.jungle), sand = new Color("#d9c27a");
  const red = new Color(PAL.madrasRed), yel = new Color(PAL.madrasYellow), edge = new Color("#fff3b0");
  const c = new Color();
  for (let fi = 0; fi < data.faces; fi++) {
    const inE = data.ang[fi] <= R;
    const nearEdge = Math.abs(data.ang[fi] - R) < 1.6 && R > 3;
    if (data.land[fi]) {
      if (nearEdge) c.copy(edge);
      else if (inE) c.copy(data.stripe[fi] === 0 ? yel : red);
      else c.copy(green).lerp(sand, data.stripe[fi] === 0 ? 0.18 : 0);
    } else {
      c.copy(ocean);
      if (inE) c.lerp(oceanE, 0.35);
      if (nearEdge) c.lerp(edge, 0.5);
    }
    for (let k = 0; k < 3; k++) col.setXYZ(fi * 3 + k, c.r, c.g, c.b);
  }
  col.needsUpdate = true;

  const atmo = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        uniforms: { uColor: { value: new Color("#7fc8ff") } },
        vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV; void main(){ float r = pow(1.0 - abs(dot(vN, vV)), 2.0); gl_FragColor = vec4(uColor * r * 1.4, r); }`,
      }),
    [],
  );
  const tex = bannerTexture();
  // pin flag at Guadeloupe, standing along the surface normal
  const up = homeVec.clone();
  const q = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), up));
  return (
    <group rotation={GLOBE_EULER}>
      <mesh geometry={data.g} material={toon("#ffffff", { vertexColors: true, steps: 4 })} />
      {OUTLINES ? (
        <mesh material={outlineMaterial(0.6)}>
          <icosahedronGeometry args={[GLOBE_R, 14]} />
        </mesh>
      ) : null}
      <mesh material={atmo} scale={1.12}>
        <icosahedronGeometry args={[GLOBE_R, 14]} />
      </mesh>
      <group position={up.clone().multiplyScalar(GLOBE_R * 0.995)} rotation={q}>
        <WavingFlag frame={f} loopFrames={LOOP} texture={tex} height={6.5} width={4.2} raise={1} seed={3} outline={0.06} />
      </group>
    </group>
  );
};
