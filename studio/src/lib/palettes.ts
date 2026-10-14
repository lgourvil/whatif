import {Color} from 'three';

/**
 * An episode palette: 5 colours maximum. Everything else (sky, fog, lights,
 * props) is derived from these by mixing, so the frame always stays coherent.
 */
export type Palette = {
	ink: string; // deep shadows, night, outlines tint
	sky: string; // daylight sky, cool accents
	grass: string; // ground, vegetation
	clay: string; // warm accent: roofs, wood, sunset, tension
	cream: string; // highlights, sunlight, walls
};

/** A mood is what the lights/sky/fog look like at a given moment. */
export type Mood = {
	zenith: string;
	horizon: string;
	fog: string;
	fogDensity: number;
	sun: string;
	sunIntensity: number;
	hemiSky: string;
	hemiGround: string;
	hemiIntensity: number;
	accent: string; // point-light accent colour (power glow, fire, neon)
	accentIntensity: number;
	stars: number; // 0..1
};

const tmpA = new Color();
const tmpB = new Color();

export const mixHex = (a: string, b: string, t: number): string => {
	tmpA.set(a);
	tmpB.set(b);
	return '#' + tmpA.lerp(tmpB, Math.min(1, Math.max(0, t))).getHexString();
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const mixMood = (a: Mood, b: Mood, t: number): Mood => ({
	zenith: mixHex(a.zenith, b.zenith, t),
	horizon: mixHex(a.horizon, b.horizon, t),
	fog: mixHex(a.fog, b.fog, t),
	fogDensity: lerp(a.fogDensity, b.fogDensity, t),
	sun: mixHex(a.sun, b.sun, t),
	sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
	hemiSky: mixHex(a.hemiSky, b.hemiSky, t),
	hemiGround: mixHex(a.hemiGround, b.hemiGround, t),
	hemiIntensity: lerp(a.hemiIntensity, b.hemiIntensity, t),
	accent: mixHex(a.accent, b.accent, t),
	accentIntensity: lerp(a.accentIntensity, b.accentIntensity, t),
	stars: lerp(a.stars, b.stars, t),
});

/**
 * Sample a mood track: keys sorted by frame, smoothstep blend between them.
 * All sky / fog / light colours move together this way.
 */
export const sampleMoods = (
	frame: number,
	keys: {frame: number; mood: Mood}[],
): Mood => {
	if (frame <= keys[0].frame) return keys[0].mood;
	for (let i = 0; i < keys.length - 1; i++) {
		const a = keys[i];
		const b = keys[i + 1];
		if (frame <= b.frame) {
			const t = (frame - a.frame) / Math.max(1, b.frame - a.frame);
			return mixMood(a.mood, b.mood, t * t * (3 - 2 * t));
		}
	}
	return keys[keys.length - 1].mood;
};

/** Episode 1 (2026-10-14, telekinesis): soft storybook garden. */
export const TELEKINESIS: Palette = {
	ink: '#221d3f',
	sky: '#8cc8ff',
	grass: '#7cbf5f',
	clay: '#e8774d',
	cream: '#fff0d4',
};

/** Builds the standard set of moods (dawn, day, sunset, night, tension) from a palette. */
export const moodsFromPalette = (p: Palette) => {
	const morning: Mood = {
		zenith: mixHex(p.sky, p.ink, 0.12),
		horizon: mixHex(p.cream, p.clay, 0.18),
		fog: mixHex(p.cream, p.sky, 0.45),
		fogDensity: 0.0075,
		sun: mixHex(p.cream, p.clay, 0.2),
		sunIntensity: 2.6,
		hemiSky: mixHex(p.sky, p.cream, 0.3),
		hemiGround: mixHex(p.grass, p.ink, 0.35),
		hemiIntensity: 1.25,
		accent: mixHex(p.sky, p.cream, 0.4),
		accentIntensity: 0,
		stars: 0,
	};
	const day: Mood = {
		...morning,
		zenith: mixHex(p.sky, p.ink, 0.22),
		horizon: mixHex(p.sky, p.cream, 0.55),
		fog: mixHex(p.sky, p.cream, 0.5),
		fogDensity: 0.0045,
		sun: p.cream,
		sunIntensity: 3.0,
		hemiIntensity: 1.35,
	};
	const sunset: Mood = {
		zenith: mixHex(p.ink, p.sky, 0.35),
		horizon: mixHex(p.clay, p.cream, 0.25),
		fog: mixHex(p.clay, p.cream, 0.45),
		fogDensity: 0.004,
		sun: mixHex(p.clay, p.cream, 0.35),
		sunIntensity: 2.4,
		hemiSky: mixHex(p.clay, p.sky, 0.45),
		hemiGround: mixHex(p.ink, p.grass, 0.35),
		hemiIntensity: 1.05,
		accent: mixHex(p.sky, p.cream, 0.4),
		accentIntensity: 0,
		stars: 0.15,
	};
	const night: Mood = {
		zenith: mixHex(p.ink, '#000000', 0.45),
		horizon: mixHex(p.ink, p.sky, 0.3),
		fog: mixHex(p.ink, p.sky, 0.18),
		fogDensity: 0.004,
		sun: mixHex(p.sky, p.cream, 0.5), // moonlight
		sunIntensity: 0.9,
		hemiSky: mixHex(p.ink, p.sky, 0.45),
		hemiGround: mixHex(p.ink, '#000000', 0.4),
		hemiIntensity: 0.75,
		accent: mixHex(p.sky, p.cream, 0.3),
		accentIntensity: 0,
		stars: 1,
	};
	const tension: Mood = {
		zenith: mixHex(p.ink, '#000000', 0.3),
		horizon: mixHex(p.clay, p.ink, 0.25),
		fog: mixHex(p.clay, p.ink, 0.45),
		fogDensity: 0.006,
		sun: mixHex(p.clay, p.cream, 0.25),
		sunIntensity: 1.3,
		hemiSky: mixHex(p.clay, p.ink, 0.3),
		hemiGround: mixHex(p.ink, '#000000', 0.3),
		hemiIntensity: 0.8,
		accent: mixHex(p.clay, '#ff2a1a', 0.5),
		accentIntensity: 0,
		stars: 0.7,
	};
	return {morning, day, sunset, night, tension};
};
