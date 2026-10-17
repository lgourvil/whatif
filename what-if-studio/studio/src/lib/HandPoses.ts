import {spring} from 'remotion';

/**
 * Named hand poses. Angles in DEGREES (converted at use).
 * f: [index, middle, ring, little] -> [splay, mcp, pip, dip]  (splay: + toward the little finger side)
 * t: thumb -> [abduct (away from palm plane), cmcFlex (across the palm), mcp, ip]
 * cup: extra flexion of the ring/little metacarpals (palm cupping, grip arch).
 */
export type HandPose = {f: [number, number, number, number][]; t: [number, number, number, number]; cup: number};

const P = (f: HandPose['f'], t: HandPose['t'], cup = 0): HandPose => ({f, t, cup});

export const POSES = {
  relaxed: P([[-4, 14, 22, 10], [0, 18, 28, 14], [4, 22, 32, 16], [9, 26, 36, 18]], [18, 14, 10, 12], 4),
  open: P([[-9, 4, 4, 2], [-1, 3, 3, 2], [6, 4, 5, 3], [13, 6, 6, 4]], [30, 2, 6, 6], 0),
  reach: P([[-6, 8, 10, 6], [0, 9, 12, 7], [5, 11, 15, 8], [10, 14, 18, 10]], [32, 6, 8, 10], 2),
  /** wraps a ~32 mm handle (fuel nozzle grip) */
  grip: P([[-2, 58, 80, 42], [0, 62, 84, 44], [2, 66, 86, 46], [5, 70, 88, 48]], [20, 42, 20, 26], 10),
  /** grip with the index pulling the nozzle lever */
  squeeze: P([[-2, 66, 92, 50], [0, 68, 92, 48], [2, 70, 92, 50], [5, 74, 92, 52]], [20, 44, 22, 30], 12),
  point: P([[-3, 2, 4, 3], [2, 82, 100, 58], [4, 86, 100, 60], [7, 88, 98, 58]], [16, 44, 26, 34], 8),
  palm_out: P([[-8, -6, -4, 0], [-1, -6, -4, 0], [5, -6, -4, 0], [12, -4, -3, 0]], [32, -6, 0, 0], 0),
  shield_eyes: P([[-1, 10, 10, 6], [0, 10, 10, 6], [1, 12, 12, 6], [3, 14, 14, 8]], [14, 18, 6, 6], 4),
  brace: P([[-11, 24, 34, 20], [-2, 22, 32, 18], [6, 24, 34, 20], [14, 28, 36, 22]], [44, 8, 14, 12], 6),
  touch_surface: P([[-3, 12, 16, -6], [0, 14, 18, -6], [3, 16, 20, -4], [7, 20, 24, 0]], [30, 10, 6, -4], 2),
  /** thumb + index pinch (holding cloth), other fingers loosely curled */
  pinch: P([[-1, 42, 46, 26], [1, 56, 74, 40], [3, 62, 80, 44], [6, 66, 84, 46]], [22, 34, 22, 26], 8),
  fist: P([[-1, 86, 100, 64], [1, 88, 102, 64], [2, 90, 102, 64], [4, 92, 100, 62]], [12, 50, 30, 40], 14),
  count_one: P([[-3, 2, 4, 3], [2, 82, 100, 58], [4, 86, 100, 60], [7, 88, 98, 58]], [16, 44, 26, 34], 8),
};
export type PoseName = keyof typeof POSES;

export type PoseKey = {frame: number; pose: PoseName; stiffness?: number};

const lerpPose = (a: HandPose, b: HandPose, t: number): HandPose => ({
  f: a.f.map((fa, i) => fa.map((v, k) => v + (b.f[i][k] - v) * t) as [number, number, number, number]),
  t: a.t.map((v, k) => v + (b.t[k] - v) * t) as HandPose['t'],
  cup: a.cup + (b.cup - a.cup) * t,
});

/**
 * Pose at a frame from a list of keys. Each finger (and the thumb) starts its
 * spring a few frames after the previous one, so fingers never move in unison.
 */
export const poseAt = (frame: number, fps: number, keys: PoseKey[]): HandPose => {
  let cur = POSES[keys[0].pose];
  const out: HandPose = JSON.parse(JSON.stringify(cur));
  // build per-digit evaluation: digit d lags by d*lag frames
  const digits = 5;
  for (let d = 0; d < digits; d++) {
    let state = POSES[keys[0].pose];
    for (let k = 1; k < keys.length; k++) {
      const key = keys[k];
      const lag = d === 4 ? 1 : 2 + d * 2; // thumb leads, then index → little
      const local = frame - key.frame - lag;
      if (local < 0) break;
      const s = spring({frame: local, fps, config: {damping: 14, stiffness: key.stiffness ?? 120, mass: 0.6}});
      state = lerpPose(state, POSES[key.pose], Math.min(1.08, s));
    }
    if (d < 4) out.f[d] = state.f[d];
    else { out.t = state.t; out.cup = state.cup; }
  }
  cur = out;
  return cur;
};

/** Add tremble/breathing noise to a pose (deg). */
export const tremble = (p: HandPose, n: (seed: string) => number, amp: number): HandPose => ({
  f: p.f.map((f, i) => [f[0], f[1] + n(`m${i}`) * amp, f[2] + n(`p${i}`) * amp * 1.2, f[3] + n(`d${i}`) * amp * 0.8]) as HandPose['f'],
  t: [p.t[0] + n('ta') * amp, p.t[1] + n('tf') * amp, p.t[2] + n('tm') * amp, p.t[3] + n('ti') * amp],
  cup: p.cup,
});
