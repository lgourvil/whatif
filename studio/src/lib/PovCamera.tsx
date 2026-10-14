import {useThree} from '@react-three/fiber';
import React, {useLayoutEffect} from 'react';
import {spring} from 'remotion';
import {CatmullRomCurve3, Euler, PerspectiveCamera, Quaternion, Vector3, Matrix4} from 'three';
import {noise1} from './noise';

type Vec3 = [number, number, number];

export type CamKey = {
	frame: number;
	pos: Vec3;
	look: Vec3;
	fov?: number;
	/** Stop at this key (zero velocity) instead of flowing through it. */
	hold?: boolean;
};

export type PovLayers = {
	/** 0..1 walking intensity (bob + roll). */
	walk?: (frame: number) => number;
	/** 0..1 tension: drives handheld shake amplitude. */
	tension?: (frame: number) => number;
	/** Frames of impacts: damped spring kick. Strength defaults to 1. */
	impacts?: {frame: number; strength?: number}[];
	/** Extra head rotation in radians (yaw, pitch, roll), e.g. quick glances. */
	head?: (frame: number) => Vec3;
	/** Extra FOV in degrees (dolly zoom, breathing). */
	fovOffset?: (frame: number) => number;
};

export type PovState = {position: Vector3; quaternion: Quaternion; fov: number};

/**
 * Monotone cubic (Fritsch–Carlson) interpolation of the curve parameter u over
 * frames: velocity is continuous through keys, except keys flagged `hold`.
 */
const paramAt = (frame: number, keys: CamKey[]): number => {
	const n = keys.length;
	if (frame <= keys[0].frame) return 0;
	if (frame >= keys[n - 1].frame) return n - 1;
	let i = 0;
	while (frame > keys[i + 1].frame) i++;
	const slope = (k: number) => 1 / Math.max(1, keys[k + 1].frame - keys[k].frame);
	const tangent = (k: number) => {
		if (keys[k].hold || k === 0 || k === n - 1) return 0;
		const a = slope(k - 1);
		const b = slope(k);
		return (2 * a * b) / (a + b); // harmonic mean keeps it monotone
	};
	const h = keys[i + 1].frame - keys[i].frame;
	const t = (frame - keys[i].frame) / h;
	const m0 = tangent(i) * h;
	const m1 = tangent(i + 1) * h;
	const t2 = t * t;
	const t3 = t2 * t;
	return (
		i +
		(2 * t3 - 3 * t2 + 1) * 0 +
		(t3 - 2 * t2 + t) * m0 +
		(-2 * t3 + 3 * t2) * 1 +
		(t3 - t2) * m1
	);
};

const curveCache = new WeakMap<CamKey[], {pos: CatmullRomCurve3; look: CatmullRomCurve3}>();
const curvesFor = (keys: CamKey[]) => {
	const hit = curveCache.get(keys);
	if (hit) return hit;
	const c = {
		pos: new CatmullRomCurve3(keys.map((k) => new Vector3(...k.pos)), false, 'centripetal'),
		look: new CatmullRomCurve3(keys.map((k) => new Vector3(...k.look)), false, 'centripetal'),
	};
	curveCache.set(keys, c);
	return c;
};

const fovAt = (frame: number, keys: CamKey[]) => {
	const u = paramAt(frame, keys);
	const i = Math.min(keys.length - 2, Math.floor(u));
	const t = u - i;
	const a = keys[i].fov ?? 70;
	const b = keys[i + 1].fov ?? 70;
	return a + (b - a) * t;
};

const m4 = new Matrix4();
const up = new Vector3(0, 1, 0);

/** Pure function: everything about the POV camera at a frame. */
export const povState = (
	frame: number,
	fps: number,
	keys: CamKey[],
	layers: PovLayers = {},
): PovState => {
	const {pos, look} = curvesFor(keys);
	const u = paramAt(frame, keys) / (keys.length - 1);
	const position = pos.getPoint(u);
	const target = look.getPoint(u);

	// Walk: vertical bob at step cadence (~1.9 steps/s) + gentle roll.
	const walk = layers.walk ? layers.walk(frame) : 0;
	const stepPhase = (frame / fps) * Math.PI * 1.9;
	position.y += walk * Math.abs(Math.sin(stepPhase)) * 0.045;
	let roll = walk * Math.sin(stepPhase) * 0.012;

	// Handheld: smoothed noise, amplitude rising with tension.
	const tension = layers.tension ? layers.tension(frame) : 0;
	const amp = 0.0035 + tension * 0.03;
	const s = frame / fps;
	let yaw = noise1('yaw', s * 0.9) * amp + noise1('yaw2', s * 7) * amp * tension * 0.6;
	let pitch = noise1('pitch', s * 0.8) * amp + noise1('pitch2', s * 6.3) * amp * tension * 0.6;
	roll += noise1('roll', s * 0.6) * amp * 0.6;

	// Impacts: damped spring kick (fast up, wobbly settle).
	for (const imp of layers.impacts ?? []) {
		if (frame < imp.frame || frame > imp.frame + 50) continue;
		const sp = spring({frame: frame - imp.frame, fps, config: {damping: 7, stiffness: 180, mass: 0.6}});
		const kick = (1 - sp) * (imp.strength ?? 1);
		pitch += kick * 0.06 * Math.cos((frame - imp.frame) * 1.3);
		roll += kick * 0.04 * Math.sin((frame - imp.frame) * 1.1);
		position.y -= kick * 0.05;
	}

	if (layers.head) {
		const [hy, hp, hr] = layers.head(frame);
		yaw += hy;
		pitch += hp;
		roll += hr;
	}

	m4.lookAt(position, target, up);
	const quaternion = new Quaternion().setFromRotationMatrix(m4);
	quaternion.multiply(new Quaternion().setFromEuler(new Euler(pitch, yaw, roll, 'YXZ')));

	const fov = fovAt(frame, keys) + (layers.fovOffset ? layers.fovOffset(frame) : 0);
	return {position, quaternion, fov};
};

/** Applies a PovState to the default R3F camera (before R3F advances). */
export const PovCamera: React.FC<{state: PovState; near?: number; far?: number}> = ({
	state,
	near = 0.05,
	far = 4000,
}) => {
	const camera = useThree((s) => s.camera) as PerspectiveCamera;
	useLayoutEffect(() => {
		camera.position.copy(state.position);
		camera.quaternion.copy(state.quaternion);
		camera.fov = state.fov;
		camera.near = near;
		camera.far = far;
		camera.updateProjectionMatrix();
		camera.updateMatrixWorld();
	});
	return null;
};

/** A group glued to the camera: children are in camera space (POV hands, HUD props). */
export const CameraAttached: React.FC<{state: PovState; children: React.ReactNode}> = ({
	state,
	children,
}) => (
	<group position={state.position} quaternion={state.quaternion}>
		{children}
	</group>
);
