import React, {useLayoutEffect, useRef, useState} from 'react';
import * as THREE from 'three';
import {AbsoluteFill, Audio, continueRender, delayRender, random, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {smoothstep} from '../lib/anim';
import {BEATS, burst, camera, entrance, fadeOut, flash, lights, shock, shutter, yaw} from './timeline';
import {ACCUM_FS, BLUR_FS, BRIGHT_FS, BURST_FS, COMPOSITE_FS, FOG_FS, FOG_VS, PARTICLE_FS, PARTICLE_VS, QUAD_VS, SKY_FS, SKY_VS} from './shaders';

type Span = [number, number] | null;
type Sil = {rows: Span[]; cols: Span[]; depth: number[]};
type Meta = {front: Sil; back: Sil; aspect: number; depthRes: number};

const H = 2.0; // jersey height in world units
const DEPTH = 0.36; // chest depth of each shell
const SEG = 180;

const sampleSpan = (arr: Span[], x: number): Span => {
  const n = arr.length;
  const f = Math.min(n - 1, Math.max(0, x * n - 0.5));
  const i = Math.floor(f), j = Math.min(n - 1, i + 1), k = f - i;
  const a = arr[i], b = arr[j];
  if (!a || !b) return a ?? b;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
};

/** One curved shell (front or back) of the garment, with per-vertex cloth parameters. */
class Shell {
  geo: THREE.PlaneGeometry;
  base: Float32Array;
  prof: Float32Array; // 0 at silhouette edge -> 1 mid-chest
  hem: Float32Array; // 1 at the bottom hem, 0 at shoulders
  sleeve: Float32Array;
  side: number;
  constructor(sil: Sil, res: number, width: number, side: 1 | -1) {
    this.side = side;
    this.geo = new THREE.PlaneGeometry(width, H, SEG, SEG);
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const uv = this.geo.attributes.uv as THREE.BufferAttribute;
    const n = pos.count;
    this.base = new Float32Array(n * 3);
    this.prof = new Float32Array(n);
    this.hem = new Float32Array(n);
    this.sleeve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      const r = sampleSpan(sil.rows, v), c = sampleSpan(sil.cols, u);
      let prof = 0, hem = 0, sl = 0;
      if (r && c) {
        const gx = u * (res - 1), gy = v * (res - 1);
        const x0 = Math.min(res - 2, Math.floor(gx)), y0 = Math.min(res - 2, Math.floor(gy)), fx = gx - x0, fy = gy - y0;
        const D = (xx: number, yy: number) => sil.depth[yy * res + xx];
        prof = (D(x0, y0) * (1 - fx) + D(x0 + 1, y0) * fx) * (1 - fy) + (D(x0, y0 + 1) * (1 - fx) + D(x0 + 1, y0 + 1) * fx) * fy;
        hem = Math.pow(1 - smoothstep(c[1], c[1] + 0.55, v), 2);
        sl = smoothstep(0.3, 0.42, Math.abs(u - 0.5));
      }
      let x = pos.getX(i), z = DEPTH * prof;
      if (side < 0) { x = -x; z = -z; } // back shell faces -z, mirrored so the print reads correctly from behind
      this.base[i * 3] = x; this.base[i * 3 + 1] = pos.getY(i); this.base[i * 3 + 2] = z;
      this.prof[i] = prof; this.hem[i] = hem; this.sleeve[i] = sl;
    }
    if (side < 0) {
      // mirroring x flips winding: swap two indices per triangle so the print side stays front-facing
      const idx = this.geo.index!;
      for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t + 1); idx.setX(t + 1, idx.getX(t + 2)); idx.setX(t + 2, a); }
    }
    this.update(0, 0);
  }
  /** Cloth motion: world-coherent sway (keeps both shells sealed at the seams) + local ripples. */
  update(t: number, spin: number) {
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const flare = Math.min(0.12, Math.abs(spin) * 0.016);
    for (let i = 0; i < pos.count; i++) {
      const x = this.base[i * 3], y = this.base[i * 3 + 1], z = this.base[i * 3 + 2];
      const hem = this.hem[i], sl = this.sleeve[i], pr = this.prof[i];
      const sway = (0.006 + 0.035 * hem + 0.012 * sl) * (Math.sin(1.7 * x + 1.9 * t + 2.1 * y) + 0.5 * Math.sin(3.1 * y - 2.7 * t + 0.6 * x));
      const ripple = pr * (0.008 + 0.01 * hem) * Math.sin(5.2 * x + 2.3 * t) * Math.sin(4.1 * y - 1.6 * t + 1.3 * x);
      const fl = 1 + flare * hem;
      arr[i * 3] = x * fl + 0.4 * sway * Math.sin(0.9 * y + t);
      arr[i * 3 + 1] = y + 0.15 * sway;
      arr[i * 3 + 2] = z * fl + sway + ripple * this.side;
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

const fabric = (map: THREE.Texture, normalMap: THREE.Texture) => {
  const m = new THREE.MeshPhysicalMaterial({
    map, normalMap, normalScale: new THREE.Vector2(0.28, 0.28),
    roughness: 0.52, metalness: 0, sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color('#5a5650'), specularIntensity: 0.6,
    alphaTest: 0.5, side: THREE.DoubleSide,
  });
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n if (!gl_FrontFacing) diffuseColor.rgb *= 0.12;');
  };
  return m;
};

const quadMat = (fs: string, uniforms: Record<string, THREE.IUniform>, blending: THREE.Blending = THREE.NoBlending) =>
  new THREE.ShaderMaterial({vertexShader: QUAD_VS, fragmentShader: fs, uniforms, blending, depthTest: false, depthWrite: false, transparent: blending !== THREE.NoBlending});

class Director {
  r: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
  jersey = new THREE.Group();
  shells: Shell[];
  key: THREE.DirectionalLight; fill: THREE.DirectionalLight; rimL: THREE.DirectionalLight; rimR: THREE.DirectionalLight; top: THREE.SpotLight;
  sweep: THREE.PointLight; hemi: THREE.HemisphereLight;
  sky: THREE.ShaderMaterial; fogs: THREE.Mesh[] = []; burst: THREE.Mesh;
  pts: THREE.Points; pBase: Float32Array; pVel: Float32Array;
  rtScene: THREE.WebGLRenderTarget; rtAccum: THREE.WebGLRenderTarget;
  rtB: THREE.WebGLRenderTarget[]; rtS: THREE.WebGLRenderTarget[];
  quad: THREE.Mesh; qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); qscene = new THREE.Scene();
  mAccum: THREE.ShaderMaterial; mBright: THREE.ShaderMaterial; mBlur: THREE.ShaderMaterial; mComp: THREE.ShaderMaterial;
  w: number; h: number;

  constructor(canvas: HTMLCanvasElement, w: number, h: number, tex: Record<string, THREE.Texture>, meta: Meta) {
    this.w = w; this.h = h;
    this.r = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
    this.r.setPixelRatio(1);
    this.r.setSize(w, h, false);
    this.r.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.r.toneMapping = THREE.NoToneMapping;
    this.cam.aspect = w / h;
    const aniso = this.r.capabilities.getMaxAnisotropy();
    for (const k of ['front', 'back']) { tex[k].colorSpace = THREE.SRGBColorSpace; tex[k].anisotropy = aniso; tex[k + '_n'].anisotropy = aniso; }

    const width = H * meta.aspect;
    this.shells = [new Shell(meta.front, meta.depthRes, width, 1), new Shell(meta.back, meta.depthRes, width, -1)];
    this.jersey.add(new THREE.Mesh(this.shells[0].geo, fabric(tex.front, tex.front_n)));
    this.jersey.add(new THREE.Mesh(this.shells[1].geo, fabric(tex.back, tex.back_n)));
    this.scene.add(this.jersey);

    this.hemi = new THREE.HemisphereLight('#8e94a6', '#120c09', 0.6);
    this.key = new THREE.DirectionalLight('#fff4ea', 2.4); this.key.position.set(-2.2, 3, 5);
    this.fill = new THREE.DirectionalLight('#b8c4ff', 0.5); this.fill.position.set(3, 0.5, 3);
    this.rimL = new THREE.DirectionalLight('#ff5418', 7); this.rimL.position.set(-4, 1.5, -3.2);
    this.rimR = new THREE.DirectionalLight('#ffa050', 5); this.rimR.position.set(4.2, 2.2, -3.4);
    this.top = new THREE.SpotLight('#ffffff', 10, 12, 0.5, 0.8, 1.5); this.top.position.set(0, 5, 1.5);
    this.sweep = new THREE.PointLight('#ffffff', 6, 6, 1.6);
    this.scene.add(this.hemi, this.key, this.fill, this.rimL, this.rimR, this.top, this.top.target, this.sweep);

    this.sky = new THREE.ShaderMaterial({vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: {uGlow: {value: 0}}, side: THREE.BackSide, depthWrite: false});
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), this.sky));

    const fogDefs: [number, number, number, number, string][] = [[-1.5, -0.6, -2.2, 9, '#ff7a3a'], [1.8, 0.5, -3.2, 11, '#c9b8b0'], [0, -1.6, -1.4, 8, '#ff6a2a'], [-2.5, 1.8, -4.5, 13, '#a8a0a0'], [2.4, -1.2, -1.8, 7, '#ffb07a'], [0, -2.2, 2.2, 9, '#9a8f8a']];
    fogDefs.forEach(([x, y, z, s, c], i) => {
      const m = new THREE.ShaderMaterial({vertexShader: FOG_VS, fragmentShader: FOG_FS, uniforms: {uTime: {value: 0}, uSeed: {value: i * 1.37}, uAmt: {value: 0}, uCol: {value: new THREE.Color(c)}},
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false});
      const f = new THREE.Mesh(new THREE.PlaneGeometry(s, s), m);
      f.position.set(x, y, z);
      this.fogs.push(f); this.scene.add(f);
    });

    this.burst = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.ShaderMaterial({vertexShader: FOG_VS, fragmentShader: BURST_FS, uniforms: {uAmt: {value: 0}, uTime: {value: 0}},
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false}));
    this.scene.add(this.burst);

    const N = 1600;
    this.pBase = new Float32Array(N * 3); this.pVel = new Float32Array(N);
    const size = new Float32Array(N), col = new Float32Array(N * 3), alpha = new Float32Array(N);
    const ember = new THREE.Color('#ff7a2a'), amber = new THREE.Color('#ffc27a'), dust = new THREE.Color('#e8e4f0');
    for (let i = 0; i < N; i++) {
      const rr = (k: string) => random(`p${i}${k}`);
      this.pBase[i * 3] = (rr('x') - 0.5) * 9; this.pBase[i * 3 + 1] = (rr('y') - 0.5) * 12; this.pBase[i * 3 + 2] = -6 + rr('z') * 8.5;
      this.pVel[i] = 0.15 + rr('v') * 0.5;
      const kind = rr('k');
      const c = kind < 0.55 ? ember : kind < 0.85 ? amber : dust;
      const b = 0.6 + rr('b') * 2.4;
      col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
      size[i] = 0.02 + Math.pow(rr('s'), 3) * 0.09;
      alpha[i] = 0.4 + rr('a') * 0.6;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    pg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    pg.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    pg.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    this.pts = new THREE.Points(pg, new THREE.ShaderMaterial({vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, uniforms: {uPx: {value: h * 0.9}},
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false}));
    this.pts.frustumCulled = false;
    this.scene.add(this.pts);

    const hf = {type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false};
    this.rtScene = new THREE.WebGLRenderTarget(w, h, {type: THREE.HalfFloatType, samples: 4});
    this.rtAccum = new THREE.WebGLRenderTarget(w, h, hf);
    this.rtB = [0, 1, 2, 3].map((i) => new THREE.WebGLRenderTarget(w >> (i < 2 ? 2 : 3), h >> (i < 2 ? 2 : 3), hf));
    this.rtS = [0, 1].map(() => new THREE.WebGLRenderTarget(w >> 3, h >> 4, hf));

    this.mAccum = quadMat(ACCUM_FS, {tSrc: {value: null}, uWeight: {value: 1}}, THREE.AdditiveBlending);
    this.mBright = quadMat(BRIGHT_FS, {tSrc: {value: null}, uThreshold: {value: 0.85}, uTexel: {value: new THREE.Vector2(1 / w, 1 / h)}});
    this.mBlur = quadMat(BLUR_FS, {tSrc: {value: null}, uDir: {value: new THREE.Vector2()}});
    this.mComp = quadMat(COMPOSITE_FS, {
      tScene: {value: this.rtAccum.texture}, tB1: {value: this.rtB[0].texture}, tB2: {value: this.rtB[2].texture}, tStreak: {value: this.rtS[0].texture},
      uRes: {value: new THREE.Vector2(w, h)}, uFlash: {value: 0}, uFade: {value: 0}, uShockR: {value: 0}, uShockA: {value: 0}, uCA: {value: 0}, uTime: {value: 0}, uBloom: {value: 1}, uExposure: {value: 1.15},
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mAccum);
    this.quad.frustumCulled = false;
    this.qscene.add(this.quad);
  }

  pose(t: number) {
    const c = camera(t);
    this.cam.position.set(...c.pos);
    this.cam.up.set(Math.sin(c.roll), Math.cos(c.roll), 0);
    this.cam.lookAt(...c.target);
    this.cam.fov = c.fov; this.cam.updateProjectionMatrix();

    const e = entrance(t);
    const dt = 1 / 240;
    const spin = (yaw(t + dt) - yaw(t - dt)) / (2 * dt);
    this.jersey.visible = e.visible;
    this.jersey.rotation.set(0.03 * Math.sin(t * 1.1), yaw(t), 0.015 * Math.sin(t * 0.8 + 1));
    this.jersey.position.set(0, 0.035 * Math.sin(t * 1.6), e.z);
    this.jersey.scale.setScalar(e.scale);
    for (const s of this.shells) s.update(t, spin);

    const L = lights(t);
    this.hemi.intensity = 0.55 * L.key + 0.05;
    this.key.intensity = 2.4 * L.key;
    this.fill.intensity = 0.5 * L.key;
    this.rimL.intensity = 7 * L.rim; this.rimR.intensity = 5 * L.rim;
    this.top.intensity = 10 * L.key;
    this.sweep.position.set(L.sweepX, 0.6 + 0.3 * Math.sin(t * 2), 1.4);
    this.sweep.intensity = 5 * L.sweep;

    const b = burst(t);
    this.sky.uniforms.uGlow.value = Math.min(1.5, 0.4 * L.rim + b * 0.1);
    this.burst.position.copy(this.cam.position).sub(new THREE.Vector3(...c.target)).setLength(-1.6).add(new THREE.Vector3(0, 0.25, 0));
    this.burst.lookAt(this.cam.position);
    (this.burst.material as THREE.ShaderMaterial).uniforms.uAmt.value = b;
    (this.burst.material as THREE.ShaderMaterial).uniforms.uTime.value = t;

    const fogAmt = smoothstep(BEATS.flash, 1.2, t) * 0.55 + (t > BEATS.flash ? 0.6 * Math.exp(-(t - BEATS.flash) * 3) : 0);
    this.fogs.forEach((f, i) => {
      const m = f.material as THREE.ShaderMaterial;
      m.uniforms.uTime.value = t; m.uniforms.uAmt.value = fogAmt * (i === 5 ? 0.5 : 1) * 0.05;
      f.quaternion.copy(this.cam.quaternion);
    });

    // embers: blasted out from the core at the flash, then rising and swirling
    const p = this.pts.geometry.attributes.position as THREE.BufferAttribute;
    const arr = p.array as Float32Array;
    const since = Math.max(0, t - BEATS.flash);
    const blast = t < BEATS.flash ? 0 : 1 - Math.exp(-since * 5);
    const kick = t < BEATS.flash ? 0 : Math.exp(-since * 2.5) * 1.2;
    for (let i = 0; i < arr.length / 3; i++) {
      const bx = this.pBase[i * 3], bz = this.pBase[i * 3 + 2];
      const by = ((this.pBase[i * 3 + 1] + since * this.pVel[i] + 6) % 12 + 12) % 12 - 6;
      const sw = Math.sin(t * 0.7 + i) * 0.15;
      const s = 0.05 + 0.95 * blast + kick * 0.3;
      arr[i * 3] = (bx + sw) * s + spin * 0.004 * by;
      arr[i * 3 + 1] = by * s;
      arr[i * 3 + 2] = bz * s + Math.cos(t * 0.6 + i) * 0.15;
    }
    p.needsUpdate = true;
    this.pts.visible = t >= BEATS.flash;
    return spin;
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null, clear = true) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    if (clear) this.r.clear();
    this.r.render(this.qscene, this.qcam);
  }
  private blur(src: THREE.WebGLRenderTarget, tmp: THREE.WebGLRenderTarget, sx: number, sy: number) {
    const w = src.width, h = src.height;
    this.mBlur.uniforms.tSrc.value = src.texture; this.mBlur.uniforms.uDir.value.set(sx / w, 0); this.pass(this.mBlur, tmp);
    this.mBlur.uniforms.tSrc.value = tmp.texture; this.mBlur.uniforms.uDir.value.set(0, sy / h); this.pass(this.mBlur, src);
  }

  render(frame: number, fps: number) {
    const t = frame / fps;
    const spin0 = Math.abs((yaw(t + 0.004) - yaw(t - 0.004)) / 0.008);
    const c0 = camera(t - 0.5 / fps).pos, c1 = camera(t + 0.5 / fps).pos;
    const camV = Math.hypot(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]) * fps;
    const sh = shutter(t);
    const spread = (spin0 + camV * 0.35) * sh / fps;
    const K = Math.max(1, Math.min(16, Math.ceil(spread / 0.012)));

    this.r.setClearColor(0x000000, 1);
    this.r.setRenderTarget(this.rtAccum); this.r.clear();
    let spin = 0;
    for (let i = 0; i < K; i++) {
      const ts = K === 1 ? t : t + ((i + 0.5) / K - 0.5) * sh / fps;
      spin = this.pose(ts);
      this.r.setRenderTarget(this.rtScene); this.r.clear();
      this.r.render(this.scene, this.cam);
      this.mAccum.uniforms.tSrc.value = this.rtScene.texture; this.mAccum.uniforms.uWeight.value = 1 / K;
      this.pass(this.mAccum, this.rtAccum, false);
    }

    this.mBright.uniforms.tSrc.value = this.rtAccum.texture; this.pass(this.mBright, this.rtB[0]);
    this.blur(this.rtB[0], this.rtB[1], 1.5, 1.5);
    this.blur(this.rtB[0], this.rtB[1], 2.5, 2.5);
    this.mBlur.uniforms.tSrc.value = this.rtB[0].texture; this.mBlur.uniforms.uDir.value.set(0, 0); this.pass(this.mBlur, this.rtB[2]);
    this.blur(this.rtB[2], this.rtB[3], 2, 2); this.blur(this.rtB[2], this.rtB[3], 4, 4);
    this.mBlur.uniforms.tSrc.value = this.rtB[2].texture; this.mBlur.uniforms.uDir.value.set(0, 0); this.pass(this.mBlur, this.rtS[0]);
    for (const s of [3, 8, 16]) {
      const w = this.rtS[0].width;
      this.mBlur.uniforms.tSrc.value = this.rtS[0].texture; this.mBlur.uniforms.uDir.value.set(s / w, 0); this.pass(this.mBlur, this.rtS[1]);
      this.mBlur.uniforms.tSrc.value = this.rtS[1].texture; this.mBlur.uniforms.uDir.value.set(s / w, 0); this.pass(this.mBlur, this.rtS[0]);
    }

    const u = this.mComp.uniforms;
    const sk = shock(t);
    u.uFlash.value = flash(t); u.uFade.value = fadeOut(t);
    u.uShockR.value = sk.r; u.uShockA.value = sk.a;
    u.uCA.value = 0.0015 + Math.min(0.006, Math.abs(spin) * 0.0007) + sk.a * 0.01;
    u.uTime.value = t; u.uBloom.value = 1.0;
    this.pass(this.mComp, null);
  }
}

export const JerseyReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const canvas = useRef<HTMLCanvasElement>(null);
  const dir = useRef<Director | null>(null);
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('jersey assets'));

  useLayoutEffect(() => {
    const loader = new THREE.TextureLoader();
    const names = ['front', 'back', 'front_n', 'back_n'];
    Promise.all([
      ...names.map((n) => loader.loadAsync(staticFile(`jersey/${n}.${n.endsWith('_n') ? 'jpg' : 'png'}`))),
      fetch(staticFile('jersey/silhouette.json')).then((r) => r.json()),
    ]).then((res) => {
      const tex: Record<string, THREE.Texture> = {};
      names.forEach((n, i) => (tex[n] = res[i] as THREE.Texture));
      dir.current = new Director(canvas.current!, width, height, tex, res[4] as Meta);
      setReady(true);
      continueRender(handle);
    });
  }, []);

  useLayoutEffect(() => {
    if (ready) dir.current!.render(frame, fps);
  }, [frame, ready]);

  return (
    <AbsoluteFill style={{backgroundColor: 'black'}}>
      <canvas ref={canvas} width={width} height={height} style={{width, height}} />
      <Audio src={staticFile('audio/jersey-reveal.wav')} />
    </AbsoluteFill>
  );
};
