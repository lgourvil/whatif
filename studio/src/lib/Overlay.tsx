import React, {useMemo} from 'react';
import {random, spring, useVideoConfig, interpolate} from 'remotion';

export type TextItem = {start: number; end: number; text: string; kind: 'stamp' | 'caption'};

export const FONT_FAMILY = 'InterXB, Inter, "Arial Black", sans-serif';

// Safe zones (1080x1920): top 15% = 288px, bottom 20% = 384px, right column 140px.
export const SAFE = {top: 300, left: 64, width: 756, bottom: 1920 - 384};

const stroke = (px: number) =>
	`-webkit-text-stroke: ${px}px #05060d;`;

const TextLayer: React.FC<{frame: number; items: TextItem[]}> = ({frame, items}) => {
	const {fps, durationInFrames} = useVideoConfig();
	const stamps = items.filter((t) => t.kind === 'stamp' && frame >= t.start && frame < t.end);
	const caps = items.filter((t) => t.kind === 'caption' && frame >= t.start && frame < t.end);

	const render = (t: TextItem, top: number, size: number, color: string) => {
		const age = frame - t.start;
		// hook text is readable from frame 0: no entrance on items that start at 0
		const pop = t.start === 0 ? 1 : spring({frame: age, fps, config: {damping: 9, stiffness: 190, mass: 0.6}, from: 1.5, to: 1});
		const outFade = t.end < durationInFrames && t.end - frame < 5 ? (t.end - frame) / 5 : 1;
		const slide = t.start === 0 ? 0 : interpolate(age, [0, 8], [24, 0], {extrapolateRight: 'clamp'});
		return (
			<div
				key={t.start + t.text}
				style={{
					position: 'absolute', left: SAFE.left, top: top + slide, width: SAFE.width,
					fontFamily: FONT_FAMILY, fontSize: size, lineHeight: 1.02, color,
					letterSpacing: -1, textTransform: 'uppercase', transformOrigin: 'left center',
					transform: `scale(${pop})`, opacity: outFade,
					textShadow: '0 6px 0 #05060d, 0 0 26px rgba(0,0,0,0.65), 4px 4px 0 #05060d, -4px 4px 0 #05060d',
					WebkitTextStroke: `${Math.round(size / 14)}px #05060d`, paintOrder: 'stroke fill',
				}}
			>
				{t.text}
			</div>
		);
	};
	return (
		<>
			{stamps.map((t) => render(t, SAFE.top, 128, '#ffffff'))}
			{caps.map((t) => render(t, SAFE.top + 170, 66, '#ffd9a0'))}
		</>
	);
};

const useGrain = () =>
	useMemo(() => {
		const n = 192;
		const c = document.createElement('canvas');
		c.width = c.height = n;
		const ctx = c.getContext('2d')!;
		const img = ctx.createImageData(n, n);
		for (let i = 0; i < n * n; i++) {
			const v = Math.floor(random(`grain${i}`) * 255);
			img.data.set([v, v, v, 255], i * 4);
		}
		ctx.putImageData(img, 0, 0);
		return c.toDataURL('image/png');
	}, []);

type OverlayProps = {
	frame: number;
	texts: TextItem[];
	flash: number; // 0..1 white flash
	shock: number; // 0..1 chromatic aberration / blur drive
	tint?: {color: string; amount: number}; // e.g. underwater wash
	alarm: string;
	tension: number;
};

/** 2D layer: TikTok text, vignette, grain, flash, tint. Chromatic aberration is applied by <PostFx>. */
export const Overlay: React.FC<OverlayProps> = ({frame, texts, flash, shock, tint, alarm, tension}) => {
	const grain = useGrain();
	const gx = Math.floor(random(`gx${frame}`) * 192);
	const gy = Math.floor(random(`gy${frame}`) * 192);
	return (
		<div style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
			{tint && tint.amount > 0.01 ? <div style={{position: 'absolute', inset: 0, background: tint.color, opacity: tint.amount}} /> : null}
			<div
				style={{
					position: 'absolute', inset: 0,
					background: `radial-gradient(ellipse at 50% 48%, rgba(0,0,0,0) 48%, rgba(2,3,10,${0.5 + shock * 0.2}) 100%)`,
				}}
			/>
			{tension > 0.5 ? (
				<div style={{position: 'absolute', inset: 0, boxShadow: `inset 0 0 220px 30px ${alarm}`, opacity: (tension - 0.5) * 0.7 * (0.8 + 0.2 * Math.sin(frame * 0.5))}} />
			) : null}
			<div style={{position: 'absolute', inset: 0, backgroundImage: `url(${grain})`, backgroundPosition: `${gx}px ${gy}px`, opacity: 0.075, mixBlendMode: 'overlay'}} />
			<TextLayer frame={frame} items={texts} />
			{flash > 0.003 ? <div style={{position: 'absolute', inset: 0, background: '#fff', opacity: Math.min(1, flash)}} /> : null}
		</div>
	);
};

/** Wraps the canvas: RGB-split + motion blur driven by `shock` (only applied when needed -> cheap). */
export const PostFx: React.FC<{shock: number; children: React.ReactNode}> = ({shock, children}) => {
	const d = shock * 9;
	const useFx = d > 0.4;
	return (
		<div style={{position: 'absolute', inset: 0, filter: useFx ? `url(#ca) blur(${(shock * 2.2).toFixed(2)}px)` : undefined}}>
			<svg width="0" height="0" style={{position: 'absolute'}}>
				<filter id="ca" colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
					<feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
					<feOffset in="r" dx={d} dy={d * 0.3} result="r2" />
					<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
					<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
					<feOffset in="b" dx={-d} dy={-d * 0.3} result="b2" />
					<feBlend in="r2" in2="g" mode="screen" result="rg" />
					<feBlend in="rg" in2="b2" mode="screen" />
				</filter>
			</svg>
			{children}
		</div>
	);
};
