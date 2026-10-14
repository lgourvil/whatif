import { Color } from "three";

// A mood = the full lighting state of the world at a moment. The scene lerps
// between moods so sky, fog, sun, hemisphere and accents always move together.
export type Mood = {
  skyTop: string;
  skyHorizon: string;
  fog: string;
  sun: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogDensity: number;
  stars: number; // 0..1 star visibility
};

// Episode palettes: max 5 "hero" colors each, plus derived moods.
export const PALETTES = {
  // Guadeloupe Empire — madras red / yellow, lagoon teal, sand, jungle green
  guadeloupeEmpire: {
    madrasRed: "#e23d32",
    madrasYellow: "#f6c33f",
    lagoon: "#1aa6b7",
    sand: "#f2d59a",
    jungle: "#2f9e57",
  },
} as const;

export const MOODS: Record<string, Mood> = {
  tropicalMorning: {
    skyTop: "#3ea6e6", skyHorizon: "#ffe2b0", fog: "#cfe8ee", sun: "#fff1d0", sunIntensity: 2.6,
    hemiSky: "#bfe9ff", hemiGround: "#d9b77a", hemiIntensity: 1.1, fogDensity: 0.0032, stars: 0,
  },
  tropicalNoon: {
    skyTop: "#1f8fe0", skyHorizon: "#bfeaff", fog: "#bfe3ee", sun: "#ffffff", sunIntensity: 3.0,
    hemiSky: "#c9efff", hemiGround: "#e0c088", hemiIntensity: 1.2, fogDensity: 0.0017, stars: 0,
  },
  sunset: {
    skyTop: "#5b3f9e", skyHorizon: "#ff8a4c", fog: "#e9886a", sun: "#ff9a55", sunIntensity: 2.2,
    hemiSky: "#ffb28a", hemiGround: "#6b3d52", hemiIntensity: 0.9, fogDensity: 0.0038, stars: 0.1,
  },
  night: {
    skyTop: "#070b24", skyHorizon: "#22305e", fog: "#1a2448", sun: "#9db4ff", sunIntensity: 0.55,
    hemiSky: "#3b4f9a", hemiGround: "#141a30", hemiIntensity: 0.55, fogDensity: 0.0042, stars: 1,
  },
  empireGold: {
    skyTop: "#d2462e", skyHorizon: "#ffd36b", fog: "#f2b25c", sun: "#ffe0a0", sunIntensity: 2.8,
    hemiSky: "#ffd7a0", hemiGround: "#a3442e", hemiIntensity: 1.1, fogDensity: 0.0016, stars: 0,
  },
  space: {
    skyTop: "#05060f", skyHorizon: "#1a2050", fog: "#0b0f26", sun: "#fff4dc", sunIntensity: 3.0,
    hemiSky: "#4a5aa8", hemiGround: "#0a0c18", hemiIntensity: 0.7, fogDensity: 0.0, stars: 1,
  },
};

const tmpA = new Color();
const tmpB = new Color();
export const lerpHex = (a: string, b: string, t: number): string =>
  "#" + tmpA.set(a).lerp(tmpB.set(b), t).getHexString();

export const lerpMood = (a: Mood, b: Mood, t: number): Mood => ({
  skyTop: lerpHex(a.skyTop, b.skyTop, t),
  skyHorizon: lerpHex(a.skyHorizon, b.skyHorizon, t),
  fog: lerpHex(a.fog, b.fog, t),
  sun: lerpHex(a.sun, b.sun, t),
  sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t,
  hemiSky: lerpHex(a.hemiSky, b.hemiSky, t),
  hemiGround: lerpHex(a.hemiGround, b.hemiGround, t),
  hemiIntensity: a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * t,
  fogDensity: a.fogDensity + (b.fogDensity - a.fogDensity) * t,
  stars: a.stars + (b.stars - a.stars) * t,
});

// Evaluate a mood track: [[frame, moodName], …], smoothstep between keys.
export const moodAt = (frame: number, track: [number, string][]): Mood => {
  if (frame <= track[0][0]) return MOODS[track[0][1]];
  for (let k = 0; k < track.length - 1; k++) {
    const [f0, m0] = track[k];
    const [f1, m1] = track[k + 1];
    if (frame <= f1) {
      const t = (frame - f0) / Math.max(1e-6, f1 - f0);
      return lerpMood(MOODS[m0], MOODS[m1], t * t * (3 - 2 * t));
    }
  }
  return MOODS[track[track.length - 1][1]];
};
