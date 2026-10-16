import * as THREE from 'three';

export type Palette = {zenith: string; horizon: string; ground: string; water: string; accent: string};
export type PaletteC = {[K in keyof Palette]: THREE.Color};

/** Mix a list of palettes with a continuous mood value (0 = first, 1 = second, ...). */
export const mixPalette = (ps: Palette[], mood: number): PaletteC => {
  const m = Math.min(ps.length - 1, Math.max(0, mood));
  const i = Math.min(ps.length - 2, Math.floor(m));
  const t = m - i;
  const out = {} as PaletteC;
  (Object.keys(ps[0]) as (keyof Palette)[]).forEach((k) => {
    out[k] = new THREE.Color(ps[i][k]).lerp(new THREE.Color(ps[i + 1][k]), t);
  });
  return out;
};

/** Ocean Drains: 5 colours per mood, warm sunset -> cold night -> red tension. */
export const OCEAN_DRAINS: Palette[] = [
  {zenith: '#3a2a78', horizon: '#ff9a5c', ground: '#e6c28c', water: '#2a8fa0', accent: '#ff5a50'},
  {zenith: '#050a26', horizon: '#2b4c8f', ground: '#e6c28c', water: '#2a8fa0', accent: '#7ef0ff'},
  {zenith: '#1e0509', horizon: '#e0222c', ground: '#e6c28c', water: '#2a8fa0', accent: '#ff3b30'},
];

/** Gravity Off: warm morning -> violet near-space -> red tension at the 9.9 s freeze. */
export const GRAVITY_OFF: Palette[] = [
  {zenith: '#2f78ff', horizon: '#ffcf8f', ground: '#7fd06a', water: '#3fc1d9', accent: '#ff5d73'},
  {zenith: '#07031f', horizon: '#7b57e6', ground: '#7fd06a', water: '#3fc1d9', accent: '#7ef0ff'},
  {zenith: '#240308', horizon: '#ff4a3a', ground: '#7fd06a', water: '#3fc1d9', accent: '#ff3b30'},
];
