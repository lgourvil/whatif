import React, {useMemo} from 'react';
import * as THREE from 'three';
import {random} from 'remotion';
import {glassOutline, outlineMaterial, toonProps} from '../../lib/ToonMaterial';

/**
 * Hero prop: a rounded "flask" disposable with a clear dual-lobe mouthpiece, red translucent frame, full-wrap
 * front artwork (low-poly eagle head over flames), logo + flavour text, LED percentage screen and a clear base
 * with two red side LEDs. Modelled from Louis' reference photo.
 *
 * Branding: the real brand's logo is NOT reproduced (TikTok removes branded vape promotion, and the series only
 * uses original IP). Change LOGO / TAGLINE here if needed.
 */
export const LOGO = 'HAZE';
export const TAGLINE = 'JUST ONE MORE';
export const FLAVOR = ['STRAWBERRY', 'WATERMELON ICE'];

// real-world size (metres): 56 x 108 x 27 mm body + 26 mm mouthpiece + 14 mm base
export const W = 0.056, H = 0.108, D = 0.027, TOP = 0.026, BASE = 0.014;
const R = 0.011;

const roundedRect = (w: number, h: number, r: number) => {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
};

const extrude = (shape: THREE.Shape, depth: number, bevel: number, segs = 3) => {
  const g = new THREE.ExtrudeGeometry(shape, {depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 6});
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  return g;
};

/** Mouthpiece silhouette (front view): shoulders taper in, two rounded lobes with a dip in the middle. */
const topShape = (w: number, h: number) => {
  const s = new THREE.Shape();
  const b = w / 2;
  s.moveTo(-b, 0);
  s.bezierCurveTo(-b, h * 0.35, -b * 0.92, h * 0.62, -b * 0.78, h * 0.86);
  s.bezierCurveTo(-b * 0.66, h * 1.04, -b * 0.3, h * 1.04, -b * 0.18, h * 0.82);
  s.quadraticCurveTo(0, h * 0.7, b * 0.18, h * 0.82);
  s.bezierCurveTo(b * 0.3, h * 1.04, b * 0.66, h * 1.04, b * 0.78, h * 0.86);
  s.bezierCurveTo(b * 0.92, h * 0.62, b, h * 0.35, b, 0);
  s.lineTo(-b, 0);
  return s;
};

const uvFromXY = (g: THREE.BufferGeometry, w: number, h: number) => {
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / w + 0.5; uv[i * 2 + 1] = p.getY(i) / h + 0.5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
};

// ---------- artwork (drawn once, deterministic) ----------
type P = [number, number];
const inPoly = (pt: P, poly: P[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const path = (ctx: CanvasRenderingContext2D, poly: P[]) => {
  ctx.beginPath(); ctx.moveTo(...poly[0]); for (const p of poly.slice(1)) ctx.lineTo(...p); ctx.closePath();
};
const hex = (c: THREE.Color) => `#${c.getHexString()}`;

// eagle regions in a 512 x 1056 canvas, head turned to the left as on the reference
const HEAD: P[] = [[232, 178], [282, 140], [350, 138], [410, 168], [446, 228], [452, 300], [470, 372], [430, 380], [380, 352], [318, 352], [262, 330], [236, 300], [226, 250]];
const BODY: P[] = [[262, 330], [318, 352], [380, 352], [430, 380], [470, 372], [500, 430], [512, 520], [512, 700], [440, 742], [330, 760], [210, 738], [120, 690], [70, 610], [84, 520], [130, 450], [190, 395]];
const WING: P[] = [[512, 470], [512, 760], [430, 790], [400, 700], [430, 600], [470, 520]];
const BEAK_TOP: P[] = [[232, 220], [270, 214], [292, 248], [282, 292], [248, 300], [214, 286], [180, 300], [166, 336], [158, 318], [168, 276], [196, 236]];
const BEAK_LOW: P[] = [[214, 286], [248, 300], [262, 318], [228, 326], [196, 314]];
const BROW: P[] = [[262, 218], [356, 206], [372, 226], [330, 246], [282, 248]];

const drawArt = (): HTMLCanvasElement => {
  const cw = 512, ch = 1056;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d')!;
  // fire background
  const bg = ctx.createRadialGradient(300, 330, 40, 260, 460, 720);
  bg.addColorStop(0, '#ff9a3a'); bg.addColorStop(0.25, '#f2501a'); bg.addColorStop(0.55, '#c8141a'); bg.addColorStop(1, '#5a0410');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);
  const flameCols = ['#ff3b1f', '#ff8a2a', '#ffc24a', '#b3121c', '#ff5a1f', '#ffe08a'];
  for (let i = 0; i < 70; i++) {
    const x = random(`fx${i}`) * cw, y = 80 + random(`fy${i}`) * (ch - 120);
    const h = 60 + random(`fh${i}`) * 170, w = 14 + random(`fw${i}`) * 34;
    const lean = (random(`fl${i}`) - 0.5) * 60;
    ctx.globalAlpha = 0.35 + random(`fa${i}`) * 0.45;
    ctx.fillStyle = flameCols[Math.floor(random(`fc${i}`) * flameCols.length)];
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.bezierCurveTo(x - w, y - h * 0.5, x + lean - w * 0.3, y - h * 0.7, x + lean, y - h);
    ctx.bezierCurveTo(x + lean * 0.4 + w * 0.6, y - h * 0.6, x + w, y - h * 0.4, x + w, y);
    ctx.quadraticCurveTo(x, y + w * 0.6, x - w, y);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // embers
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = random(`ec${i}`) > 0.5 ? '#ffe7a0' : '#ffffff';
    ctx.globalAlpha = 0.4 + random(`ea${i}`) * 0.6;
    const r = 1.5 + random(`er${i}`) * 3.5;
    ctx.fillRect(random(`ex${i}`) * cw, random(`ey${i}`) * ch, r, r);
  }
  ctx.globalAlpha = 1;

  // faceted (low-poly) fill of a region: jittered grid triangles, colour from a function, clipped to the polygon
  const facets = (poly: P[], colorAt: (x: number, y: number, r: number) => THREE.Color, cell: number, seed: string) => {
    ctx.save(); path(ctx, poly); ctx.clip();
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const x0 = Math.min(...xs) - cell, x1 = Math.max(...xs) + cell, y0 = Math.min(...ys) - cell, y1 = Math.max(...ys) + cell;
    const nx = Math.ceil((x1 - x0) / cell) + 1, ny = Math.ceil((y1 - y0) / cell) + 1;
    const pt = (i: number, j: number): P => [x0 + i * cell + (random(`${seed}x${i}-${j}`) - 0.5) * cell * 0.8, y0 + j * cell + (random(`${seed}y${i}-${j}`) - 0.5) * cell * 0.8];
    for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) {
      const a = pt(i, j), b = pt(i + 1, j), c = pt(i, j + 1), d = pt(i + 1, j + 1);
      for (const [k, tri] of [[0, [a, b, d]], [1, [a, d, c]]] as [number, P[]][]) {
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        ctx.fillStyle = hex(colorAt(cx, cy, random(`${seed}c${i}-${j}-${k}`)));
        path(ctx, tri); ctx.fill();
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    ctx.restore();
  };
  ctx.save(); ctx.translate(290, 330); ctx.scale(1.22, 1.22); ctx.translate(-290, -400);
  const C = (h: string) => new THREE.Color(h);
  const navy = C('#141a5c'), royal = C('#2a4fd0'), sky = C('#5c9cff'), violet = C('#6b3fc0'), pale = C('#cfe2ff'), magenta = C('#b0389a');
  facets(BODY, (x, y, r) => {
    const t = (y - 340) / 420;
    const base = royal.clone().lerp(violet, Math.min(1, Math.max(0, t * 1.2 + (x - 300) / 600)));
    if (r > 0.86) return pale.clone().lerp(base, 0.3); // white feather tips
    if (r < 0.18) return navy.clone();
    return base.lerp(magenta, Math.max(0, (x - 380) / 300) * 0.5).offsetHSL(0, 0, (r - 0.5) * 0.14);
  }, 30, 'b');
  facets(WING, (_x, y, r) => violet.clone().lerp(navy, 0.4 + r * 0.4).offsetHSL(0, 0, (y - 600) / 2000), 34, 'w');
  facets(HEAD, (x, y, r) => {
    const t = Math.min(1, Math.max(0, (x - 250) / 210));
    const base = pale.clone().lerp(sky, Math.min(1, t * 1.6)).lerp(royal, Math.max(0, t - 0.45) * 1.4).lerp(navy, Math.max(0, (y - 300) / 200) * 0.5);
    if (r > 0.84) return new THREE.Color('#ffffff');
    if (r < 0.1) return royal.clone();
    return base.offsetHSL(0, 0, (r - 0.5) * 0.18);
  }, 24, 'h');
  // feather streaks on the chest
  ctx.strokeStyle = 'rgba(230,240,255,0.75)'; ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const x = 120 + random(`sx${i}`) * 300, y = 420 + random(`sy${i}`) * 290;
    if (!inPoly([x, y], BODY)) continue;
    ctx.lineWidth = 2 + random(`sw${i}`) * 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 10, y + 16, x + 4, y + 30 + random(`sl${i}`) * 20); ctx.stroke();
  }
  // outlines
  ctx.lineJoin = 'round';
  for (const poly of [BODY, HEAD]) { path(ctx, poly); ctx.strokeStyle = '#0b0d30'; ctx.lineWidth = 6; ctx.stroke(); }
  // brow ridge, beak, eye
  path(ctx, BROW); ctx.fillStyle = '#0e1450'; ctx.fill();
  path(ctx, BEAK_TOP); ctx.fillStyle = '#ffc62e'; ctx.fill(); ctx.strokeStyle = '#2a1600'; ctx.lineWidth = 5; ctx.stroke();
  path(ctx, [[232, 220], [270, 214], [292, 248], [250, 252], [210, 252]]); ctx.fillStyle = '#ffe27a'; ctx.fill();
  path(ctx, [[180, 300], [166, 336], [158, 318], [168, 276], [196, 270]]); ctx.fillStyle = '#3a2a1a'; ctx.fill();
  path(ctx, BEAK_LOW); ctx.fillStyle = '#e09a1a'; ctx.fill(); ctx.strokeStyle = '#2a1600'; ctx.lineWidth = 4; ctx.stroke();
  ctx.beginPath(); ctx.arc(318, 262, 17, 0, Math.PI * 2); ctx.fillStyle = '#ff8c1a'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#1a0a00'; ctx.stroke();
  ctx.beginPath(); ctx.arc(315, 263, 8, 0, Math.PI * 2); ctx.fillStyle = '#100400'; ctx.fill();
  ctx.beginPath(); ctx.arc(322, 256, 4, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.restore();
  // bottom darkening for text legibility
  const dk = ctx.createLinearGradient(0, 640, 0, ch);
  dk.addColorStop(0, 'rgba(60,0,8,0)'); dk.addColorStop(0.4, 'rgba(60,0,8,0.55)'); dk.addColorStop(1, 'rgba(25,0,4,0.9)');
  ctx.fillStyle = dk; ctx.fillRect(0, 640, cw, ch - 640);
  // logo + tagline + flavour
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = '900 150px "Inter Display", "Inter", "DejaVu Sans", sans-serif';
  ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(20,0,10,0.85)'; ctx.strokeText(LOGO, cw / 2, 700);
  ctx.fillStyle = '#ffffff'; ctx.fillText(LOGO, cw / 2, 700);
  ctx.font = '800 30px "Inter", "DejaVu Sans", sans-serif';
  ctx.fillStyle = '#ffffff'; ctx.fillText(TAGLINE.split('').join(String.fromCharCode(8202)), cw / 2, 744);
  ctx.font = '900 44px "Inter", "DejaVu Sans", sans-serif';
  FLAVOR.forEach((l, i) => { ctx.lineWidth = 6; ctx.strokeText(l, cw / 2, 838 + i * 52); ctx.fillText(l, cw / 2, 838 + i * 52); });
  return cv;
};

// 7-segment LED screen texture, one per displayed value
const SEG: Record<string, number[]> = {
  '0': [1, 1, 1, 1, 1, 1, 0], '1': [0, 1, 1, 0, 0, 0, 0], '2': [1, 1, 0, 1, 1, 0, 1], '3': [1, 1, 1, 1, 0, 0, 1],
  '4': [0, 1, 1, 0, 0, 1, 1], '5': [1, 0, 1, 1, 0, 1, 1], '6': [1, 0, 1, 1, 1, 1, 1], '7': [1, 1, 1, 0, 0, 0, 0],
  '8': [1, 1, 1, 1, 1, 1, 1], '9': [1, 1, 1, 1, 0, 1, 1],
};
const screens = new Map<string, THREE.CanvasTexture>();
const screenTex = (pct: number, on: boolean, lit: string) => {
  const key = `${pct}-${on}-${lit}`;
  let t = screens.get(key);
  if (t) return t;
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 96;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, 256, 96);
  const txt = String(Math.round(pct));
  const digits = txt.padStart(3, ' ');
  const dw = 46, dh = 66, th = 9, x0 = 22, y0 = 15;
  const segRect = (k: number, x: number, y: number) => {
    const r: [number, number, number, number][] = [
      [x + th, y, dw - 2 * th, th], [x + dw - th, y + th, th, dh / 2 - th], [x + dw - th, y + dh / 2, th, dh / 2 - th],
      [x + th, y + dh - th, dw - 2 * th, th], [x, y + dh / 2, th, dh / 2 - th], [x, y + th, th, dh / 2 - th], [x + th, y + dh / 2 - th / 2, dw - 2 * th, th],
    ];
    return r[k];
  };
  for (let d = 0; d < 3; d++) {
    const ch = digits[d];
    for (let k = 0; k < 7; k++) {
      const active = on && ch !== ' ' && SEG[ch][k] === 1;
      ctx.fillStyle = active ? lit : 'rgba(255,255,255,0.05)';
      const [x, y, w, h] = segRect(k, x0 + d * (dw + 12), y0);
      ctx.fillRect(x, y, w, h);
    }
  }
  // percent sign
  ctx.fillStyle = on ? lit : 'rgba(255,255,255,0.05)';
  ctx.font = '900 54px "Inter", "DejaVu Sans", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('%', x0 + 3 * (dw + 12) - 2, y0 + dh / 2 + 2);
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  screens.set(key, t);
  return t;
};

type Props = {
  /** 0..100 */
  pct: number;
  /** LED glow 0..1 (inhale makes it brighter) */
  glow?: number;
  /** blink state for the empty battery */
  blinkOn?: boolean;
  frame: number;
};

/** The device, origin at the centre of the body, front facing +z, 1 unit = 1 m. */
export const Vape: React.FC<Props> = ({pct, glow = 0, blinkOn = true, frame}) => {
  const g = useMemo(() => {
    const body = extrude(roundedRect(W, H, R), D, 0.0035);
    const panel = uvFromXY(new THREE.ShapeGeometry(roundedRect(W - 0.0075, H - 0.0062, R * 0.75), 6), W - 0.0075, H - 0.0062);
    const top = extrude(topShape(W * 0.94, TOP), D * 0.92, 0.004, 4);
    const topCore = extrude(topShape(W * 0.6, TOP * 0.8), D * 0.5, 0.002, 2);
    const base = extrude(roundedRect(W, BASE, 0.005), D, 0.003);
    const baseCore = new THREE.BoxGeometry(W * 0.82, BASE * 0.55, D * 0.6);
    const screen = new THREE.PlaneGeometry(0.03, 0.0112);
    const led = new THREE.SphereGeometry(0.0017, 8, 6);
    const slot = new THREE.BoxGeometry(0.012, 0.0022, 0.004);
    return {body, panel, top, topCore, base, baseCore, screen, led, slot};
  }, []);
  const art = useMemo(() => {
    const t = new THREE.CanvasTexture(drawArt());
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
  const mats = useMemo(() => ({
    frame: new THREE.MeshToonMaterial({...toonProps('#a3000f'), emissive: new THREE.Color('#300004')}),
    panel: new THREE.MeshToonMaterial({...toonProps('#ffffff'), map: art, emissive: new THREE.Color('#ffffff'), emissiveMap: art, emissiveIntensity: 0.08}),
    clear: new THREE.MeshPhongMaterial({color: '#eef4ff', transparent: true, opacity: 0.3, shininess: 120, specular: new THREE.Color('#ffffff'), depthWrite: false}),
    clearRed: new THREE.MeshPhongMaterial({color: '#ffc4ca', transparent: true, opacity: 0.55, shininess: 120, specular: new THREE.Color('#ffffff'), depthWrite: false}),
    core: new THREE.MeshToonMaterial(toonProps('#e9e4e6')),
    dark: new THREE.MeshBasicMaterial({color: '#1a1416'}),
    gloss: new THREE.MeshBasicMaterial({color: '#ffffff', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending}),
  }), [art]);
  const dead = pct <= 0;
  const lit = dead ? '#ff3030' : pct < 15 ? '#ffb02e' : '#f4f7ff';
  const scr = screenTex(Math.max(0, pct), dead ? blinkOn : true, lit);
  const ledCol = new THREE.Color('#ff1e2e').multiplyScalar(0.5 + glow * 1.6);
  const z = D / 2;
  return (
    <group>
      {/* red translucent frame + outline */}
      <mesh geometry={g.body} material={mats.frame} />
      <mesh geometry={g.body} material={outlineMaterial()} scale={[1.035, 1.02, 1.07]} />
      {/* artwork, front and back */}
      <mesh geometry={g.panel} material={mats.panel} position={[0, 0, z + 0.0002]} />
      <mesh geometry={g.panel} material={mats.panel} position={[0, 0, -z - 0.0002]} rotation={[0, Math.PI, 0]} />
      {/* clear-coat highlight sweeping across the print */}
      <mesh position={[-0.013, 0.012, z + 0.0006]} rotation={[0, 0, -0.5]}>
        <planeGeometry args={[0.009, 0.14]} />
        <primitive object={mats.gloss} attach="material" />
      </mesh>
      <mesh position={[-0.002, 0.012, z + 0.0006]} rotation={[0, 0, -0.5]}>
        <planeGeometry args={[0.003, 0.14]} />
        <primitive object={mats.gloss} attach="material" />
      </mesh>
      {/* LED screen */}
      <mesh geometry={g.screen} position={[0, -H / 2 + 0.0105, z + 0.0008]}>
        <meshBasicMaterial map={scr} toneMapped={false} />
      </mesh>
      {/* clear mouthpiece with its white inner core and dark air slot */}
      <group position={[0, H / 2 - 0.0015, 0]}>
        <mesh geometry={g.topCore} material={mats.core} position={[0, 0, 0]} />
        <mesh geometry={g.slot} material={mats.dark} position={[0, TOP * 0.74, 0]} />
        <mesh geometry={g.top} material={glassOutline()[0]} renderOrder={1} />
        <mesh geometry={g.top} material={glassOutline()[1]} scale={[1.03, 1.03, 1.08]} renderOrder={2} />
        <mesh geometry={g.top} material={mats.clear} />
      </group>
      {/* clear base, white core, two red LEDs */}
      <group position={[0, -H / 2 - BASE / 2 + 0.0015, 0]}>
        <mesh geometry={g.baseCore} material={mats.core} />
        <mesh geometry={g.base} material={glassOutline()[0]} renderOrder={1} />
        <mesh geometry={g.base} material={glassOutline()[1]} scale={[1.035, 1.12, 1.08]} renderOrder={2} />
        <mesh geometry={g.base} material={mats.clearRed} />
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={g.led} position={[s * W * 0.36, 0, D / 2 + 0.0004]}>
            <meshBasicMaterial color={ledCol} toneMapped={false} />
          </mesh>
        ))}
        <mesh position={[0, -BASE / 2 + 0.001, 0]}>
          <boxGeometry args={[0.009, 0.0012, 0.0035]} />
          <meshBasicMaterial color="#2a2a2a" />
        </mesh>
      </group>
      {/* inhale glow inside the mouthpiece */}
      {glow > 0.02 && (
        <mesh position={[0, H / 2 + TOP * 0.35, 0]}>
          <sphereGeometry args={[0.012, 10, 8]} />
          <meshBasicMaterial color="#ff4060" transparent opacity={glow * 0.35} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {/* frame accent: small sparkle drifting on the clear top (cheap specular) */}
      <mesh position={[W * 0.25, H / 2 + TOP * 0.55, D * 0.47]}>
        <circleGeometry args={[0.0018 + 0.0006 * Math.sin(frame * 0.08), 6]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.85} toneMapped={false} />
      </mesh>
    </group>
  );
};

/** Background version for the crowd: same silhouette, no textures (cheap). */
export const MiniVape: React.FC<{glow: number}> = ({glow}) => (
  <group>
    <mesh><boxGeometry args={[W, H, D]} /><meshToonMaterial {...toonProps('#d81e2c')} /></mesh>
    <mesh position={[0, 0, D / 2 + 0.001]}><planeGeometry args={[W * 0.8, H * 0.75]} /><meshBasicMaterial color="#3d5fe0" /></mesh>
    <mesh position={[0, H / 2 + TOP / 2, 0]}><boxGeometry args={[W * 0.8, TOP, D * 0.8]} /><meshBasicMaterial color="#dfe8ff" /></mesh>
    <mesh position={[0, -H / 2 - 0.006, D / 2]}><sphereGeometry args={[0.006, 6, 4]} /><meshBasicMaterial color={new THREE.Color('#ff2030').multiplyScalar(0.6 + glow * 2)} toneMapped={false} /></mesh>
  </group>
);
