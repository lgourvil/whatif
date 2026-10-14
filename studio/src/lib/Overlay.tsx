import {loadFont} from '@remotion/fonts';
import React from 'react';
import {AbsoluteFill, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

export const DISPLAY_FONT = 'Anton';
export const BODY_FONT = 'InterHeavy';
loadFont({family: DISPLAY_FONT, url: staticFile('fonts/Anton.woff2')});
loadFont({family: BODY_FONT, url: staticFile('fonts/Inter-800.woff2'), weight: '800'});

/** TikTok safe zone for 1080x1920: top 15%, bottom 20%, right ~140px reserved. */
export const SAFE = {top: 0.15, bottom: 0.2, right: 140, left: 60};

const stroke = (px: number, color = '#120f24') =>
	[
		`${px}px ${px}px 0 ${color}`,
		`-${px}px ${px}px 0 ${color}`,
		`${px}px -${px}px 0 ${color}`,
		`-${px}px -${px}px 0 ${color}`,
		`0 ${px * 1.6}px 0 ${color}`,
		`0 ${px * 3}px ${px * 4}px rgba(0,0,0,0.45)`,
	].join(', ');

export type TextCue = {
	from: number;
	to: number;
	/** big time stamp, e.g. "DAY 23" */
	stamp?: string;
	/** smaller line under the stamp */
	line?: string;
	/** hook title shown at frame 0, no fade-in */
	hook?: boolean;
	/** yPosition as fraction of height (inside the safe zone) */
	y?: number;
	accent?: string;
};

/**
 * One cue: pops in with a spring (unless it's the hook at frame 0),
 * small scale "pop" on entry, fades out over the last 6 frames.
 */
export const Cue: React.FC<{cue: TextCue}> = ({cue}) => {
	const frame = useCurrentFrame();
	const {fps, width, height} = useVideoConfig();
	const {durationInFrames} = useVideoConfig();
	if (frame < cue.from || frame >= cue.to) return null;
	const local = frame - cue.from;
	const instant = cue.hook && cue.from === 0;
	const enter = instant ? 1 : spring({frame: local, fps, config: {damping: 11, stiffness: 220, mass: 0.6}});
	const pop = instant ? 1 : interpolate(local, [0, 4, 9], [1.25, 0.95, 1], {extrapolateRight: 'clamp'});
	// the last cue holds to the final frame so the loop back to frame 0 is seamless
	const out = cue.to >= durationInFrames ? 1 : interpolate(frame, [cue.to - 6, cue.to], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const lineEnter = instant ? 1 : spring({frame: local - 5, fps, config: {damping: 14, stiffness: 160}});
	const usable = width - SAFE.left - SAFE.right;
	const y = (cue.y ?? 0.2) * height;
	return (
		<div
			style={{
				position: 'absolute',
				left: SAFE.left,
				width: usable,
				top: y,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				textAlign: 'center',
				opacity: out,
			}}
		>
			{cue.stamp ? (
				<div
					style={{
						fontFamily: DISPLAY_FONT,
						fontSize: cue.hook ? 132 : 150,
						lineHeight: 1,
						letterSpacing: 2,
						color: cue.accent ?? '#fff6e2',
						textShadow: stroke(7),
						transform: `translateY(${(1 - enter) * 60}px) scale(${pop * (0.6 + 0.4 * enter)})`,
						opacity: Math.min(1, enter * 1.4),
						whiteSpace: 'pre-line',
					}}
				>
					{cue.stamp}
				</div>
			) : null}
			{cue.line ? (
				<div
					style={{
						marginTop: 22,
						fontFamily: BODY_FONT,
						fontWeight: 800,
						fontSize: cue.hook ? 66 : 58,
						lineHeight: 1.12,
						color: '#ffffff',
						textShadow: stroke(5),
						transform: `translateY(${(1 - lineEnter) * 30}px)`,
						opacity: Math.min(1, lineEnter * 1.3),
						whiteSpace: 'pre-line',
						maxWidth: usable,
					}}
				>
					{cue.line}
				</div>
			) : null}
		</div>
	);
};

export const Vignette: React.FC<{strength?: number; tint?: string}> = ({strength = 0.55, tint = '0,0,0'}) => (
	<AbsoluteFill
		style={{
			background: `radial-gradient(ellipse 75% 62% at 50% 48%, rgba(${tint},0) 55%, rgba(${tint},${strength}) 100%)`,
			pointerEvents: 'none',
		}}
	/>
);

/** Film grain: SVG turbulence with a frame-based seed (deterministic). */
export const Grain: React.FC<{opacity?: number}> = ({opacity = 0.07}) => {
	const frame = useCurrentFrame();
	const id = `grain`;
	return (
		<AbsoluteFill style={{opacity, mixBlendMode: 'overlay', pointerEvents: 'none'}}>
			<svg width="100%" height="100%">
				<filter id={id}>
					<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={frame % 24} stitchTiles="stitch" />
					<feColorMatrix type="saturate" values="0" />
				</filter>
				<rect width="100%" height="100%" filter={`url(#${id})`} />
			</svg>
		</AbsoluteFill>
	);
};

export const Flash: React.FC<{amount: number; color?: string}> = ({amount, color = '#ffffff'}) =>
	amount > 0.001 ? <AbsoluteFill style={{background: color, opacity: Math.min(1, amount), pointerEvents: 'none'}} /> : null;

/**
 * Wraps the 3D canvas: RGB split (chromatic aberration) + motion blur on shocks.
 * The SVG filter is only attached when amount > 0, so calm frames stay cheap.
 */
export const ShockLens: React.FC<{aberration: number; blur: number; children: React.ReactNode}> = ({
	aberration,
	blur,
	children,
}) => {
	const a = Math.round(aberration * 10) / 10;
	const filters: string[] = [];
	if (a > 0.2) filters.push('url(#rgbsplit)');
	if (blur > 0.2) filters.push(`blur(${blur.toFixed(1)}px)`);
	return (
		<AbsoluteFill>
			<svg width="0" height="0" style={{position: 'absolute'}}>
				<filter id="rgbsplit" colorInterpolationFilters="sRGB">
					<feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
					<feOffset in="r" dx={a} dy={0} result="r2" />
					<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
					<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
					<feOffset in="b" dx={-a} dy={0} result="b2" />
					<feBlend in="r2" in2="g" mode="screen" result="rg" />
					<feBlend in="rg" in2="b2" mode="screen" />
				</filter>
			</svg>
			<AbsoluteFill style={{filter: filters.length ? filters.join(' ') : undefined}}>{children}</AbsoluteFill>
		</AbsoluteFill>
	);
};

/** Damped decay after a set of impact frames, 0..1. */
export const impactEnvelope = (frame: number, impacts: number[], decay = 10) => {
	let v = 0;
	for (const f of impacts) {
		if (frame >= f && frame < f + decay * 5) v = Math.max(v, Math.exp(-(frame - f) / decay));
	}
	return v;
};
