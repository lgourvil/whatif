import React from 'react';
import * as THREE from 'three';
import {Outlined} from './Outlined';
import {Palette} from './palettes';

const g = {
	torso: new THREE.CylinderGeometry(0.2, 0.28, 0.75, 6),
	head: new THREE.IcosahedronGeometry(0.2, 0),
	hood: new THREE.ConeGeometry(0.24, 0.3, 6),
	antenna: new THREE.CylinderGeometry(0.012, 0.012, 0.42, 4),
	bulb: new THREE.IcosahedronGeometry(0.05, 0),
	limb: new THREE.BoxGeometry(0.13, 0.5, 0.13),
	boot: new THREE.BoxGeometry(0.17, 0.12, 0.26),
	scarf: new THREE.TorusGeometry(0.2, 0.06, 4, 8),
	tail: new THREE.BoxGeometry(0.1, 0.55, 0.04),
	lantern: new THREE.BoxGeometry(0.14, 0.2, 0.14),
	mitten: new THREE.IcosahedronGeometry(0.075, 0),
	finger: new THREE.BoxGeometry(0.1, 0.06, 0.16),
};

export type MarloPose = {
	position: [number, number, number];
	yaw: number;
	walk: number; // phase in radians, 0 amp when still
	walkAmp: number;
	armUp: number; // 0..1 right arm raised (pointing)
	lookYaw: number;
	lookPitch: number;
	lantern: boolean;
	scale?: number;
	scarfWind?: number;
};

/**
 * "Marlo" — recurring original character: yellow raincoat, hood-cap with a tall red-tipped antenna,
 * long red scarf, carries a lantern. Joint rotations are driven purely by the pose (frame-derived).
 */
export const Marlo: React.FC<{pose: MarloPose; palette: Palette}> = ({pose, palette}) => {
	const s = Math.sin(pose.walk) * pose.walkAmp;
	const c = Math.cos(pose.walk) * pose.walkAmp;
	return (
		<group position={pose.position} rotation={[0, pose.yaw, 0]} scale={pose.scale ?? 1}>
			<group position={[0, 0.2 + Math.abs(c) * 0.03, 0]}>
				{/* legs */}
				<group position={[-0.1, 0.45, 0]} rotation={[s * 0.7, 0, 0]}>
					<Outlined geometry={g.limb} color={palette.deep} position={[0, -0.22, 0]} outline={0.35} />
					<Outlined geometry={g.boot} color={palette.alarm} position={[0, -0.5, 0.04]} outline={0.35} />
				</group>
				<group position={[0.1, 0.45, 0]} rotation={[-s * 0.7, 0, 0]}>
					<Outlined geometry={g.limb} color={palette.deep} position={[0, -0.22, 0]} outline={0.35} />
					<Outlined geometry={g.boot} color={palette.alarm} position={[0, -0.5, 0.04]} outline={0.35} />
				</group>
				<Outlined geometry={g.torso} color={palette.warm} position={[0, 0.85, 0]} outline={0.35} />
				{/* arms */}
				<group position={[-0.27, 1.12, 0]} rotation={[-s * 0.5, 0, 0.12]}>
					<Outlined geometry={g.limb} color={palette.warm} position={[0, -0.22, 0]} outline={0.35} />
					{pose.lantern ? (
						<group position={[0, -0.5, 0.05]}>
							<Outlined geometry={g.lantern} color={palette.light} emissive={palette.warm} outline={0.35} />
						</group>
					) : null}
				</group>
				<group position={[0.27, 1.12, 0]} rotation={[s * 0.5 - pose.armUp * 2.7, 0, -0.12 - pose.armUp * 0.2]}>
					<Outlined geometry={g.limb} color={palette.warm} position={[0, -0.22, 0]} outline={0.35} />
					<Outlined geometry={g.mitten} color={palette.light} position={[0, -0.5, 0]} outline={0.35} />
				</group>
				{/* head */}
				<group position={[0, 1.38, 0]} rotation={[pose.lookPitch, pose.lookYaw, 0]}>
					<Outlined geometry={g.head} color={palette.light} outline={0.35} />
					<Outlined geometry={g.hood} color={palette.warm} position={[0, 0.17, 0]} outline={0.35} />
					<Outlined geometry={g.antenna} color={palette.deep} position={[0.06, 0.52, 0]} rotation={[0, 0, -0.12]} outline={1.2} />
					<Outlined geometry={g.bulb} color={palette.alarm} emissive={palette.alarm} position={[0.11, 0.74, 0]} outline={0.35} />
				</group>
				{/* scarf */}
				<Outlined geometry={g.scarf} color={palette.alarm} position={[0, 1.2, 0]} rotation={[Math.PI / 2, 0, 0]} outline={0.35} />
				<Outlined
					geometry={g.tail}
					color={palette.alarm}
					position={[0.05, 0.95, -0.22]}
					rotation={[-0.5 - (pose.scarfWind ?? 0.2) - Math.abs(s) * 0.3, 0, 0.1]}
					outline={0.35}
				/>
			</group>
		</group>
	);
};

/** First-person mittens: placed in camera space by the caller. `reach` 0..1 raises them toward the face. */
export const PovHands: React.FC<{palette: Palette; left: [number, number, number]; right: [number, number, number]; visible: number; tilt?: number}> = ({palette, left, right, visible, tilt = 0}) => {
	if (visible < 0.01) return null;
	const one = (p: [number, number, number], side: number) => (
		<group position={p} scale={visible * 0.72} rotation={[tilt, 0, side * 0.1]}>
			<Outlined geometry={g.mitten} color={palette.light} scale={[1.4, 1.1, 1.8]} outline={0.35} cast={false} />
			<Outlined geometry={g.finger} color={palette.light} position={[0, 0, -0.12]} outline={0.35} cast={false} />
			<Outlined geometry={g.limb} color={palette.warm} position={[side * 0.02, -0.22, 0.2]} rotation={[1.0, 0, 0]} scale={[1, 0.8, 1]} outline={0.35} cast={false} />
		</group>
	);
	return (
		<>
			{one(left, -1)}
			{one(right, 1)}
		</>
	);
};
