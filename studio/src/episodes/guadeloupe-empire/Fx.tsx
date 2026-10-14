import React, { useMemo } from "react";
import { MeshBasicMaterial, OctahedronGeometry, PlaneGeometry, TetrahedronGeometry } from "three";
import { Particles, type ParticleState } from "../../lib/Particles";
import { hash } from "../../lib/noise";
import { PALETTES } from "../../lib/palettes";
import { PLACES, flagEvents, SKYLINE_FLAG } from "./Places";
import { SAIL_START, boatX, boatZ } from "./world";

const PAL = PALETTES.guadeloupeEmpire;
const SPARK_COLORS = [PAL.madrasRed, PAL.madrasYellow, "#7dffa0", "#ffffff", "#ff8fd0"];

// Fireworks over Dominica the night it signs.
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const dom = PLACES.find((p) => p.name === "Dominica")!;
export const BURSTS = [0, 1, 2, 3, 4, 5, 6].map((k) => ({
  at: 868 + k * 21,
  c: [dom.pos[0] - 40 + (hash(k * 3) - 0.5) * 110, 90 + hash(k * 5) * 60, dom.pos[2] + 20 + (hash(k * 7) - 0.5) * 60] as [number, number, number],
  color: SPARK_COLORS[k % SPARK_COLORS.length],
}));
const SPARKS = 160;
const sparkGeo = new OctahedronGeometry(0.9, 0);

export const Fireworks: React.FC<{ wf: number }> = ({ wf }) => {
  const mat = useMemo(() => new MeshBasicMaterial({ color: "#ffffff", toneMapped: false, fog: false }), []);
  const fn = (i: number, fr: number, o: ParticleState) => {
    const b = BURSTS[Math.floor(i / SPARKS)];
    const age = (fr - b.at) / 30;
    if (age < 0 || age > 1.9) { o.s = 0; o.x = o.y = o.z = 0; return; }
    const u = hash(i * 1.17), v = hash(i * 2.31);
    const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1);
    const sp = 48 * (0.85 + hash(i * 3.3) * 0.3);
    const d = (1 - Math.exp(-age * 2.4)) / 2.4;
    o.x = b.c[0] + Math.sin(ph) * Math.cos(th) * sp * d;
    o.y = b.c[1] + Math.cos(ph) * sp * d - 6 * age * age;
    o.z = b.c[2] + Math.sin(ph) * Math.sin(th) * sp * d;
    o.s = Math.max(0, 1 - age / 1.9) * (1.8 + hash(i) * 1.2);
    o.color = hash(i * 9.9) < 0.15 ? "#ffffff" : b.color;
  };
  return <Particles count={BURSTS.length * SPARKS} geometry={sparkGeo} material={mat} frame={wf} fn={fn} colored />;
};

// Confetti at each flag raising (plus the skyline banner), fluttering down.
const confettiGeo = new PlaneGeometry(1, 0.6);
const PER = 70;
export const Confetti: React.FC<{ wf: number }> = ({ wf }) => {
  const evs = useMemo(() => [...flagEvents(), { at: 1430, pos: SKYLINE_FLAG, size: 40 }], []);
  const mat = useMemo(() => new MeshBasicMaterial({ color: "#ffffff", side: 2 }), []);
  const fn = (i: number, fr: number, o: ParticleState) => {
    const e = evs[Math.floor(i / PER)];
    const age = (fr - e.at) / 30;
    if (age < 0 || age > 3.2) { o.s = 0; o.x = o.y = o.z = 0; return; }
    const a = hash(i * 1.9) * Math.PI * 2;
    const sp = e.size * (0.5 + hash(i * 2.2) * 0.9);
    const d = (1 - Math.exp(-age * 3)) / 3;
    o.x = e.pos[0] + Math.cos(a) * sp * d * 2 + Math.sin(age * 5 + i) * e.size * 0.05;
    o.z = e.pos[2] + Math.sin(a) * sp * d * 2;
    o.y = e.pos[1] + sp * d * 1.5 - age * e.size * 0.35;
    o.s = e.size * 0.07 * Math.min(1, (3.2 - age) * 2);
    o.rx = age * 7 + i;
    o.ry = age * 5 + i * 0.3;
    o.color = SPARK_COLORS[i % 4];
  };
  return <Particles count={evs.length * PER} geometry={confettiGeo} material={mat} frame={wf} fn={fn} colored />;
};

// Bow spray + wake flecks around the player's boat while sailing.
const sprayGeo = new TetrahedronGeometry(1, 0);
export const Spray: React.FC<{ wf: number; f: number }> = ({ wf, f }) => {
  const mat = useMemo(() => new MeshBasicMaterial({ color: "#f2fdff" }), []);
  const on = wf > SAIL_START + 10 && wf < 1660;
  const bx = boatX(wf), bz = boatZ(wf);
  const fn = (i: number, fr: number, o: ParticleState) => {
    if (!on) { o.s = 0; return; }
    const p = (hash(i * 3.7) + fr / 18) % 1;
    const side = i % 2 === 0 ? -1 : 1;
    o.x = bx + side * (1.0 + p * 3.2 + hash(i) * 0.5);
    o.y = 0.1 + Math.sin(Math.PI * p) * (0.6 + hash(i * 2) * 0.5);
    o.z = bz - 3.6 + p * 9 + hash(i * 5) * 0.6;
    o.s = 0.05 * (1 - p) + 0.015;
    o.rx = p * 9;
  };
  return <Particles count={160} geometry={sprayGeo} material={mat} frame={f} fn={fn} />;
};
