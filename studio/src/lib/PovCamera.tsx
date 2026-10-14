import React, {useLayoutEffect} from 'react';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {noise1, shock, smooth} from './curve';

export type CamKey = {f: number; pos: [number, number, number]; target: [number, number, number]};

export type RigConfig = {
	keys: CamKey[];
	loopFrames: number;
	/** 0..1 handheld/tension amplitude as a function of frame */
	tension: (f: number) => number;
	/** footstep cadence in Hz as a function of frame, and walking amplitude (0 = still) */
	walk: (f: number) => {hz: number; amp: number};
	/** extra roll/pitch/yaw offsets (radians) for head movements */
	head?: (f: number) => {yaw: number; pitch: number; roll: number};
	impacts: Array<{frame: number; strength: number}>;
	fov: (f: number) => number;
	fps: number;
};

export type Pov = {pos: THREE.Vector3; quat: THREE.Quaternion; fov: number};

const hermite = (p0: number, p1: number, m0: number, m1: number, t: number) => {
	const t2 = t * t, t3 = t2 * t;
	return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
};

/** Catmull-Rom through the keys (non-uniform time), eased to stop smoothly at key tangents. */
const sample = (ks: CamKey[], f: number, which: 'pos' | 'target'): THREE.Vector3 => {
	const n = ks.length;
	if (f <= ks[0].f) return new THREE.Vector3(...ks[0][which]);
	if (f >= ks[n - 1].f) return new THREE.Vector3(...ks[n - 1][which]);
	let i = 0;
	while (i < n - 2 && f > ks[i + 1].f) i++;
	const a = ks[i], b = ks[i + 1];
	const dt = b.f - a.f;
	const t = (f - a.f) / dt;
	const prev = ks[Math.max(0, i - 1)], next = ks[Math.min(n - 1, i + 2)];
	const out = new THREE.Vector3();
	for (let k = 0; k < 3; k++) {
		const m0 = i === 0 ? 0 : ((b[which][k] - prev[which][k]) / (b.f - prev.f)) * dt;
		const m1 = i + 2 >= n ? 0 : ((next[which][k] - a[which][k]) / (next.f - a.f)) * dt;
		out.setComponent(k, hermite(a[which][k], b[which][k], m0, m1, t));
	}
	return out;
};

const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);

export const computePov = (cfg: RigConfig, f: number): Pov => {
	const pos = sample(cfg.keys, f, 'pos');
	const target = sample(cfg.keys, f, 'target');
	const t = cfg.tension(f);
	const period = cfg.loopFrames / 30;

	// walk bob: vertical sine at step cadence + half-rate roll
	const {hz, amp} = cfg.walk(f);
	const ph = (f / cfg.fps) * hz * Math.PI * 2;
	pos.y += Math.sin(ph) * 0.045 * amp * (1 + t * 0.6);
	const roll = Math.sin(ph * 0.5) * 0.012 * amp * (1 + t);

	// breathing (integer cycles over the loop so frame 0 == last frame)
	const breath = Math.sin((f / cfg.loopFrames) * Math.PI * 2 * Math.round(period / 4.5));
	pos.y += breath * 0.012;

	// handheld micro-shake: smoothed noise, amplitude grows with tension
	const hh = (0.0016 + t * t * 0.012);
	const nx = noise1(f / 5, 'hx', cfg.loopFrames / 5) * hh;
	const ny = noise1(f / 5, 'hy', cfg.loopFrames / 5) * hh;
	const nz = noise1(f / 7, 'hr', cfg.loopFrames / 7) * hh * 0.8;

	// impacts (damped springs)
	let sx = 0, sy = 0;
	for (const im of cfg.impacts) {
		sy += shock(f, im.frame, im.strength * 0.045);
		sx += shock(f, im.frame + 2, im.strength * 0.03, 12, 1.3);
	}

	const head = cfg.head?.(f) ?? {yaw: 0, pitch: 0, roll: 0};

	_m.lookAt(pos, target, _up);
	const quat = new THREE.Quaternion().setFromRotationMatrix(_m);
	const e = new THREE.Euler(head.pitch + ny + sy, head.yaw + nx + sx, head.roll + roll + nz, 'YXZ');
	quat.multiply(new THREE.Quaternion().setFromEuler(e));
	pos.y += sy * 0.6;
	return {pos, quat, fov: cfg.fov(f)};
};

export const PovCamera: React.FC<{pov: Pov}> = ({pov}) => {
	const {camera} = useThree();
	useLayoutEffect(() => {
		camera.position.copy(pov.pos);
		camera.quaternion.copy(pov.quat);
		const c = camera as THREE.PerspectiveCamera;
		if (c.fov !== pov.fov) {
			c.fov = pov.fov;
			c.updateProjectionMatrix();
		}
		camera.updateMatrixWorld();
	});
	return null;
};

export {smooth};
