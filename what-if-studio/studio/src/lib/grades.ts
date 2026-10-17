/**
 * Cinema grades (applied in PostFX after AgX). Interpolate between them with the tension curve.
 * temp: + warm / - cool; tint: + magenta / - green; lift/gain per channel; split-tone multipliers.
 */
export type Grade = {
  temp: number; tint: number; sat: number; contrast: number;
  lift: [number, number, number]; gain: [number, number, number];
  shadows: [number, number, number]; highlights: [number, number, number];
  vignette: number; grain: number;
};

export const GRADES = {
  /** late-afternoon gold: warm highlights, teal-ish shadows, gentle contrast */
  goldenCalm: {temp: 0.6, tint: 0.05, sat: 1.08, contrast: 1.1, lift: [0.012, 0.012, 0.02], gain: [1.03, 1.0, 0.95], shadows: [0.94, 0.99, 1.04], highlights: [1.04, 1.0, 0.93], vignette: 0.28, grain: 0.022},
  /** overcast unease: cooler, flatter, slightly desaturated */
  coolUnease: {temp: -0.15, tint: -0.02, sat: 0.9, contrast: 1.1, lift: [0.01, 0.014, 0.022], gain: [0.98, 1.0, 1.03], shadows: [0.93, 0.98, 1.06], highlights: [1.0, 1.0, 1.02], vignette: 0.34, grain: 0.028},
  /** blue hour / police lights: cold blue night, crushed shadows */
  blueNight: {temp: -0.45, tint: 0.0, sat: 0.92, contrast: 1.16, lift: [0.004, 0.008, 0.02], gain: [0.95, 1.0, 1.08], shadows: [0.88, 0.95, 1.12], highlights: [1.0, 1.0, 1.04], vignette: 0.42, grain: 0.035},
  /** sodium / fire: orange-red highlights, deep teal shadows, hard contrast */
  sodiumRiot: {temp: 0.55, tint: 0.08, sat: 1.08, contrast: 1.2, lift: [0.006, 0.004, 0.008], gain: [1.08, 0.96, 0.86], shadows: [0.86, 0.96, 1.06], highlights: [1.08, 0.97, 0.86], vignette: 0.48, grain: 0.04},
  /** war: smoke-choked red, low saturation in mids, heavy grain */
  warSmoke: {temp: 0.4, tint: 0.1, sat: 0.86, contrast: 1.24, lift: [0.012, 0.006, 0.004], gain: [1.1, 0.92, 0.82], shadows: [0.9, 0.9, 0.98], highlights: [1.1, 0.95, 0.82], vignette: 0.55, grain: 0.05},
} satisfies Record<string, Grade>;

const mix3 = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t) as [number, number, number];

export const mixGrade = (a: Grade, b: Grade, t: number): Grade => ({
  temp: a.temp + (b.temp - a.temp) * t, tint: a.tint + (b.tint - a.tint) * t,
  sat: a.sat + (b.sat - a.sat) * t, contrast: a.contrast + (b.contrast - a.contrast) * t,
  lift: mix3(a.lift, b.lift, t), gain: mix3(a.gain, b.gain, t),
  shadows: mix3(a.shadows, b.shadows, t), highlights: mix3(a.highlights, b.highlights, t),
  vignette: a.vignette + (b.vignette - a.vignette) * t, grain: a.grain + (b.grain - a.grain) * t,
});

/** Grade along a keyed track: [[frame, gradeName], ...] with smoothstep blends between keys. */
export const gradeAt = (frame: number, track: [number, keyof typeof GRADES][]): Grade => {
  if (frame <= track[0][0]) return GRADES[track[0][1]];
  for (let i = 0; i < track.length - 1; i++) {
    const [f0, g0] = track[i], [f1, g1] = track[i + 1];
    if (frame < f1) {
      const t = (frame - f0) / (f1 - f0);
      return mixGrade(GRADES[g0], GRADES[g1], t * t * (3 - 2 * t));
    }
  }
  return GRADES[track[track.length - 1][1]];
};
