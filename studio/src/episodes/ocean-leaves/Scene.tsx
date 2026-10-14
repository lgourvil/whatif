import React, {useMemo} from 'react';
import * as THREE from 'three';
import {random} from 'remotion';
import {Palette, skyState} from '../../lib/palettes';
import {clamp01, keys, keysLin, lerp, smooth} from '../../lib/curve';
import {computePov, PovCamera} from '../../lib/PovCamera';
import {Sky} from '../../lib/Sky';
import {Particles} from '../../lib/Particles';
import {Outlined} from '../../lib/Outlined';
import {Marlo, MarloPose, PovHands} from '../../lib/Characters';
import {outlineMaterial, toon} from '../../lib/ToonMaterial';
import tl from './timeline.json';
import {rig, camKeys} from './camera';
import {PIER, terrainH} from './world';

export const SHADOWS = true;

export const PALETTE: Palette = {warm: '#ffb35c', cool: '#1f8fa8', deep: '#1b1f4b', alarm: '#ff3b4a', light: '#f4ecd8'};
const TL = (k: unknown) => k as [number, number][];

// ---------- shared geometries / materials ----------
const geo = {
	rock: new THREE.IcosahedronGeometry(1, 0),
	coral: new THREE.ConeGeometry(0.28, 1, 5),
	fish: new THREE.OctahedronGeometry(0.5, 0),
	drop: new THREE.IcosahedronGeometry(1, 0),
	plank: new THREE.BoxGeometry(3.5, 0.12, 0.42),
	piling: new THREE.CylinderGeometry(0.17, 0.2, 1, 7),
	rung: new THREE.BoxGeometry(0.8, 0.04, 0.04),
	box: new THREE.BoxGeometry(1, 1, 1),
	cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
};
const white = toon('#ffffff', {flatShading: true});
const dropMat = new THREE.MeshBasicMaterial({color: new THREE.Color(PALETTE.cool).lerp(new THREE.Color(PALETTE.light), 0.72), fog: true});

// ---------- terrain ----------
const buildTerrain = (cx: number, cz: number, w: number, d: number, seg: [number, number], drop: number) => {
	const g = new THREE.PlaneGeometry(w, d, seg[0], seg[1]);
	g.rotateX(-Math.PI / 2);
	const p = g.attributes.position;
	for (let i = 0; i < p.count; i++) {
		const x = p.getX(i) + cx, z = p.getZ(i) + cz;
		p.setXYZ(i, x, terrainH(x, z) - drop, z);
	}
	const ng = g.toNonIndexed();
	const pos = ng.attributes.position;
	const colors = new Float32Array(pos.count * 3);
	const c = new THREE.Color();
	const sand = new THREE.Color(PALETTE.light).multiplyScalar(0.62).lerp(new THREE.Color(PALETTE.warm), 0.25);
	const wet = new THREE.Color(PALETTE.cool).multiplyScalar(0.42).lerp(new THREE.Color(PALETTE.deep), 0.5);
	for (let t = 0; t < pos.count; t += 3) {
		const h = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3 + drop;
		const px = pos.getX(t), pz = pos.getZ(t);
		const k = smooth((h + 13.2) / 8) * 0.85 + (random(`tc${Math.floor(px / 3)}-${Math.floor(pz / 3)}-${t}`) - 0.5) * 0.18;
		c.copy(wet).lerp(sand, clamp01(k));
		for (let v = 0; v < 3; v++) colors.set([c.r, c.g, c.b], (t + v) * 3);
	}
	ng.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	ng.computeVertexNormals();
	return ng;
};
const terrainMat = toon('#ffffff', {vertexColors: true, flatShading: true});

const Terrain: React.FC = () => {
	const near = useMemo(() => buildTerrain(0, -55, 130, 150, [86, 100], 0), []);
	const far = useMemo(() => buildTerrain(0, -150, 900, 700, [90, 70], 0.8), []);
	return (
		<>
			<mesh geometry={far} material={terrainMat} receiveShadow />
			<mesh geometry={near} material={terrainMat} receiveShadow />
		</>
	);
};

// ---------- water ----------
const Water: React.FC<{frame: number; level: number; surge: number; color: THREE.Color; opacity: number}> = ({frame, level, surge, color, opacity}) => {
	const geom = useMemo(() => {
		const g = new THREE.PlaneGeometry(1000, 900, 110, 100);
		g.rotateX(-Math.PI / 2);
		return g;
	}, []);
	const base = useMemo(() => Float32Array.from(geom.attributes.position.array as Float32Array), [geom]);
	const p = geom.attributes.position;
	const amp = 0.16 + surge * 0.9;
	const t = frame / 30;
	for (let i = 0; i < p.count; i++) {
		const x = base[i * 3], z = base[i * 3 + 2] - 120;
		const d = Math.sin(x * 0.11 + t * 1.1) * 0.6 + Math.sin(z * 0.17 + t * 1.5) * 0.5 + Math.sin((x + z) * 0.07 - t * 0.7) * 0.9;
		p.setXYZ(i, x, d * amp, z);
	}
	p.needsUpdate = true;
	geom.computeVertexNormals();
	const mat = useMemo(() => toon('#ffffff', {flatShading: true, transparent: true, side: THREE.DoubleSide}), []);
	mat.color.copy(color);
	mat.emissive.copy(color).multiplyScalar(0.28);
	mat.opacity = opacity;
	return <mesh geometry={geom} material={mat} position={[0, level, 0]} visible={level > -14.2} receiveShadow />;
};

// ---------- pier ----------
const Pier: React.FC<{palette: Palette}> = ({palette}) => {
	const wood = useMemo(() => [new THREE.Color(palette.deep).lerp(new THREE.Color(palette.warm), 0.38), new THREE.Color(palette.deep).lerp(new THREE.Color(palette.warm), 0.28)], [palette]);
	const pilingMat = useMemo(() => toon(new THREE.Color(palette.deep).lerp(new THREE.Color(palette.warm), 0.2), {flatShading: true}), [palette]);
	const nPlank = 90, nPil = 26;
	return (
		<>
			<Particles
				count={nPlank} geometry={geo.plank} material={white} frame={0} colored shadows
				place={(i, o, c) => {
					o.position.set(0, PIER.deckY - 0.06, PIER.endZ + 0.2 + i * 0.5);
					o.scale.set(1, 1, 1);
					o.rotation.y = (random(`pr${i}`) - 0.5) * 0.02;
					c.copy(wood[i % 2]).multiplyScalar(0.85 + random(`pc${i}`) * 0.3);
				}}
			/>
			<Particles
				count={nPil} geometry={geo.piling} material={pilingMat} frame={0} outlineMaterial={outlineMaterial} outlineAdd={0.1} shadows
				place={(i, o) => {
					const side = i % 2 ? 1 : -1;
					const z = PIER.endZ + 0.7 + Math.floor(i / 2) * 3.6;
					o.position.set(side * 1.42, (-15 + 2.1) / 2, z);
					o.scale.set(1, 17.1, 1);
				}}
			/>
			{/* railings */}
			{[-1, 1].map((s) => (
				<React.Fragment key={s}>
					<Outlined geometry={geo.box} color={palette.deep} position={[s * 1.55, 3.0, (PIER.endZ + PIER.startZ) / 2]} scale={[0.07, 0.07, PIER.startZ - PIER.endZ]} outline={0.3} />
					<Particles
						count={13} geometry={geo.box} material={pilingMat} frame={0} shadows
						place={(i, o) => {
							o.position.set(s * 1.55, 2.65, PIER.endZ + 0.4 + i * 3.6);
							o.scale.set(0.09, 0.95, 0.09);
						}}
					/>
				</React.Fragment>
			))}
			{/* end-of-pier boarding ladder hanging from two brackets */}
			{[-1, 1].map((s) => (
				<React.Fragment key={s}>
					<Outlined geometry={geo.box} color={palette.light} position={[s * 0.4, -3.7, -4.2]} scale={[0.06, 12.2, 0.06]} outline={0.3} />
					<Outlined geometry={geo.box} color={palette.deep} position={[s * 0.4, 2.35, -3.6]} scale={[0.09, 0.09, 1.3]} outline={0.3} />
				</React.Fragment>
			))}
			<Particles
				count={31} geometry={geo.rung} material={pilingMat} frame={0} outlineMaterial={outlineMaterial} outlineAdd={0.03}
				place={(i, o) => {
					o.position.set(0, 1.9 - i * 0.4, -4.2);
				}}
			/>
			{/* lamps: emissive bulbs on the first posts */}
			{[0, 1, 2, 3].map((i) => (
				<Outlined key={i} geometry={geo.drop} color={palette.light} emissive={palette.warm} position={[-1.55, 3.35, 2 + i * 10.8]} scale={0.14} outline={0.3} cast={false} />
			))}
		</>
	);
};

// ---------- seabed dressing ----------
const pathPts = Array.from({length: 120}, (_, i) => computePov(rig, 600 + i * 10)).map((p) => [p.pos.x, p.pos.z] as const);
const nearPath = (x: number, z: number) => pathPts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 4.6);

const Rocks: React.FC<{palette: Palette}> = ({palette}) => {
	const items = useMemo(() => {
		const out: {x: number; z: number; s: number; r: number; k: number}[] = [];
		for (let i = 0; out.length < 240 && i < 600; i++) {
			const x = (random(`rx${i}`) - 0.5) * 150, z = -140 + random(`rz${i}`) * 150;
			if (nearPath(x, z)) continue;
			out.push({x, z, s: 0.35 + Math.pow(random(`rs${i}`), 2.2) * 2.0, r: random(`rr${i}`) * 6, k: random(`rk${i}`)});
		}
		return out;
	}, []);
	const dark = useMemo(() => new THREE.Color(palette.cool).multiplyScalar(0.3).lerp(new THREE.Color(palette.deep), 0.4), [palette]);
	const mid = useMemo(() => new THREE.Color(palette.light).multiplyScalar(0.45), [palette]);
	return (
		<Particles
			count={items.length} geometry={geo.rock} material={white} frame={0} colored outlineMaterial={outlineMaterial} outlineAdd={0.07} shadows
			place={(i, o, c) => {
				const r = items[i];
				o.position.set(r.x, terrainH(r.x, r.z) + r.s * 0.2, r.z);
				o.scale.set(r.s * 1.2, r.s * 0.75, r.s);
				o.rotation.set(0, r.r, 0);
				c.copy(dark).lerp(mid, r.k * 0.7);
			}}
		/>
	);
};

const Coral: React.FC<{frame: number; palette: Palette}> = ({frame, palette}) => {
	const items = useMemo(() => {
		const out: {x: number; z: number; s: number; k: number; a: number}[] = [];
		for (let i = 0; out.length < 420 && i < 1200; i++) {
			const x = (random(`cx${i}`) - 0.5) * 120, z = -120 + random(`cz${i}`) * 112;
			if (nearPath(x, z)) continue;
			out.push({x, z, s: 0.5 + random(`cs${i}`) * 1.5, k: random(`ck${i}`), a: random(`ca${i}`) * 6});
		}
		return out;
	}, []);
	const bleach = keysLin([[0, 0], [650, 0], [1300, 1]] as [number, number][], frame) * (frame > 1790 ? 1 - keysLin([[1790, 0], [1990, 1]] as [number, number][], frame) : 1);
	const cols = useMemo(() => [new THREE.Color(palette.alarm), new THREE.Color(palette.warm), new THREE.Color(palette.cool).lerp(new THREE.Color(palette.light), 0.3)], [palette]);
	const pale = useMemo(() => new THREE.Color(palette.light).multiplyScalar(0.85), [palette]);
	return (
		<Particles
			count={items.length} geometry={geo.coral} material={white} frame={frame} colored outlineMaterial={outlineMaterial} outlineAdd={0.05} shadows
			place={(i, o, c) => {
				const r = items[i];
				const h = terrainH(r.x, r.z);
				o.position.set(r.x, h + r.s * 0.45, r.z);
				o.scale.set(r.s, r.s * 1.3, r.s);
				o.rotation.set(Math.sin(r.a) * 0.25, r.a, Math.cos(r.a) * 0.25);
				c.copy(cols[Math.floor(r.k * 3) % 3]).lerp(pale, bleach * 0.9);
			}}
		/>
	);
};

const Wreck: React.FC<{palette: Palette}> = ({palette}) => {
	const x = -13, z = -49, y = terrainH(x, z);
	const hull = new THREE.Color(palette.deep).lerp(new THREE.Color(palette.warm), 0.22);
	return (
		<group position={[x, y + 1.3, z]} rotation={[0.1, 0.5, 0.28]}>
			<Outlined geometry={geo.box} color={hull} scale={[4.2, 3.2, 12]} outline={0.025} />
			<Outlined geometry={geo.box} color={palette.warm} position={[0, 1.9, -1]} scale={[3.4, 0.4, 9]} outline={0.1} />
			<Outlined geometry={geo.cyl} color={palette.light} position={[0, 5, 1]} scale={[0.3, 9, 0.3]} rotation={[0, 0, 0.18]} outline={0.3} />
			<Outlined geometry={geo.box} color={palette.alarm} position={[1.4, 5.5, 1]} scale={[0.05, 3.2, 2.4]} rotation={[0, 0, 0.18]} outline={0.3} />
			{[-1, 1].map((s) => [-4, -2, 0, 2, 4].map((q) => (
				<Outlined key={`${s}${q}`} geometry={geo.box} color={palette.light} position={[s * 2.2, 2.2, q]} scale={[0.1, 1.6, 0.14]} outline={0.3} />
			)))}
		</group>
	);
};

const Fish: React.FC<{frame: number; palette: Palette}> = ({frame, palette}) => {
	const items = useMemo(() => Array.from({length: 46}, (_, i) => {
		const t = (i + 0.3) / 46;
		return {x: (random(`fx${i}`) - 0.5) * 36 + 3, z: -6 - t * 90, ph: random(`fp${i}`) * 6, s: 0.5 + random(`fs${i}`) * 0.5, r: random(`fr${i}`) * 6};
	}), []);
	const alive = keysLin([[0, 0], [560, 0], [640, 1], [1000, 0.9], [1340, 0]] as [number, number][], frame);
	return (
		<Particles
			count={items.length} geometry={geo.fish} material={white} frame={frame} colored outlineMaterial={outlineMaterial} outlineAdd={0.05}
			place={(i, o, c) => {
				const r = items[i];
				const flop = Math.abs(Math.sin(frame * 0.33 + r.ph)) * alive;
				o.position.set(r.x, terrainH(r.x, r.z) + 0.12 + flop * 0.7 * r.s, r.z);
				o.scale.set(1.5 * r.s, 0.45 * r.s, 0.5 * r.s);
				o.rotation.set(0, r.r + Math.sin(frame * 0.5 + r.ph) * 0.8 * alive, (1 - alive) * 1.5 + Math.sin(frame * 0.33 + r.ph) * 0.8 * alive);
				c.set(palette.warm).lerp(new THREE.Color(palette.light), i % 3 === 0 ? 0.7 : 0.1);
			}}
		/>
	);
};

// ---------- water motes (hook) + sky rivers (escalation) ----------
const Motes: React.FC<{frame: number; level: number; vis: number}> = ({frame, level, vis}) => {
	const items = useMemo(() => Array.from({length: 320}, (_, i) => ({x: (random(`mx${i}`) - 0.5) * 70, z: 6 - random(`mz${i}`) * 80, s: 0.035 + random(`ms${i}`) * 0.08, o: random(`mo${i}`)})), []);
	return (
		<Particles
			count={items.length} geometry={geo.drop} material={dropMat} frame={frame}
			place={(i, o) => {
				const r = items[i];
				const cyc = (r.o + frame / 120) % 1;
				const h = Math.pow(cyc, 1.4) * 55;
				o.position.set(r.x + Math.sin(frame * 0.03 + i) * 0.5, level + 0.3 + h, r.z);
				const grow = Math.min(1, cyc * 8) * Math.min(1, (1 - cyc) * 3);
				const sz = r.s * vis * grow * (1 + h * 0.03);
				o.scale.set(sz, sz * 1.9, sz);
			}}
		/>
	);
};

const STREAMS = 3, PER = 2200;
const moonPos = new THREE.Vector3(-20, 180, -190);
const Rivers: React.FC<{frame: number; fill: number; tension: number; collapse: number}> = ({frame, fill, tension, collapse}) => {
	const items = useMemo(() => Array.from({length: STREAMS * PER}, (_, i) => ({u: (i % PER) / PER, a: random(`va${i}`), b: random(`vb${i}`), c: random(`vc${i}`), s: Math.floor(i / PER)})), []);
	const mat = useMemo(() => new THREE.MeshBasicMaterial({color: '#ffffff', fog: false}), []);
	const col = useMemo(() => [new THREE.Color(PALETTE.cool).multiplyScalar(1.5), new THREE.Color(PALETTE.cool).lerp(new THREE.Color(PALETTE.light), 0.6), new THREE.Color(PALETTE.cool).lerp(new THREE.Color(PALETTE.light), 0.25)], []);
	const flow = frame / (700 - tension * 260);
	return (
		<Particles
			count={items.length} geometry={geo.drop} material={mat} frame={frame} colored
			place={(i, o, c) => {
				const r = items[i];
				const vis = r.a < fill ? 1 : 0;
				const u = (r.u + flow * (1 + r.s * 0.12)) % 1;
				const az = -Math.PI / 2 + r.s * 2.1 + 0.4;
				const sx = 4 + Math.cos(az) * 330, sz = -70 + Math.sin(az) * 330;
				const k = Math.pow(u, 1.25);
				const th = (2.2 + tension * 5 + 4 * u) * (0.3 + r.b);
				const ang = r.c * 6.283 + u * 22;
				let x = lerp(sx, moonPos.x, k) + Math.cos(ang) * th * (1 - u * 0.6);
				let y = lerp(2, moonPos.y, k) + 70 * Math.sin(Math.PI * k) * (1 - k * 0.3) + Math.sin(ang) * th * (1 - u * 0.6);
				let z = lerp(sz, moonPos.z, k) + Math.sin(ang * 1.3) * th * 0.5;
				let sc = (0.22 + r.b * 0.75) * (0.8 + u * 1.0) * vis;
				if (collapse > 0) {
					const tau = Math.max(0, collapse - (1 - u) * 28 - r.a * 25);
					y -= 0.5 * 0.022 * tau * tau;
					if (y < -14) sc = 0;
				}
				o.position.set(x, y, z);
				o.scale.setScalar(sc);
				c.copy(col[r.s % 3]).lerp(col[1], r.b * 0.4);
			}}
		/>
	);
};

const Bubbles: React.FC<{frame: number; cam: THREE.Vector3; amount: number}> = ({frame, cam, amount}) => {
	const items = useMemo(() => Array.from({length: 360}, (_, i) => ({x: random(`bx${i}`) - 0.5, y: random(`by${i}`), z: random(`bz${i}`) - 0.5, s: 0.03 + random(`bs${i}`) * 0.1})), []);
	return (
		<Particles
			count={items.length} geometry={geo.drop} material={dropMat} frame={frame}
			place={(i, o) => {
				const r = items[i];
				const rise = ((r.y + frame / 40) % 1);
				o.position.set(cam.x + r.x * 16 + Math.sin(frame * 0.06 + i) * 0.3, cam.y - 5 + rise * 13, cam.z + r.z * 16 - 3);
				o.scale.setScalar(r.s * amount * (0.4 + Math.sin(rise * Math.PI)));
			}}
		/>
	);
};

// ---------- Marlo choreography ----------
const marloKeys: [number, number, number][] = [
	[0, 0.6, -2.3], [300, 0.6, -2.3], [340, 0.4, -3.1], [420, 0.4, -4.15],
	[600, 0.6, -9], [700, 3, -28], [790, 6, -42], [870, 7, -58], [960, 6, -70], [1040, 13, -84], [1320, 13, -84.5],
	[1380, 10, -70], [1740, 3.2, -12], [1830, 3.6, -12], [2000, 0.6, -2.3], [2159, 0.6, -2.3],
];
const marloXZ = (f: number): [number, number] => {
	const xs = marloKeys.map((k) => [k[0], k[1]] as [number, number]);
	const zs = marloKeys.map((k) => [k[0], k[2]] as [number, number]);
	return [keys(xs, f), keys(zs, f)];
};
const marloPose = (f: number): MarloPose => {
	const [x, z] = marloXZ(f);
	const [x2, z2] = marloXZ(f + 5);
	const [x0, z0] = marloXZ(f - 5);
	const speed = Math.hypot(x2 - x0, z2 - z0) / 10;
	const moving = clamp01(speed * 18);
	let y = terrainH(x, z);
	if (f < 340 || f > 1990) y = PIER.deckY;
	else if (f < 440) y = lerp(PIER.deckY, terrainH(0.4, -4.15) + 0.1, smooth((f - 345) / 90));
	else if (f > 1790) y = lerp(terrainH(x, z), PIER.deckY, smooth((f - 1800) / 190));
	let yaw = Math.atan2(x2 - x0, z2 - z0);
	if (moving < 0.15) yaw = f < 1320 ? Math.PI : f > 1990 ? Math.PI : Math.atan2(0, -1);
	if (f >= 1040 && f < 1320) yaw = Math.PI + 0.3;
	const armUp = keys([[0, 1], [200, 1], [240, 0], [1060, 0], [1100, 1], [1310, 1], [1340, 0], [2010, 0], [2060, 1], [2159, 1]] as [number, number][], f);
	return {
		position: [x, y, z],
		yaw: moving > 0.15 || (f >= 1040 && f < 1320) ? yaw : Math.PI,
		walk: f * 0.38 * (speed > 0.25 ? 1.6 : 1),
		walkAmp: moving,
		armUp,
		lookYaw: f >= 1040 && f < 1320 ? -0.3 : 0,
		lookPitch: f >= 1060 && f < 1320 ? -0.75 : 0,
		lantern: true,
		scale: 1.0,
		scarfWind: 0.2 + Math.abs(Math.sin(f * 0.2)) * 0.2 + keysLin([[1320, 0], [1740, 0.7]] as [number, number][], f) * 0.2,
	};
};

// ---------- the scene ----------
export const Scene: React.FC<{frame: number}> = ({frame}) => {
	const tension = keysLin(TL(tl.tension), frame);
	const level = keys(TL(tl.seaLevel), frame);
	const phase = keysLin(TL(tl.sunPhase), frame);
	const elev = Math.sin(phase);
	const sun = useMemo(() => new THREE.Vector3(), []);
	sun.set(-0.5 * Math.cos(phase), elev, -0.85 * Math.cos(phase)).normalize();
	const sky = skyState(PALETTE, elev, tension, 0.0042);

	const pov = computePov(rig, frame);
	const camY = pov.pos.y;
	const sub = smooth((level - camY + 0.1) / 0.6) * (frame > 1700 ? 1 : 0);

	// fog + light colours
	const fogCol = sky.fog.clone().lerp(new THREE.Color(PALETTE.cool).multiplyScalar(0.5), sub);
	const fogDen = lerp(sky.fogDensity, 0.09, sub);

	const surge = clamp01((frame - 1760) / 60) * clamp01((2040 - frame) / 120);

	// key light direction swaps smoothly from sun to the moon at night
	const moonDir = moonPos.clone().sub(pov.pos).normalize();
	const keyDir = sun.clone().lerp(moonDir, sky.night).normalize();
	const lightTarget = useMemo(() => new THREE.Object3D(), []);
	lightTarget.position.set(pov.pos.x, Math.max(pov.pos.y - 3, -10), pov.pos.z - 8);
	lightTarget.updateMatrixWorld();

	const marlo = marloPose(frame);
	const lantern = new THREE.Vector3(marlo.position[0] - 0.9, marlo.position[1] + 1.3, marlo.position[2] + 0.9);

	const flashK = tl.flashes.reduce((a, fl) => a + (frame >= fl.frame ? fl.strength * Math.exp(-(frame - fl.frame) / 6) : 0), 0);
	const impactK = tl.impacts.reduce((a, im) => a + (frame >= im.frame ? im.strength * Math.exp(-(frame - im.frame) / 10) : 0), 0);

	const fill = clamp01((-level) / 14.6) * (frame < 1750 ? 1 : 1);
	const collapse = frame >= 1745 ? frame - 1745 : 0;
	const riverFill = frame < 1745 ? clamp01((-level) / 12) : 1;
	const motes = keysLin([[0, 1], [600, 1], [850, 0], [2040, 0], [2100, 1], [2159, 1]] as [number, number][], frame);

	// POV hands
	const handVis = keysLin([[0, 0], [330, 0], [360, 1], [570, 1], [598, 0], [1150, 0], [1190, 1], [1300, 1], [1330, 0], [1380, 0], [1400, 1], [1735, 1], [1750, 1], [1900, 1], [1930, 0], [2159, 0]] as [number, number][], frame);
	const ladderPh = ((frame - 385) / (185 / 26)) * Math.PI;
	const runPh = frame * 0.52;
	let lh: [number, number, number] = [-0.3, -0.38, -0.55], rh: [number, number, number] = [0.3, -0.38, -0.55];
	if (frame < 600) {
		lh = [-0.22, -0.32 + Math.sin(ladderPh) * 0.14, -0.7];
		rh = [0.22, -0.32 - Math.sin(ladderPh) * 0.14, -0.7];
	} else if (frame < 1380) {
		const rz = keysLin([[1150, 0], [1190, 1], [1300, 1], [1330, 0]] as [number, number][], frame);
		lh = [-0.2, -0.42, -0.6];
		rh = [lerp(0.2, 0.17, rz), lerp(-0.42, -0.02, rz), lerp(-0.6, -0.66, rz)];
	} else {
		lh = [-0.2, -0.4 + Math.sin(runPh) * 0.1, -0.6 + Math.cos(runPh) * 0.1];
		rh = [0.2, -0.4 - Math.sin(runPh) * 0.1, -0.6 - Math.cos(runPh) * 0.1];
	}

	const waterCol = new THREE.Color(PALETTE.cool).multiplyScalar(0.8).lerp(sky.horizon, 0.1).lerp(new THREE.Color(PALETTE.deep), sky.night * 0.5);
	const waterOpacity = lerp(0.9, 0.55, sub);
	const alarmFlash = (flashK * 0.9 + impactK * 0.35);

	return (
		<>
			<PovCamera pov={pov} />
			<fogExp2 attach="fog" args={[fogCol, fogDen]} />
			<color attach="background" args={[fogCol]} />

			<hemisphereLight args={[sky.hemiSky, sky.hemiGround, sky.hemiIntensity * 1.05]} />
			<primitive object={lightTarget} />
			<directionalLight
				color={sky.keyColor}
				intensity={sky.keyIntensity * 1.1}
				position={[lightTarget.position.x + keyDir.x * 70, lightTarget.position.y + keyDir.y * 70, lightTarget.position.z + keyDir.z * 70]}
				target={lightTarget}
				castShadow={SHADOWS}
				shadow-mapSize={[1024, 1024]}
				shadow-camera-left={-34} shadow-camera-right={34} shadow-camera-top={34} shadow-camera-bottom={-34}
				shadow-camera-near={1} shadow-camera-far={220} shadow-bias={-0.0006} shadow-normalBias={0.04}
			/>
			<pointLight position={lantern} color={PALETTE.warm} intensity={4 + 10 * sky.night} distance={18} decay={2} />
			<pointLight position={[pov.pos.x, pov.pos.y + 1, pov.pos.z]} color={PALETTE.alarm} intensity={alarmFlash * 140} distance={60} decay={1.6} />

			<Sky
				state={sky} camPos={pov.pos} sunDir={sun} sunColor={sky.keyColor}
				moonPos={moonPos} moonRadius={44} moonColor={new THREE.Color(PALETTE.light).lerp(new THREE.Color(PALETTE.alarm), tension * 0.5).multiplyScalar(1.25)}
				haloColor={new THREE.Color(PALETTE.cool).lerp(new THREE.Color(PALETTE.alarm), tension)} frame={frame}
			/>

			<Terrain />
			<Water frame={frame} level={level} surge={surge} color={waterCol} opacity={waterOpacity} />
			<Pier palette={PALETTE} />
			<Rocks palette={PALETTE} />
			<Coral frame={frame} palette={PALETTE} />
			<Wreck palette={PALETTE} />
			<Fish frame={frame} palette={PALETTE} />
			<Motes frame={frame} level={Math.max(level, -14)} vis={motes} />
			{sub > 0.05 ? <Bubbles frame={frame} cam={pov.pos} amount={sub} /> : null}
			<Rivers frame={frame} fill={riverFill * clamp01(fill + 0.0)} tension={tension} collapse={collapse} />

			<Marlo pose={marlo} palette={PALETTE} />

			<group position={pov.pos} quaternion={pov.quat}>
				<PovHands palette={PALETTE} left={lh} right={rh} visible={handVis} tilt={frame >= 1150 && frame < 1330 ? -0.4 : -0.2} />
			</group>
		</>
	);
};

export const sceneState = (frame: number) => {
	const tension = keysLin(TL(tl.tension), frame);
	const level = keys(TL(tl.seaLevel), frame);
	const pov = computePov(rig, frame);
	const sub = smooth((level - pov.pos.y + 0.1) / 0.6) * (frame > 1700 ? 1 : 0);
	const flash = tl.flashes.reduce((a, fl) => a + (frame >= fl.frame ? fl.strength * Math.exp(-(frame - fl.frame) / 5) : 0), 0);
	const shock = Math.min(1, tl.impacts.reduce((a, im) => a + (frame >= im.frame ? im.strength * Math.exp(-(frame - im.frame) / 9) : 0), 0) + (frame > 1745 && frame < 1960 ? 0.12 : 0));
	return {tension, sub, flash, shock};
};
