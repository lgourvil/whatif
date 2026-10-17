import * as THREE from 'three';
import {random} from 'remotion';
import {Puff} from '../../lib/Particles';
import {smoothstep} from '../../lib/anim';

/**
 * Closed-form particle emitters: particle k is born at t_k = start + k / rate and lives `life` frames.
 * Its state is a pure function of (frame, k) — no accumulation, so any frame renders identically.
 */
export type Emitter = {
  seed: string;
  start: number;
  end: number;
  rate: number; // particles / frame
  life: number; // frames
  origin: (tBirth: number, k: number) => THREE.Vector3;
  /** strength at birth time (0..1) — scales size/alpha */
  strength?: (tBirth: number) => number;
  rise: number; // m / frame
  wind: THREE.Vector3; // m / frame
  spread: number; // m (initial jitter radius)
  size0: number;
  growth: number; // m / frame
  alpha: number;
  turb?: number;
  tint?: (age01: number, k: number) => THREE.Color;
  fadeIn?: number;
};

export const emit = (frame: number, e: Emitter, out: Puff[], max = 9999) => {
  const t0 = Math.max(e.start, frame - e.life);
  const t1 = Math.min(frame, e.end);
  if (t1 < t0) return;
  const k0 = Math.ceil((t0 - e.start) * e.rate), k1 = Math.floor((t1 - e.start) * e.rate);
  for (let k = k0; k <= k1 && out.length < max; k++) {
    const birth = e.start + k / e.rate;
    const age = frame - birth;
    if (age < 0 || age > e.life) continue;
    const a01 = age / e.life;
    const str = e.strength ? e.strength(birth) : 1;
    if (str <= 0.01) continue;
    const r = (n: number) => random(`${e.seed}-${k}-${n}`);
    const o = e.origin(birth, k);
    const turb = e.turb ?? 0.3;
    const p = new THREE.Vector3(
      o.x + (r(0) - 0.5) * e.spread + e.wind.x * age + Math.sin(age * 0.05 + r(3) * 6) * turb * a01,
      o.y + (r(1) - 0.5) * e.spread * 0.4 + e.rise * age * (1 - a01 * 0.35),
      o.z + (r(2) - 0.5) * e.spread + e.wind.z * age + Math.cos(age * 0.043 + r(4) * 6) * turb * a01,
    );
    const fade = smoothstep(0, e.fadeIn ?? 0.08, a01) * (1 - smoothstep(0.55, 1, a01));
    out.push({
      p,
      size: (e.size0 + e.growth * age) * (0.7 + r(5) * 0.6) * (0.5 + 0.5 * str),
      alpha: e.alpha * fade * str * (0.6 + r(6) * 0.4),
      rot: r(7) * 6.28 + age * (r(8) - 0.5) * 0.02,
      seed: r(9),
      tint: e.tint ? e.tint(a01, k) : undefined,
    });
  }
};

/** Ember/spark points (closed form), rising from a source with drift and flicker. */
export const embers = (frame: number, seed: string, src: THREE.Vector3, start: number, end: number, rate: number, life: number, out: {p: THREE.Vector3; s: number}[], wind: THREE.Vector3, power = 1) => {
  const t0 = Math.max(start, frame - life), t1 = Math.min(frame, end);
  if (t1 < t0) return;
  const k0 = Math.ceil((t0 - start) * rate), k1 = Math.floor((t1 - start) * rate);
  for (let k = k0; k <= k1; k++) {
    const birth = start + k / rate, age = frame - birth;
    if (age < 0 || age > life) continue;
    const r = (n: number) => random(`${seed}-${k}-${n}`);
    const a = age / life;
    const v = 0.03 + r(1) * 0.06 * power;
    out.push({
      p: new THREE.Vector3(
        src.x + (r(2) - 0.5) * 1.2 + wind.x * age + Math.sin(age * 0.2 + r(3) * 9) * 0.3 * a,
        src.y + 0.4 + v * age - 0.00012 * age * age,
        src.z + (r(4) - 0.5) * 1.2 + wind.z * age + Math.cos(age * 0.17 + r(5) * 9) * 0.3 * a,
      ),
      s: (0.012 + r(6) * 0.02) * (1 - a) * (0.6 + 0.4 * Math.sin(age * 0.9 + r(7) * 6)),
    });
  }
};
