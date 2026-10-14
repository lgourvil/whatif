import React, {useMemo} from 'react';
import {useCurrentFrame, useVideoConfig, random} from 'remotion';
import {Euler, Object3D, Vector3} from 'three';
import {Moss, Pip, PovHands, PovLegs} from '../../lib/Characters';
import {fbm1, ramp, smooth, windowRamp} from '../../lib/noise';
import {TELEKINESIS as PAL, mixHex, mixMood, moodsFromPalette, Mood} from '../../lib/palettes';
import {Particles} from '../../lib/Particles';
import {CamKey, CameraAttached, PovCamera, povState} from '../../lib/PovCamera';
import {Car, Chair, Fence, FlowerPot, GEO, House, Mug, Table, Tree} from '../../lib/Props';
import {Fog, Sky, sunDirection} from '../../lib/Sky';
import {ToonMesh} from '../../lib/ToonMesh';
import {SHADOWS} from '../../lib/ToonMaterial';
import {track} from '../../lib/track';
import timeline from './timeline.json';

type Vec3 = [number, number, number];
const K = (keys: number[][]) => keys as [number, number][];

export const tensionAt = (f: number) => track(f, K(timeline.tension));
export const powerAt = (f: number) => track(f, K(timeline.power));
export const IMPACTS = timeline.impacts;

/** One continuous shot. Keys flagged `hold` stop; the rest flow through. */
export const CAM_KEYS: CamKey[] = [
	{frame: 0, pos: [0, 1.55, 2.0], look: [0, 0.95, 0.55], fov: 70, hold: true},
	{frame: 150, pos: [0, 1.53, 1.92], look: [0, 0.96, 0.55], fov: 69},
	{frame: 330, pos: [0, 1.5, 1.8], look: [0, 0.99, 0.55], fov: 64},
	{frame: 470, pos: [0, 1.5, 1.78], look: [0, 1.22, 0.55], fov: 67},
	{frame: 570, pos: [0.1, 1.6, 1.85], look: [-2.3, 1.5, -1.3], fov: 72},
	{frame: 680, pos: [0.1, 1.62, 1.85], look: [-2.3, 1.4, -6.5], fov: 66},
	{frame: 790, pos: [0.1, 1.64, 1.85], look: [-0.6, 2.6, -3.0], fov: 74},
	{frame: 860, pos: [0, 1.62, 1.9], look: [0, 0, 0.45], fov: 78},
	{frame: 940, pos: [0, 4.8, 1.9], look: [0, 0, 0.1], fov: 80},
	{frame: 1050, pos: [2, 21, 5], look: [8, 13, -30], fov: 76},
	{frame: 1170, pos: [5, 47, 10], look: [20, 35, -40], fov: 72},
	{frame: 1350, pos: [10, 60, 8], look: [-35, 50, -15], fov: 72},
	{frame: 1530, pos: [8, 62, 6], look: [0, 78, -60], fov: 72},
	{frame: 1700, pos: [8, 64, 6], look: [2, 108, -80], fov: 80},
	{frame: 1840, pos: [8, 65, 6], look: [2, 116, -80], fov: 88},
	{frame: 1900, pos: [8, 62, 6], look: [0, 70, -60], fov: 72},
	{frame: 1990, pos: [5, 30, 8], look: [0, 6, -30], fov: 70},
	{frame: 2072, pos: [0, 1.62, 2.1], look: [-0.3, 0.9, 0.2], fov: 72},
	{frame: 2140, pos: [0, 1.58, 2.05], look: [-1.0, 1.0, 0.45], fov: 70},
	{frame: 2208, pos: [0, 1.55, 2.0], look: [0, 0.95, 0.55], fov: 70, hold: true},
	{frame: 2250, pos: [0, 1.55, 2.0], look: [0, 0.95, 0.55], fov: 70, hold: true},
];

/** Time of day (integer part = day count). 0.30 at both ends -> perfect loop. */
export const dayTimeAt = (f: number) =>
	track(f, [
		[0, 0.3],
		[150, 0.31],
		[200, 0.42],
		[460, 4.3],
		[480, 4.33],
		[840, 4.42],
		[1170, 4.56],
		[1400, 4.7],
		[1530, 4.8],
		[1700, 4.96],
		[1860, 5.02],
		[2100, 5.27],
		[2250, 5.3],
	]);

const MOODS = moodsFromPalette(PAL);
/** M6 (moon) tension mood, released in M7. */
export const redAt = (f: number) => ramp(f, 1580, 1780) * (1 - ramp(f, 1880, 1990));

const moodAt = (f: number, elev: number): Mood => {
	let base: Mood;
	if (elev < -0.2) base = MOODS.night;
	else if (elev < 0.04) base = mixMood(MOODS.night, MOODS.sunset, smooth((elev + 0.2) / 0.24));
	else if (elev < 0.35) base = mixMood(MOODS.sunset, MOODS.morning, smooth((elev - 0.04) / 0.31));
	else base = mixMood(MOODS.morning, MOODS.day, smooth((elev - 0.35) / 0.4));
	return mixMood(base, MOODS.tension, redAt(f) * 0.85);
};

/* ------------------------------------------------------------------ */
/* World layout (deterministic, computed once)                         */
/* ------------------------------------------------------------------ */

const GARDEN_ITEMS: {kind: 'chair' | 'pot' | 'crate' | 'ball' | 'bucket'; pos: Vec3; rot: number; color: string}[] = [
	{kind: 'chair', pos: [-2.2, 0, -0.6], rot: 0.7, color: mixHex(PAL.sky, PAL.ink, 0.25)},
	{kind: 'pot', pos: [-2.4, 0, -1.3], rot: 0, color: PAL.clay},
	{kind: 'pot', pos: [0.5, 0, -2.6], rot: 1, color: mixHex(PAL.clay, PAL.cream, 0.3)},
	{kind: 'pot', pos: [2.6, 0, -3.2], rot: 2, color: PAL.clay},
	{kind: 'pot', pos: [-3.4, 0, 0.4], rot: 3, color: mixHex(PAL.clay, PAL.ink, 0.2)},
	{kind: 'crate', pos: [2.4, 0, -4.6], rot: 0.4, color: mixHex(PAL.clay, PAL.cream, 0.5)},
	{kind: 'crate', pos: [3.3, 0, -5.4], rot: 1.2, color: mixHex(PAL.clay, PAL.cream, 0.5)},
	{kind: 'ball', pos: [-0.4, 0, -4.6], rot: 0, color: PAL.sky},
	{kind: 'bucket', pos: [-3.0, 0, -2.4], rot: 0, color: mixHex(PAL.sky, PAL.cream, 0.4)},
];

type HouseRec = {x: number; z: number; w: number; h: number; d: number; rot: number; wall: string; roof: string};
const TOWN: HouseRec[] = (() => {
	const out: HouseRec[] = [];
	const cell = 13;
	for (let gx = -12; gx <= 12; gx++) {
		for (let gz = -12; gz <= 12; gz++) {
			if (gx % 4 === 0 || gz % 4 === 0) continue; // roads
			const x = gx * cell + (random(`hx${gx},${gz}`) - 0.5) * 3;
			const z = gz * cell + (random(`hz${gx},${gz}`) - 0.5) * 3;
			if (Math.abs(x) < 18 && z > -22 && z < 16) continue; // our garden block
			if (random(`hk${gx},${gz}`) < 0.18) continue; // gaps / parks
			const r = random(`hr${gx},${gz}`);
			out.push({
				x,
				z,
				w: 5 + r * 3,
				h: 3.2 + random(`hh${gx},${gz}`) * 3.5,
				d: 5 + random(`hd${gx},${gz}`) * 3,
				rot: (random(`ho${gx},${gz}`) < 0.5 ? 0 : Math.PI / 2) + (r - 0.5) * 0.15,
				wall: mixHex(PAL.cream, [PAL.sky, PAL.clay, PAL.grass][Math.floor(r * 3)], 0.12 + random(`hw${gx},${gz}`) * 0.25),
				roof: mixHex(PAL.clay, PAL.ink, random(`hf${gx},${gz}`) * 0.45),
			});
		}
	}
	return out;
})();

/* ------------------------------------------------------------------ */

const v = (a: Vec3) => new Vector3(...a);

export const Scene: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const tension = tensionAt(frame);
	const power = powerAt(frame);

	/* ---------- camera ---------- */
	const pov = povState(frame, fps, CAM_KEYS, {
		tension: () => tension,
		walk: (f) => windowRamp(f, 2080, 2100, 2160, 2190) * 0.4,
		impacts: IMPACTS,
		head: (f) => {
			// quick glance at the pebble on Day 9, nervous look-around on the moon
			const g = windowRamp(f, 250, 262, 290, 305) * 0.05;
			const p = windowRamp(f, 1600, 1640, 1800, 1840);
			return [g + fbm1('look', f / 25) * 0.04 * p, fbm1('lookp', f / 30) * 0.03 * p, 0];
		},
		fovOffset: (f) => -windowRamp(f, 1790, 1830, 1845, 1880) * 6, // dolly-zoom kick
	});
	const camPos = pov.position;
	const camYaw = new Euler().setFromQuaternion(pov.quaternion, 'YXZ').y;

	/* ---------- sky / light ---------- */
	const dayT = dayTimeAt(frame);
	const sunDir = sunDirection(dayT % 1);
	const elev = sunDir.y;
	const mood = moodAt(frame, elev);
	const nightness = smooth((-elev + 0.05) / 0.25);
	const frontMoon = new Vector3(-0.06, 0.53, -0.85).normalize();
	const lapseMoon = sunDir.clone().negate().add(new Vector3(0.2, 0.25, -0.3)).normalize();
	const moonDir = lapseMoon.lerp(frontMoon, ramp(frame, 1400, 1560)).normalize();
	const moonPull = ramp(frame, 1600, 1845) * (1 - ramp(frame, 1890, 2000));
	const moonScale = 1 + moonPull * 5.5;
	const sunUp = elev > -0.02;
	const lightDir = sunUp ? sunDir : moonDir;
	const lightI = sunUp
		? mood.sunIntensity * smooth((elev + 0.02) / 0.14)
		: mood.sunIntensity * 0.75 * smooth((-elev - 0.02) / 0.14);
	const altitude = Math.max(0, camPos.y - 1.6);
	const fogDensity = mood.fogDensity * (1 - 0.55 * smooth(altitude / 50));
	const shadowSize = 9 + altitude * 1.1;
	const shadowCenter = new Vector3(camPos.x, 0, camPos.z - 3 - Math.min(20, altitude * 0.4));
	const lightTarget = useMemo(() => new Object3D(), []);
	lightTarget.position.copy(shadowCenter);
	lightTarget.updateMatrixWorld();
	const lightPos = shadowCenter.clone().add(lightDir.clone().multiplyScalar(60 + altitude));
	const accentColor = mixHex(PAL.sky, '#ff3b2a', redAt(frame));

	/* ---------- telekinesis choreography ---------- */
	const pebbleLift = track(frame, [
		[0, 0],
		[318, 0],
		[332, 0.035],
		[345, 0.018],
		[400, 0.05],
		[470, 0.3],
		[560, 0.55],
		[840, 0.9],
		[1990, 0.9],
		[2060, 0],
	]);
	const shiver = windowRamp(frame, 240, 256, 312, 330) * 0.0035;
	const pebblePos: Vec3 = [
		Math.sin(frame * 2.7) * shiver,
		0.935 + pebbleLift + Math.sin(frame * 0.11) * 0.012 * smooth(pebbleLift * 6),
		0.55 + Math.cos(frame * 3.1) * shiver * 0.6,
	];
	const pebbleSpin = smooth(pebbleLift * 3) * frame * 0.035;
	const gardenLift = (i: number) => ramp(frame, 470 + i * 14, 610 + i * 14) * (1 - ramp(frame, 1890 + i * 6, 2010 + i * 6));
	const ringIn = (i: number) => ramp(frame, 1140 + i * 3, 1270 + i * 3);
	const ringOut = ramp(frame, 1885, 2010);
	const houseLift = ramp(frame, 1600, 1830) * (1 - ramp(frame, 1890, 2020));

	// Moss: watches, gasps at Day 150, his watering can floats away
	const mossShock = ramp(frame, 690, 712);
	const canFree = ramp(frame, 700, 760);

	// Hands
	const reach = track(frame, [
		[0, 0.85],
		[480, 0.9],
		[560, 0.55],
		[790, 0.7],
		[860, 0.15],
		[1000, 0.45],
		[1200, 0.7],
		[1530, 0.6],
		[1700, 1],
		[1990, 0.45],
		[2072, 0.2],
		[2140, 0.55],
		[2208, 0.85],
		[2250, 0.85],
	]);
	const raise = track(frame, [
		[0, 0],
		[1560, 0],
		[1700, 0.95],
		[1880, 1],
		[1990, 0.15],
		[2072, 0],
		[2250, 0],
	]);
	const close = track(frame, [
		[0, 0],
		[1780, 0],
		[1840, 0.85],
		[1890, 0.9],
		[1960, 0],
		[2250, 0],
	]);
	const glow = Math.max(0, power - 0.1) * (0.6 + 0.4 * Math.sin(frame * 0.4) * tension);

	const pip = ramp(frame, 2085, 2110);

	return (
		<>
			<PovCamera state={pov} />
			<Fog color={mood.fog} density={fogDensity} />
			<Sky
				center={camPos}
				zenith={mood.zenith}
				horizon={mood.horizon}
				ground={mixHex(mood.fog, PAL.ink, 0.2)}
				sunDir={sunDir}
				sunColor={mood.sun}
				sunVisible={smooth((elev + 0.08) / 0.12)}
				moonDir={moonDir}
				moonScale={moonScale}
				moonColor={mixHex('#f3f0ff', '#ffb59a', redAt(frame) * 0.7)}
				moonVisible={nightness}
				stars={mood.stars * nightness}
			/>

			{/* 3-layer lighting: hemisphere + sun/moon + accents */}
			<hemisphereLight args={[mood.hemiSky, mood.hemiGround, mood.hemiIntensity]} />
			<primitive object={lightTarget} />
			<directionalLight
				position={lightPos}
				target={lightTarget}
				color={sunUp ? mood.sun : mixHex(PAL.sky, PAL.cream, 0.5)}
				intensity={lightI}
				castShadow={SHADOWS}
				shadow-mapSize={[1024, 1024]}
				shadow-bias={-0.0004}
				shadow-normalBias={0.03}
				shadow-camera-left={-shadowSize}
				shadow-camera-right={shadowSize}
				shadow-camera-top={shadowSize}
				shadow-camera-bottom={-shadowSize}
				shadow-camera-near={1}
				shadow-camera-far={200 + altitude * 2}
			/>
			{/* accent 1: the pebble's glow */}
			<pointLight
				position={[pebblePos[0], pebblePos[1] + 0.45, pebblePos[2] + 0.1]}
				color={accentColor}
				intensity={Math.max(0, power - 0.2) * 0.9 * (1 - smooth(altitude / 6))}
				distance={4}
				decay={2}
			/>

			{/* ---------- ground layers ---------- */}
			<mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
				<circleGeometry args={[2600, 48]} />
				<meshToonMaterial color={mixHex(PAL.grass, PAL.ink, 0.18)} />
			</mesh>
			<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -1]} receiveShadow>
				<planeGeometry args={[24, 17]} />
				<meshToonMaterial color={mixHex(PAL.grass, PAL.cream, 0.12)} />
			</mesh>
			{/* roads */}
			{[-104, -52, 52, 104].map((c) => (
				<React.Fragment key={c}>
					<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, c]} receiveShadow>
						<planeGeometry args={[340, 6]} />
						<meshToonMaterial color={mixHex(PAL.ink, PAL.cream, 0.35)} />
					</mesh>
					<mesh rotation={[-Math.PI / 2, 0, 0]} position={[c, 0.02, 0]} receiveShadow>
						<planeGeometry args={[6, 340]} />
						<meshToonMaterial color={mixHex(PAL.ink, PAL.cream, 0.35)} />
					</mesh>
				</React.Fragment>
			))}
			{/* grass tufts: foreground texture */}
			<Particles
				count={900}
				seed="tufts"
				frame={0}
				geometry={GEO.cone}
				color={PAL.grass}
				colorOf={(i, r) => mixHex(PAL.grass, r(3) < 0.5 ? PAL.cream : PAL.ink, r(4) * 0.3)}
				place={(i, r, _f, o) => {
					const a = r(0) * Math.PI * 2;
					const d = 1.2 + Math.pow(r(1), 0.7) * 16;
					o.position.set(Math.cos(a) * d, 0.06, -1 + Math.sin(a) * d * 0.65);
					o.scale.set(0.06 + r(2) * 0.05, 0.05 + r(2) * 0.08, 0.06 + r(2) * 0.05);
					o.rotation.set(0, r(5) * 6, (r(6) - 0.5) * 0.4);
				}}
			/>
			{/* flowers */}
			<Particles
				count={140}
				seed="flowers"
				frame={0}
				geometry={GEO.blob}
				color={PAL.cream}
				colorOf={(i, r) => [PAL.cream, PAL.clay, mixHex(PAL.sky, PAL.cream, 0.3)][Math.floor(r(3) * 3)]}
				outline={0.18}
				place={(i, r, _f, o) => {
					const x = -11 + r(0) * 22;
					const z = -6.9 + r(1) * 0.9;
					o.position.set(x, 0.12 + r(2) * 0.12, r(4) < 0.75 ? z : 4 + r(1) * 5);
					o.scale.set(0.05 + r(2) * 0.03, 0.035, 0.05 + r(2) * 0.03);
					if (Math.abs(o.position.x) < 2 && o.position.z > 0) return false;
				}}
			/>

			{/* ---------- garden (foreground / midground) ---------- */}
			<Table position={[0, 0, 0.6]} wood={mixHex(PAL.clay, PAL.cream, 0.25)} />
			<ToonMesh geometry={GEO.pebble} color={mixHex(PAL.ink, PAL.cream, 0.42)} position={pebblePos} rotation={[0.2, pebbleSpin, 0.1]} scale={[0.07, 0.05, 0.062]} outline={0.09} emissive={accentColor} emissiveIntensity={power * 0.18} />
			<Mug position={[0.52, 0.885, 0.66]} scale={0.085} color={PAL.sky} />
			<ToonMesh geometry={GEO.box} color={PAL.clay} position={[-0.48, 0.905, 0.7]} rotation={[0, 0.3, 0]} scale={[0.24, 0.04, 0.32]} outline={0.04} />
			<ToonMesh geometry={GEO.box} color={PAL.cream} position={[-0.48, 0.93, 0.7]} rotation={[0, 0.25, 0]} scale={[0.22, 0.012, 0.3]} outline={0} />
			<FlowerPot position={[0.62, 0.885, 0.28]} scale={0.2} pot={PAL.clay} leaf={PAL.grass} flower={PAL.cream} />

			{GARDEN_ITEMS.map((it, i) => {
				const l = gardenLift(i);
				const h = (0.7 + random(`gh${i}`) * 1.9) * l;
				const bob = Math.sin(frame * 0.05 + i) * 0.08 * l;
				const tumble = l * (frame * 0.006 + i);
				const p: Vec3 = [it.pos[0], it.pos[1] + h + bob, it.pos[2]];
				const rot: Vec3 = [Math.sin(tumble) * 0.4 * l, it.rot + tumble * 0.5, Math.cos(tumble) * 0.3 * l];
				if (it.kind === 'chair') return <Chair key={i} position={p} rotation={rot} color={it.color} />;
				if (it.kind === 'pot') return <FlowerPot key={i} position={p} rotation={rot} scale={0.55} pot={it.color} leaf={PAL.grass} flower={i % 2 ? PAL.cream : PAL.sky} />;
				if (it.kind === 'crate') return <ToonMesh key={i} geometry={GEO.box} color={it.color} position={[p[0], p[1] + 0.3, p[2]]} rotation={rot} scale={0.6} outline={0.03} />;
				if (it.kind === 'ball') return <ToonMesh key={i} geometry={GEO.ball} color={it.color} position={[p[0], p[1] + 0.25, p[2]]} rotation={rot} scale={0.25} outline={0.06} />;
				return <ToonMesh key={i} geometry={GEO.pot} color={it.color} position={[p[0], p[1] + 0.25, p[2]]} rotation={rot} scale={[0.6, 0.7, 0.6]} outline={0.04} />;
			})}
			{/* garden stones rising with the items */}
			<Particles
				count={90}
				seed="gstones"
				frame={frame}
				geometry={GEO.rock}
				color={mixHex(PAL.ink, PAL.cream, 0.6)}
				outline={0.12}
				castShadow
				place={(i, r, f, o) => {
					const a = r(0) * Math.PI * 2;
					const d = 2.6 + r(1) * 5;
					const l = ramp(f, 480 + r(2) * 120, 600 + r(2) * 120) * (1 - ramp(f, 1890 + r(2) * 80, 2000 + r(2) * 80));
					o.position.set(-1.8 + Math.cos(a) * d, 0.05 + l * (0.6 + r(3) * 3.2) + Math.sin(f * 0.06 + i) * 0.05 * l, -3 + Math.sin(a) * d * 0.55);
					o.scale.setScalar(0.04 + r(4) * 0.07);
					o.rotation.set(r(5) * 6 + f * 0.02 * l, r(6) * 6 + f * 0.015 * l, 0);
					if (o.position.z > 0.9 && Math.abs(o.position.x) < 1.2) return false;
				}}
			/>
			{/* glowing motes around the pebble / hands */}
			<Particles
				count={160}
				seed="motes"
				frame={frame}
				geometry={GEO.blob}
				color={accentColor}
				shading="basic"
				opacity={Math.min(1, power * 1.1) * (1 - smooth(altitude / 4))}
				place={(i, r, f, o) => {
					const a = r(0) * Math.PI * 2 + f * 0.02 * (0.5 + r(1));
					const d = 0.08 + r(2) * 0.5 * (0.4 + power);
					const y = ((r(3) + f * 0.002 * (0.5 + r(4))) % 1) * 0.6;
					o.position.set(pebblePos[0] + Math.cos(a) * d, pebblePos[1] - 0.05 + y, pebblePos[2] + Math.sin(a) * d);
					o.scale.setScalar(0.004 + r(5) * 0.006);
				}}
			/>

			<Fence from={-12} to={12} z={-7.2} color={mixHex(PAL.cream, PAL.clay, 0.15)} />
			<House position={[7.2, 0, -2.5]} rotation={[0, -Math.PI / 2, 0]} w={6} h={4} d={5} wall={PAL.cream} roof={PAL.clay} />
			<House position={[-10, 0, -19]} rotation={[0, 0.2, 0]} w={6.5} h={4.4} d={5.5} wall={mixHex(PAL.cream, PAL.sky, 0.3)} roof={mixHex(PAL.clay, PAL.ink, 0.3)} />
			<House position={[11, 0, -22]} rotation={[0, -0.15, 0]} w={7} h={5} d={6} wall={mixHex(PAL.cream, PAL.grass, 0.25)} roof={PAL.clay} />
			<Tree position={[-6.2, 0, -4.5]} scale={1.25} leaf={PAL.grass} />
			<Tree position={[4.2, 0, -9.5]} scale={1.3} leaf={mixHex(PAL.grass, PAL.ink, 0.3)} kind="pine" />
			<Tree position={[8.5, 0, 2.5]} scale={1.1} leaf={mixHex(PAL.grass, PAL.cream, 0.15)} />
			<Tree position={[-10, 0, -10.5]} scale={1.5} leaf={mixHex(PAL.grass, PAL.ink, 0.25)} kind="pine" />
			<Tree position={[1.5, 0, -14]} scale={1.4} leaf={PAL.grass} />
			<Tree position={[-3.5, 0, 6]} scale={1.2} leaf={PAL.grass} />

			{/* Moss at the fence */}
			{frame > 540 && frame < 1100 ? <Moss
				position={[-2.4, 0, -7.75]}
				rotationY={0.35}
				holdCan={canFree < 0.05}
				pose={{
					headYaw: Math.sin(frame * 0.03) * 0.25 * (1 - mossShock),
					headPitch: -0.25 * mossShock,
					armL: 0.15 + mossShock * 2.4 + Math.sin(frame * 0.5) * 0.08 * mossShock,
					armR: 0.1 + mossShock * 2.2 + Math.cos(frame * 0.45) * 0.08 * mossShock,
					armForwardR: 0.4 * (1 - mossShock),
					gasp: mossShock,
					lean: -0.12 * mossShock,
				}}
			/> : null}
			{canFree >= 0.05 ? (
				<group position={[-2.1, 1.0 + canFree * 1.4 + Math.sin(frame * 0.07) * 0.1, -7.7 + canFree * 0.5]} rotation={[frame * 0.01, frame * 0.02, 0.3]}>
					<ToonMesh geometry={GEO.pot} color="#7fa7c9" scale={[0.32, 0.36, 0.32]} outline={0.04} />
				</group>
			) : null}

			{/* Pip, Year 10: a kid's own Day 1 */}
			{frame > 2050 ? <Pip
				position={[-1.3, 0, 0.15]}
				rotationY={Math.PI / 2 - 0.2}
				pose={{
					armForwardL: 1.35 * pip,
					armForwardR: 1.35 * pip,
					armL: 0.15,
					armR: 0.15,
					headPitch: 0.2,
					headYaw: 0.1 * Math.sin(frame * 0.05),
					gasp: 0.15,
				}}
			/> : null}

			{/* ---------- town (midground / far) ---------- */}
			<Particles
				count={TOWN.length}
				seed="townbody"
				frame={frame}
				geometry={GEO.box}
				color={PAL.cream}
				colorOf={(i) => TOWN[i].wall}
				outline={0.012}
				castShadow
				place={(i, r, f, o) => {
					const hs = TOWN[i];
					const lift = houseLift * (2 + r(0) * 12) * (0.4 + 0.6 * smooth(1 - Math.hypot(hs.x - 8, hs.z - 6) / 180));
					o.position.set(hs.x, hs.h / 2 + lift + Math.sin(f * 0.04 + i) * 0.4 * houseLift, hs.z);
					o.rotation.set(Math.sin(f * 0.02 + i) * 0.15 * houseLift, hs.rot + houseLift * r(1) * 0.6, Math.cos(f * 0.025 + i) * 0.12 * houseLift);
					o.scale.set(hs.w, hs.h, hs.d);
				}}
			/>
			<Particles
				count={TOWN.length}
				seed="townroof"
				frame={frame}
				geometry={GEO.roof}
				color={PAL.clay}
				colorOf={(i) => TOWN[i].roof}
				outline={0.02}
				castShadow
				place={(i, r, f, o) => {
					const hs = TOWN[i];
					const lift = houseLift * (2 + random(`townbody-${i * 8}`) * 12) * (0.4 + 0.6 * smooth(1 - Math.hypot(hs.x - 8, hs.z - 6) / 180));
					// roof follows its body: same wobble, offset along the tilted up-axis
					const ex = Math.sin(f * 0.02 + i) * 0.15 * houseLift;
					const ez = Math.cos(f * 0.025 + i) * 0.12 * houseLift;
					const ey = hs.rot + houseLift * random(`townbody-${i * 8 + 1}`) * 0.6;
					const up = new Vector3(0, hs.h / 2 + hs.h * 0.28, 0).applyEuler(new Euler(ex, ey, ez));
					o.position.set(hs.x + up.x, hs.h / 2 + lift + Math.sin(f * 0.04 + i) * 0.4 * houseLift + up.y, hs.z + up.z);
					o.rotation.set(ex, ey + Math.PI / 4, ez);
					o.scale.set(hs.w * 0.98, hs.h * 0.56, hs.d * 0.98);
				}}
			/>
			{/* town trees */}
			<Particles
				count={520}
				seed="towntrees"
				frame={frame}
				geometry={GEO.blob}
				color={PAL.grass}
				colorOf={(i, r) => mixHex(PAL.grass, PAL.ink, 0.1 + r(3) * 0.3)}
				outline={0.04}
				castShadow
				place={(i, r, f, o) => {
					const x = (r(0) - 0.5) * 320;
					const z = (r(1) - 0.5) * 320;
					if (Math.abs(x) < 16 && z > -24 && z < 14) return false;
					if (Math.abs(((x + 52 * 9) % 52) - 0) < 4 || Math.abs(((z + 52 * 9) % 52) - 0) < 4) return false;
					const s = 1.6 + r(2) * 1.6;
					const lift = houseLift * (3 + r(4) * 14);
					o.position.set(x, s * 1.3 + lift, z);
					o.scale.set(s, s * 1.25, s);
					o.rotation.set(r(5) + f * 0.01 * houseLift, r(6) * 6, 0);
				}}
			/>
			{/* far hills: silhouettes through fog */}
			<Particles
				count={70}
				seed="hills"
				frame={0}
				geometry={GEO.blob}
				color={mixHex(PAL.grass, PAL.ink, 0.45)}
				place={(i, r, _f, o) => {
					const a = (i / 70) * Math.PI * 2 + r(0) * 0.08;
					const d = 520 + r(1) * 420;
					o.position.set(Math.cos(a) * d, -20, Math.sin(a) * d);
					o.scale.set(110 + r(2) * 160, 60 + r(3) * 150, 110 + r(2) * 120);
					o.rotation.set(0, r(4) * 6, 0);
				}}
			/>
			{/* clouds */}
			<Particles
				count={180}
				seed="clouds"
				frame={frame}
				geometry={GEO.blob1}
				color={mixHex(PAL.cream, mood.horizon, 0.35)}
				emissive={mood.horizon}
				emissiveIntensity={0.25}
				outline={0}
				place={(i, r, f, o) => {
					const c = Math.floor(i / 4);
					const cr = (k: number) => random(`cloud${c}-${k}`);
					const drift = f * 0.03;
					const cx = (cr(0) - 0.5) * 900 + drift;
					const cz = (cr(1) - 0.5) * 900;
					const cy = 95 + cr(2) * 60;
					const j = i % 4;
					o.position.set(cx + (j - 1.5) * 9 + r(0) * 4, cy + (j === 1 || j === 2 ? 4 : 0) + r(1) * 2, cz + r(2) * 6);
					o.scale.set(9 + r(3) * 7, 6 + r(4) * 4, 8 + r(5) * 6);
				}}
			/>

			{/* ---------- liftoff: leaves spiral up with you ---------- */}
			<Particles
				count={500}
				seed="leaves"
				frame={frame}
				geometry={GEO.blob}
				color={PAL.grass}
				colorOf={(i, r) => mixHex(PAL.grass, r(3) < 0.35 ? PAL.clay : PAL.cream, r(4) * 0.5)}
				visible={frame > 850 && frame < 1250}
				place={(i, r, f, o) => {
					const vis = windowRamp(f, 860 + r(0) * 40, 920 + r(0) * 40, 1120, 1240);
					if (vis <= 0.001) return false;
					const a = r(1) * Math.PI * 2 + f * 0.03 * (0.6 + r(2));
					const d = 1.2 + r(3) * 7;
					const y = camPos.y - 6 + ((r(4) + f * 0.004 * (0.6 + r(5))) % 1) * 14;
					o.position.set(camPos.x + Math.cos(a) * d, y, camPos.z + Math.sin(a) * d);
					o.scale.set(0.07 * vis, 0.015 * vis, 0.1 * vis);
					o.rotation.set(f * 0.1 * r(6), a, f * 0.07);
				}}
			/>

			{/* ---------- the ring: boulders orbit you (years 3–7) ---------- */}
			<Particles
				count={90}
				seed="ring"
				frame={frame}
				geometry={GEO.rock}
				color={mixHex(PAL.ink, PAL.cream, 0.5)}
				colorOf={(i, r) => mixHex(PAL.ink, PAL.cream, 0.45 + r(3) * 0.3)}
				emissive={mood.hemiSky}
				emissiveIntensity={0.25 * nightness}
				outline={0.05}
				visible={frame > 1100 && frame < 2080}
				place={(i, r, f, o) => {
					const inn = ringIn(i % 30);
					if (inn <= 0.001) return false;
					const a = r(0) * Math.PI * 2 + f * 0.004 * (1 + r(1) * 0.6);
					const d = 13 + r(2) * 18 + redAt(f) * 6;
					const yy = (r(4) - 0.5) * 9 + Math.sin(f * 0.03 + i) * 0.8;
					const base = new Vector3(camPos.x + Math.cos(a) * d, camPos.y + yy - (1 - inn) * 60, camPos.z + Math.sin(a) * d);
					base.y = base.y * (1 - ringOut) + (0.8 + r(5)) * ringOut;
					o.position.copy(base);
					o.scale.setScalar(0.5 + r(5) * 1.4);
					o.rotation.set(f * 0.01 * r(6), f * 0.012, r(7) * 6);
				}}
			/>
			{[0, 1, 2, 3, 4].map((i) => {
				const inn = ringIn(10 + i * 4);
				if (frame < 1100 || frame > 2080 || inn < 0.01) return null;
				const a = i * 1.26 + 0.4 + frame * 0.005;
				const d = 13 + (i % 3) * 3;
				const p = v([camPos.x + Math.cos(a) * d, camPos.y - 2 + (i % 2) * 4 - (1 - inn) * 60, camPos.z + Math.sin(a) * d]);
				p.y = p.y * (1 - ringOut) + 0.1 * ringOut;
				return (
					<Car
						key={i}
						position={[p.x, p.y, p.z]}
						rotation={[Math.sin(frame * 0.02 + i) * 0.5 * (1 - ringOut), -a + i, Math.cos(frame * 0.017 + i) * 0.4 * (1 - ringOut)]}
						body={[PAL.clay, PAL.sky, PAL.cream, mixHex(PAL.grass, PAL.ink, 0.2), mixHex(PAL.clay, PAL.ink, 0.3)][i]}
					/>
				);
			})}

			{/* ---------- Year 7: debris storm when you pull the moon ---------- */}
			<Particles
				count={2400}
				seed="debris"
				frame={frame}
				geometry={GEO.rock}
				color={mixHex(PAL.ink, PAL.clay, 0.3)}
				colorOf={(i, r) => mixHex(PAL.ink, r(3) < 0.5 ? PAL.clay : PAL.cream, 0.2 + r(4) * 0.4)}
				visible={houseLift > 0.01}
				place={(i, r, f, o) => {
					const s = houseLift * (0.15 + r(0) * 0.6);
					if (s < 0.01) return false;
					const a = r(1) * Math.PI * 2 + f * 0.006 * (0.7 + r(2));
					const d = 6 + Math.pow(r(3), 0.6) * 120;
					const top = camPos.y + 45;
					const y = ((r(4) + f * 0.0035 * (0.4 + r(5))) % 1) * top;
					o.position.set(camPos.x + Math.cos(a) * d, y, camPos.z + Math.sin(a) * d);
					o.scale.setScalar(s);
					o.rotation.set(f * 0.05 * r(6), f * 0.04, r(7) * 6);
				}}
			/>
			{/* accent 2: the red pull (camera-attached) */}
			<pointLight
				position={[camPos.x, camPos.y + 1.5, camPos.z - 2]}
				color={accentColor}
				intensity={redAt(frame) * 40}
				distance={60}
				decay={1.5}
			/>

			{/* ---------- POV body ---------- */}
			<PovLegs
				position={[camPos.x, camPos.y, camPos.z]}
				yaw={camYaw}
				dangle={smooth(altitude / 2)}
				frame={frame}
				pants={mixHex(PAL.ink, PAL.sky, 0.3)}
				shoe={mixHex(PAL.clay, PAL.ink, 0.4)}
				shirt={mixHex(PAL.sky, PAL.ink, 0.45)}
			/>
			<CameraAttached state={pov}>
				<PovHands
					reach={reach}
					spread={0.4 + power * 0.5}
					raise={raise}
					close={close}
					tremble={tension * 1.2 + windowRamp(frame, 240, 260, 320, 335)}
					frame={frame}
					sleeve={mixHex(PAL.sky, PAL.ink, 0.45)}
					skin="#f0b48c"
					glow={accentColor}
					glowIntensity={glow}
				/>
				<pointLight position={[0, -0.1, -0.5]} color={accentColor} intensity={glow * 0.6} distance={1.5} decay={2} />
			</CameraAttached>
		</>
	);
};
