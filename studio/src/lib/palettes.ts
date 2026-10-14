import * as THREE from 'three';
import {clamp01, smooth} from './curve';

/** Max 5 colours per episode. Everything (sky, fog, lights) is derived from these. */
export type Palette = {warm: string; cool: string; deep: string; alarm: string; light: string};

export type SkyState = {
	zenith: THREE.Color;
	horizon: THREE.Color;
	fog: THREE.Color;
	fogDensity: number;
	keyColor: THREE.Color;
	keyIntensity: number;
	hemiSky: THREE.Color;
	hemiGround: THREE.Color;
	hemiIntensity: number;
	night: number;
};

const c = (s: string) => new THREE.Color(s);

/** elev: sun elevation in [-1,1] (sin of angle). tension: 0..1 (shifts everything to the alarm colour). */
export const skyState = (p: Palette, elev: number, tension: number, baseFog = 0.006): SkyState => {
	const night = smooth((0.12 - elev) / 0.4);
	const golden = Math.exp(-Math.pow((elev - 0.05) / 0.22, 2)) * (1 - night * 0.5);
	const day = clamp01(elev * 2.2) * (1 - night);

	const zenith = c(p.cool).multiplyScalar(0.55).lerp(c(p.deep), night * 0.92).lerp(c(p.alarm).multiplyScalar(0.28), Math.pow(tension, 1.7) * 0.8);
	const horizon = c(p.cool).lerp(c(p.warm), golden).lerp(c(p.deep).lerp(c(p.cool), 0.25), night).lerp(c(p.alarm), Math.pow(tension, 1.5) * 0.75);
	const fog = horizon.clone().lerp(c(p.deep), 0.25 + night * 0.35);
	const keyColor = c(p.light).lerp(c(p.warm), golden).lerp(c(p.cool).lerp(c(p.light), 0.4), night).lerp(c(p.alarm), tension * 0.55);
	const keyIntensity = (0.7 + day * 1.9 + golden * 1.5) * (1 - night) + night * 1.5;
	const hemiSky = zenith.clone().lerp(c(p.light), 0.25 + day * 0.25);
	const hemiGround = c(p.deep).lerp(c(p.warm), golden * 0.5 + day * 0.2);
	return {
		zenith, horizon, fog,
		fogDensity: baseFog * (1 + tension * 1.2 + night * 0.5),
		keyColor, keyIntensity,
		hemiSky, hemiGround,
		hemiIntensity: 0.55 + day * 0.5 + tension * 0.1 + night * 0.5,
		night,
	};
};
