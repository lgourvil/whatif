import React, {useMemo} from 'react';
import {BoxGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, SphereGeometry, TorusGeometry} from 'three';
import {ToonMesh} from './ToonMesh';
import {flat} from './ToonMaterial';

type Vec3 = [number, number, number];

/** Shared low-poly part library (built once). */
const useParts = () =>
	useMemo(
		() => ({
			torso: flat(new CapsuleGeometry(0.22, 0.42, 3, 8)),
			head: flat(new IcosahedronGeometry(0.19, 1)),
			limb: flat(new CapsuleGeometry(0.065, 0.42, 2, 6)),
			leg: flat(new CapsuleGeometry(0.08, 0.5, 2, 6)),
			eye: new SphereGeometry(0.028, 8, 6),
			hatBrim: flat(new CylinderGeometry(0.34, 0.34, 0.03, 10)),
			hatTop: flat(new CylinderGeometry(0.17, 0.2, 0.16, 10)),
			scarf: flat(new TorusGeometry(0.15, 0.06, 5, 10)),
			scarfTail: flat(new BoxGeometry(0.1, 0.32, 0.04)),
			can: flat(new CylinderGeometry(0.1, 0.12, 0.22, 8)),
			spout: flat(new CylinderGeometry(0.02, 0.025, 0.3, 5)),
			hood: flat(new SphereGeometry(0.23, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.62)),
			pompom: flat(new IcosahedronGeometry(0.07, 0)),
			antenna: flat(new CylinderGeometry(0.01, 0.01, 0.18, 4)),
			boot: flat(new BoxGeometry(0.14, 0.1, 0.22)),
			cone: flat(new ConeGeometry(0.06, 0.1, 5)),
		}),
		[],
	);

export type Pose = {
	/** walk cycle phase (radians) and amplitude 0..1 */
	walkPhase?: number;
	walk?: number;
	headYaw?: number;
	headPitch?: number;
	/** arm raise in radians (0 = down, PI = straight up), forward swing */
	armL?: number;
	armR?: number;
	armForwardL?: number;
	armForwardR?: number;
	/** whole-body lean */
	lean?: number;
	/** mouth open 0..1 (a dark oval) */
	gasp?: number;
};

type FigureStyle = {
	height: number;
	body: string;
	skin: string;
	legs: string;
	accent: string;
	ink: string;
};

const Figure: React.FC<{
	style: FigureStyle;
	pose: Pose;
	position?: Vec3;
	rotationY?: number;
	children?: (parts: ReturnType<typeof useParts>) => React.ReactNode;
	propInHandR?: React.ReactNode;
}> = ({style, pose, position, rotationY = 0, children, propInHandR}) => {
	const P = useParts();
	const s = style.height / 1.7;
	const w = pose.walk ?? 0;
	const ph = pose.walkPhase ?? 0;
	const legSwing = Math.sin(ph) * 0.5 * w;
	const armSwing = Math.sin(ph) * 0.4 * w;
	const bob = Math.abs(Math.cos(ph)) * 0.04 * w;
	return (
		<group position={position} rotation={[0, rotationY, 0]} scale={s}>
			<group position={[0, bob, 0]} rotation={[pose.lean ?? 0, 0, 0]}>
				{/* legs */}
				{[-1, 1].map((side) => (
					<group key={side} position={[0.11 * side, 0.82, 0]} rotation={[side * legSwing, 0, 0]}>
						<ToonMesh geometry={P.leg} color={style.legs} position={[0, -0.38, 0]} outline={0.018} />
						<ToonMesh geometry={P.boot} color={style.ink} position={[0, -0.76, 0.04]} outline={0.015} />
					</group>
				))}
				{/* torso */}
				<ToonMesh geometry={P.torso} color={style.body} position={[0, 1.12, 0]} outline={0.02} />
				{/* arms (shoulder pivots) */}
				{[
					[-1, pose.armL ?? 0, (pose.armForwardL ?? 0) - armSwing],
					[1, pose.armR ?? 0, (pose.armForwardR ?? 0) + armSwing],
				].map(([side, raise, fwd]) => (
					<group key={side} position={[0.29 * side, 1.38, 0]} rotation={[-fwd, 0, side * raise]}>
						<ToonMesh geometry={P.limb} color={style.body} position={[0, -0.26, 0]} outline={0.016} />
						<ToonMesh geometry={P.head} color={style.skin} position={[0, -0.55, 0]} scale={0.3} outline={0.03} />
						{side === 1 && propInHandR ? <group position={[0, -0.6, 0]}>{propInHandR}</group> : null}
					</group>
				))}
				{/* head */}
				<group position={[0, 1.68, 0]} rotation={[pose.headPitch ?? 0, pose.headYaw ?? 0, 0]}>
					<ToonMesh geometry={P.head} color={style.skin} outline={0.012} />
					{[-1, 1].map((side) => (
						<mesh key={side} geometry={P.eye} position={[0.07 * side, 0.03, 0.165]}>
							<meshBasicMaterial color={style.ink} />
						</mesh>
					))}
					<mesh geometry={P.eye} position={[0, -0.07, 0.17]} scale={[1.3, 0.4 + (pose.gasp ?? 0) * 1.6, 0.6]}>
						<meshBasicMaterial color={style.ink} />
					</mesh>
					{children ? children(P) : null}
				</group>
			</group>
		</group>
	);
};

/**
 * MOSS — the neighbour. Recurring original character.
 * Signature: wide straw hat + long green scarf, always carries a watering can.
 */
export const Moss: React.FC<{pose: Pose; position?: Vec3; rotationY?: number; holdCan?: boolean}> = ({
	pose,
	position,
	rotationY,
	holdCan = true,
}) => {
	const P = useParts();
	const style: FigureStyle = {height: 1.72, body: '#c9a27a', skin: '#e9b896', legs: '#4f5a7a', accent: '#3f9a63', ink: '#221d3f'};
	return (
		<group>
			<Figure
				style={style}
				pose={pose}
				position={position}
				rotationY={rotationY}
				propInHandR={
					holdCan ? (
						<group rotation={[0.2, 0, 0]}>
							<ToonMesh geometry={P.can} color="#7fa7c9" position={[0, -0.1, 0.05]} outline={0.012} />
							<ToonMesh geometry={P.spout} color="#7fa7c9" position={[0, -0.05, 0.22]} rotation={[1.1, 0, 0]} outline={0.01} />
						</group>
					) : null
				}
			>
				{(p) => (
					<>
						<ToonMesh geometry={p.hatBrim} color="#f0c96a" position={[0, 0.13, 0]} outline={0.012} />
						<ToonMesh geometry={p.hatTop} color="#f0c96a" position={[0, 0.21, 0]} outline={0.012} />
						<ToonMesh geometry={p.scarf} color={style.accent} position={[0, -0.2, 0]} rotation={[Math.PI / 2, 0, 0]} outline={0.012} />
						<ToonMesh geometry={p.scarfTail} color={style.accent} position={[0.1, -0.38, 0.14]} rotation={[0.15, 0, 0.2]} outline={0.01} />
					</>
				)}
			</Figure>
		</group>
	);
};

/**
 * PIP — a kid with a yellow raincoat hood and a single antenna-pompom.
 * Recurring original character.
 */
export const Pip: React.FC<{pose: Pose; position?: Vec3; rotationY?: number}> = ({pose, position, rotationY}) => {
	const style: FigureStyle = {height: 1.15, body: '#ffcf3f', skin: '#d79a74', legs: '#3d4a8a', accent: '#e8774d', ink: '#221d3f'};
	return (
		<Figure style={style} pose={pose} position={position} rotationY={rotationY}>
			{(p) => (
				<>
					<ToonMesh geometry={p.hood} color={style.body} position={[0, 0.02, -0.02]} outline={0.012} />
					<ToonMesh geometry={p.antenna} color={style.ink} position={[0, 0.3, 0]} outline={0} />
					<ToonMesh geometry={p.pompom} color={style.accent} position={[0, 0.41, 0]} outline={0.012} />
				</>
			)}
		</Figure>
	);
};

/**
 * POV hands in camera space (camera looks down -Z, y up).
 * Local hand frame: palm centred at origin, fingers along -Z, palm normal -Y.
 * The hand pitches up as it reaches, so we see the back of the hand, fingers
 * spread toward the target; the sleeve runs back/down out of frame.
 */
export const PovHands: React.FC<{
	reach: number;
	spread: number;
	raise?: number;
	tremble?: number;
	frame: number;
	sleeve: string;
	skin: string;
	glow?: string;
	glowIntensity?: number;
	/** 0 open palms, 1 closed fists */
	close?: number;
}> = ({reach, spread, raise = 0, tremble = 0, frame, sleeve, skin, glow = '#9fe3ff', glowIntensity = 0, close = 0}) => {
	const geo = useMemo(
		() => ({
			sleeve: flat(new CylinderGeometry(0.042, 0.05, 0.42, 9)),
			cuff: flat(new CylinderGeometry(0.046, 0.046, 0.04, 9)),
			palm: flat(new BoxGeometry(0.08, 0.026, 0.085)),
			finger: flat(new CapsuleGeometry(0.0082, 0.05, 2, 6)),
			thumb: flat(new CapsuleGeometry(0.0095, 0.04, 2, 6)),
			glow: new IcosahedronGeometry(0.012, 1),
		}),
		[],
	);
	const hand = (side: number) => {
		const tr = tremble * 0.004;
		const jx = Math.sin(frame * 1.7 + side) * tr;
		const jy = Math.cos(frame * 2.3 + side * 2) * tr;
		const x = side * (0.2 - reach * 0.04 - raise * 0.03) + jx;
		const y = -0.36 + reach * 0.08 + raise * 0.3 + jy;
		const z = -0.52 - reach * 0.12;
		const pitch = 0.35 + reach * 0.75 + raise * 0.35;
		const curl = close * 1.5;
		const fingerLen = [0.9, 1, 0.95, 0.78];
		return (
			<group key={side} position={[x, y, z]} rotation={[pitch, side * 0.18, side * -0.32]}>
				<ToonMesh geometry={geo.sleeve} color={sleeve} position={[0, 0.004, 0.27]} rotation={[Math.PI / 2, 0, 0]} outline={0.004} castShadow={false} />
				<ToonMesh geometry={geo.cuff} color={sleeve} position={[0, 0.004, 0.065]} rotation={[Math.PI / 2, 0, 0]} outline={0.004} castShadow={false} />
				<ToonMesh geometry={geo.palm} color={skin} outline={0.004} castShadow={false} />
				{[-1.5, -0.5, 0.5, 1.5].map((k, i) => (
					<group key={i} position={[k * 0.02, 0, -0.04]} rotation={[-curl, k * (0.06 + spread * 0.16), 0]}>
						<ToonMesh
							geometry={geo.finger}
							color={skin}
							position={[0, 0, -0.035 * fingerLen[i]]}
							rotation={[Math.PI / 2, 0, 0]}
							scale={[1, fingerLen[i], 1]}
							outline={0.004}
							castShadow={false}
						/>
						{glowIntensity > 0.01 ? (
							<mesh geometry={geo.glow} position={[0, 0, -0.08 * fingerLen[i]]} scale={1 + glowIntensity * 1.2}>
								<meshBasicMaterial color={glow} transparent opacity={Math.min(1, glowIntensity)} depthWrite={false} />
							</mesh>
						) : null}
					</group>
				))}
				<group position={[side * -0.04, 0.004, 0.012]} rotation={[-curl * 0.5 - 0.2, side * (0.55 + spread * 0.35 - close * 0.4), 0]}>
					<ToonMesh geometry={geo.thumb} color={skin} position={[0, 0, -0.035]} rotation={[Math.PI / 2, 0, 0]} outline={0.004} castShadow={false} />
				</group>
			</group>
		);
	};
	return <group>{[-1, 1].map(hand)}</group>;
};

/**
 * The POV's own legs and shoes, hanging under the camera (world-space, yaw only).
 * Seen when looking down; `dangle` swings them when airborne.
 */
export const PovLegs: React.FC<{
	position: Vec3; // camera position
	yaw: number;
	eyeHeight?: number;
	dangle?: number;
	frame: number;
	pants: string;
	shoe: string;
	shirt: string;
}> = ({position, yaw, eyeHeight = 1.55, dangle = 0, frame, pants, shoe, shirt}) => {
	const P = useParts();
	return (
		<group position={[position[0], position[1] - eyeHeight, position[2]]} rotation={[0, yaw, 0]}>
			{/* chest + belly: hides the tops of the legs when looking straight down */}
			<ToonMesh geometry={P.torso} color={shirt} position={[0, 0.88, 0.02]} scale={[0.95, 0.5, 0.7]} outline={0.012} castShadow />
			{[-1, 1].map((side) => {
				const swing = dangle * (Math.sin(frame * 0.09 + side * 1.4) * 0.18 + 0.12);
				return (
					<group key={side} position={[0.12 * side, 0.86, -0.12]} rotation={[swing + 0.3 + dangle * 0.3, 0, side * dangle * 0.05]}>
						<ToonMesh geometry={P.leg} color={pants} position={[0, -0.4, 0]} scale={1.05} outline={0.016} castShadow />
						<ToonMesh geometry={P.boot} color={shoe} position={[0, -0.8, -0.05]} scale={[1.05, 1.1, 1.25]} outline={0.014} castShadow />
					</group>
				);
			})}
		</group>
	);
};
