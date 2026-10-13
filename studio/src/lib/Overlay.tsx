import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, continueRender, delayRender} from 'remotion';

export type TextBeat = {from: number; to: number; main: string; sub?: string; hook?: boolean};

const FONT = 'WhatIfBlack';
let fontLoading: Promise<void> | null = null;
const useFont = () => {
  const [handle] = React.useState(() => delayRender('font'));
  React.useEffect(() => {
    if (!fontLoading) {
      const ff = new FontFace(FONT, `url(${staticFile('fonts/Inter-Black.otf')})`);
      fontLoading = ff.load().then((f) => void document.fonts.add(f));
    }
    fontLoading.then(() => continueRender(handle)).catch(() => continueRender(handle));
  }, [handle]);
};

/** Safe zones: top 15%, bottom 20%, right 140px. Text column = ~70% width on the left. */
export const Overlay: React.FC<{beats: TextBeat[]; impacts: {frame: number; strength: number}[]; tension: number; accent: string; flashFrames?: number}> = ({beats, impacts, tension, accent, flashFrames = 8}) => {
  useFont();
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const idx = beats.findIndex((b) => frame >= b.from && frame < b.to);
  const beat = idx >= 0 ? beats[idx] : null;

  let flash = 0;
  let impact = 0;
  for (const im of impacts) {
    const d = frame - im.frame;
    if (d >= 0 && d < flashFrames) flash = Math.max(flash, im.strength * (1 - d / flashFrames));
    if (d >= 0 && d < 24) impact = Math.max(impact, im.strength * (1 - d / 24));
  }
  const ca = 0.6 + tension * 1.4 + impact * 9;

  let textEl: React.ReactNode = null;
  if (beat) {
    const local = frame - beat.from;
    // hook is legible from frame 0: no fade/entrance on the first beat
    const pop = beat.hook && beat.from === 0 ? 1 : spring({frame: local, fps, config: {damping: 9, stiffness: 220, mass: 0.5}});
    const scale = interpolate(pop, [0, 1], [0.7, 1]);
    const op = beat.hook && beat.from === 0 ? 1 : Math.min(1, local / 3);
    const out = idx === beats.length - 1 ? 1 : interpolate(frame, [beat.to - 6, beat.to], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    const big = beat.hook ? 118 : 138;
    textEl = (
      <div style={{position: 'absolute', left: 64, top: height * 0.17, width: width * 0.68, opacity: op * (beat.hook && beat.from === 0 ? 1 : out), transform: `scale(${scale})`, transformOrigin: 'left top', fontFamily: FONT, color: '#fff', lineHeight: 0.98, letterSpacing: -2, textTransform: 'uppercase'}}>
        <div style={{fontSize: big, WebkitTextStroke: '10px #0a0a14', paintOrder: 'stroke fill', textShadow: `0 8px 0 #0a0a14, 5px 0 0 rgba(255,40,70,${0.35 + tension * 0.3}), -5px 0 0 rgba(40,220,255,${0.35 + tension * 0.3})`}}>{beat.main}</div>
        {beat.sub ? <div style={{fontSize: 54, marginTop: 18, color: accent, WebkitTextStroke: '7px #0a0a14', paintOrder: 'stroke fill', textShadow: '0 5px 0 #0a0a14'}}>{beat.sub}</div> : null}
      </div>
    );
  }

  const grainSeed = (frame * 7) % 97;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {textEl}
      {/* permanent vignette */}
      <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 48%, rgba(0,0,0,${0.5 + tension * 0.25}) 100%)`}} />
      {/* grain from generated turbulence, deterministic seed */}
      <svg width={width} height={height} style={{position: 'absolute', inset: 0, opacity: 0.07, mixBlendMode: 'overlay'}}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed={grainSeed} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
      {flash > 0 ? <AbsoluteFill style={{background: '#fff', opacity: flash}} /> : null}
      <svg width="0" height="0" style={{position: 'absolute'}}>
        <filter id="ca" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb" />
          <feOffset in="r" dx={ca} dy="0" result="ro" />
          <feBlend in="ro" in2="gb" mode="screen" />
        </filter>
      </svg>
    </AbsoluteFill>
  );
};

/** Wrap the 3D canvas: chromatic aberration (RGB shift) + radial blur-ish scale on impacts. */
export const CAWrap: React.FC<{children: React.ReactNode; tension: number; impact: number}> = ({children, tension, impact}) => {
  const ca = 0.6 + tension * 1.4 + impact * 9;
  return <AbsoluteFill style={{filter: ca > 0 ? 'url(#ca)' : undefined, transform: `scale(${1 + impact * 0.03})`}}>{children}</AbsoluteFill>;
};

export const impactAt = (frame: number, impacts: {frame: number; strength: number}[]) => {
  let v = 0;
  for (const im of impacts) {
    const d = frame - im.frame;
    if (d >= 0 && d < 24) v = Math.max(v, im.strength * (1 - d / 24));
  }
  return v;
};
export {Easing};
