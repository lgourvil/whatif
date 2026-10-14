import React, {useMemo} from 'react';
import {
	BoxGeometry,
	ConeGeometry,
	CylinderGeometry,
	DodecahedronGeometry,
	IcosahedronGeometry,
	SphereGeometry,
	TorusGeometry,
} from 'three';
import {ToonMesh} from './ToonMesh';
import {flat} from './ToonMaterial';

type Vec3 = [number, number, number];
type Placed = {position?: Vec3; rotation?: Vec3; scale?: number};

/** Shared low-poly geometry kit, built once per module. */
export const GEO = (() => {
	const g = {
		box: flat(new BoxGeometry(1, 1, 1)),
		roof: flat(new ConeGeometry(0.75, 1, 4)), // pyramid roof (rotate PI/4)
		trunk: flat(new CylinderGeometry(0.12, 0.18, 1, 6)),
		blob: flat(new IcosahedronGeometry(1, 0)),
		blob1: flat(new IcosahedronGeometry(1, 1)),
		cone: flat(new ConeGeometry(1, 1, 7)),
		rock: flat(new DodecahedronGeometry(1, 0)),
		pebble: flat(new IcosahedronGeometry(1, 1)),
		cyl: flat(new CylinderGeometry(1, 1, 1, 10)),
		pot: flat(new CylinderGeometry(0.5, 0.36, 0.7, 8)),
		mug: flat(new CylinderGeometry(0.5, 0.5, 1, 10)),
		handle: flat(new TorusGeometry(0.3, 0.08, 4, 8)),
		wheel: flat(new CylinderGeometry(1, 1, 0.6, 10)),
		ball: flat(new SphereGeometry(1, 10, 7)),
	};
	return g;
})();

export const Tree: React.FC<Placed & {leaf: string; trunk?: string; kind?: 'round' | 'pine'}> = ({
	position,
	rotation,
	scale = 1,
	leaf,
	trunk = '#7a4b33',
	kind = 'round',
}) => (
	<group position={position} rotation={rotation} scale={scale}>
		<ToonMesh geometry={GEO.trunk} color={trunk} position={[0, 0.9, 0]} scale={[1, 1.8, 1]} outline={0.04} />
		{kind === 'round' ? (
			<>
				<ToonMesh geometry={GEO.blob} color={leaf} position={[0, 2.5, 0]} scale={1.25} outline={0.05} />
				<ToonMesh geometry={GEO.blob} color={leaf} position={[0.55, 2.1, 0.25]} scale={0.8} rotation={[0.4, 0.3, 0]} outline={0.06} />
				<ToonMesh geometry={GEO.blob} color={leaf} position={[-0.5, 2.25, -0.2]} scale={0.85} rotation={[0.2, 1, 0]} outline={0.06} />
			</>
		) : (
			<>
				<ToonMesh geometry={GEO.cone} color={leaf} position={[0, 2.0, 0]} scale={[1.2, 1.8, 1.2]} outline={0.04} />
				<ToonMesh geometry={GEO.cone} color={leaf} position={[0, 3.0, 0]} scale={[0.85, 1.5, 0.85]} outline={0.05} />
			</>
		)}
	</group>
);

export const House: React.FC<Placed & {w: number; h: number; d: number; wall: string; roof: string; door?: string}> = ({
	position,
	rotation,
	w,
	h,
	d,
	wall,
	roof,
	door = '#5a3a2e',
}) => (
	<group position={position} rotation={rotation}>
		<ToonMesh geometry={GEO.box} color={wall} position={[0, h / 2, 0]} scale={[w, h, d]} outline={0.012} />
		<ToonMesh
			geometry={GEO.roof}
			color={roof}
			position={[0, h + h * 0.28, 0]}
			rotation={[0, Math.PI / 4, 0]}
			scale={[w * 0.98, h * 0.56, d * 0.98]}
			outline={0.02}
		/>
		<ToonMesh geometry={GEO.box} color={door} position={[0, 0.9, d / 2 + 0.01]} scale={[0.9, 1.8, 0.06]} outline={0.02} />
		{[-1, 1].map((s) => (
			<ToonMesh key={s} geometry={GEO.box} color="#ffe9a8" emissive="#ffcf6a" emissiveIntensity={0.25} position={[s * w * 0.28, h * 0.62, d / 2 + 0.01]} scale={[0.8, 0.8, 0.05]} outline={0.03} />
		))}
	</group>
);

export const Car: React.FC<Placed & {body: string; glass?: string}> = ({position, rotation, scale = 1, body, glass = '#bfe2ff'}) => (
	<group position={position} rotation={rotation} scale={scale}>
		<ToonMesh geometry={GEO.box} color={body} position={[0, 0.55, 0]} scale={[1.8, 0.6, 4]} outline={0.02} />
		<ToonMesh geometry={GEO.box} color={body} position={[0, 1.05, -0.2]} scale={[1.6, 0.5, 2.1]} outline={0.02} />
		<ToonMesh geometry={GEO.box} color={glass} position={[0, 1.07, -0.2]} scale={[1.62, 0.36, 1.9]} outline={0} />
		{[
			[-0.9, 1.3],
			[0.9, 1.3],
			[-0.9, -1.3],
			[0.9, -1.3],
		].map(([x, z], i) => (
			<ToonMesh key={i} geometry={GEO.wheel} color="#2a2540" position={[x, 0.36, z]} rotation={[0, 0, Math.PI / 2]} scale={[0.36, 0.5, 0.36]} outline={0.05} />
		))}
	</group>
);

export const Table: React.FC<Placed & {wood: string}> = ({position, rotation, wood}) => (
	<group position={position} rotation={rotation}>
		<ToonMesh geometry={GEO.box} color={wood} position={[0, 0.85, 0]} scale={[1.7, 0.07, 0.95]} outline={0.01} />
		{[
			[-0.75, -0.38],
			[0.75, -0.38],
			[-0.75, 0.38],
			[0.75, 0.38],
		].map(([x, z], i) => (
			<ToonMesh key={i} geometry={GEO.box} color={wood} position={[x, 0.41, z]} scale={[0.08, 0.82, 0.08]} outline={0.05} />
		))}
	</group>
);

export const Chair: React.FC<Placed & {color: string}> = ({position, rotation, scale = 1, color}) => (
	<group position={position} rotation={rotation} scale={scale}>
		<ToonMesh geometry={GEO.box} color={color} position={[0, 0.48, 0]} scale={[0.5, 0.06, 0.5]} outline={0.03} />
		<ToonMesh geometry={GEO.box} color={color} position={[0, 0.8, -0.22]} scale={[0.5, 0.6, 0.06]} outline={0.03} />
		{[
			[-0.21, -0.21],
			[0.21, -0.21],
			[-0.21, 0.21],
			[0.21, 0.21],
		].map(([x, z], i) => (
			<ToonMesh key={i} geometry={GEO.box} color={color} position={[x, 0.23, z]} scale={[0.05, 0.46, 0.05]} outline={0.08} />
		))}
	</group>
);

export const FlowerPot: React.FC<Placed & {pot: string; leaf: string; flower: string}> = ({position, rotation, scale = 1, pot, leaf, flower}) => (
	<group position={position} rotation={rotation} scale={scale}>
		<ToonMesh geometry={GEO.pot} color={pot} position={[0, 0.35, 0]} outline={0.03} />
		<ToonMesh geometry={GEO.blob} color={leaf} position={[0, 0.85, 0]} scale={0.38} outline={0.06} />
		<ToonMesh geometry={GEO.blob} color={flower} position={[0.12, 1.08, 0.05]} scale={0.14} outline={0.12} />
		<ToonMesh geometry={GEO.blob} color={flower} position={[-0.14, 1.0, -0.08]} scale={0.12} outline={0.12} />
	</group>
);

export const Mug: React.FC<Placed & {color: string}> = ({position, rotation, scale = 1, color}) => (
	<group position={position} rotation={rotation} scale={scale}>
		<ToonMesh geometry={GEO.mug} color={color} position={[0, 0.5, 0]} outline={0.05} />
		<ToonMesh geometry={GEO.cyl} color="#3b2a24" position={[0, 0.96, 0]} scale={[0.44, 0.05, 0.44]} outline={0} />
		<ToonMesh geometry={GEO.handle} color={color} position={[0.55, 0.5, 0]} outline={0.05} />
	</group>
);

/** A run of pickets along X, plus two rails. */
export const Fence: React.FC<{from: number; to: number; z: number; color: string; step?: number}> = ({from, to, z, color, step = 0.55}) => {
	const xs = useMemo(() => {
		const a: number[] = [];
		for (let x = from; x <= to; x += step) a.push(x);
		return a;
	}, [from, to, step]);
	return (
		<group position={[0, 0, z]}>
			{xs.map((x) => (
				<ToonMesh key={x} geometry={GEO.box} color={color} position={[x, 0.6, 0]} scale={[0.14, 1.2, 0.06]} outline={0.04} />
			))}
			{[0.35, 0.95].map((y) => (
				<ToonMesh key={y} geometry={GEO.box} color={color} position={[(from + to) / 2, y, -0.06]} scale={[to - from, 0.1, 0.04]} outline={0.02} />
			))}
		</group>
	);
};
