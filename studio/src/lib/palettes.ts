import * as THREE from 'three';

/** 5 colours per stage: zenith, horizon (= fog), sun, ground, accent. */
export type Stage = {zenith: string; horizon: string; sun: string; ground: string; accent: string};
export type Palette = Record<keyof Stage, THREE.Color>;
export type PaletteStop = {frame: number; stage: Stage};

const cache = new Map<string, THREE.Color>();
const col = (hex: string) => {
  let c = cache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    cache.set(hex, c);
  }
  return c;
};

const KEYS: (keyof Stage)[] = ['zenith', 'horizon', 'sun', 'ground', 'accent'];

/** Smoothly interpolated palette (sky, fog, lights and ambient all read from it). */
export const paletteAt = (frame: number, stops: PaletteStop[]): Palette => {
  const out = {} as Palette;
  let a = stops[0];
  let b = stops[0];
  for (let i = 0; i < stops.length; i++) {
    if (frame >= stops[i].frame) {
      a = stops[i];
      b = stops[Math.min(i + 1, stops.length - 1)];
    }
  }
  const span = Math.max(1, b.frame - a.frame);
  let t = b === a ? 0 : Math.min(1, Math.max(0, (frame - a.frame) / span));
  t = t * t * (3 - 2 * t);
  for (const k of KEYS) out[k] = col(a.stage[k]).clone().lerp(col(b.stage[k]), t);
  return out;
};
