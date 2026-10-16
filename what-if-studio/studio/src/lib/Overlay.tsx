import React, {useMemo} from 'react';
import {AbsoluteFill, random, spring, useVideoConfig} from 'remotion';

export type Label = {frame: number; text: string; static?: boolean};
export type Caption = {frame: number; end: number; text: string; static?: boolean};

const FONT = `"Inter Display", "Inter", "Arial Black", "DejaVu Sans", "Liberation Sans", Impact, sans-serif`;
const stroke = '0 0 0 #000, 6px 6px 0 #000, -4px 4px 0 #000, 4px -4px 0 #000, -4px -4px 0 #000, 0 10px 24px rgba(0,0,0,.6)';

const grainSvg = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 1.4 -.3'/></filter><rect width='256' height='256' filter='url(#n)'/></svg>`,
);

/** CSS wrapper adding chromatic aberration + motion blur on shocks (wrap the <ThreeCanvas/>). */
export const PostFx: React.FC<{shock: number; children: React.ReactNode}> = ({shock, children}) => {
  const d = Math.min(14, shock * 9);
  const on = d > 0.4;
  return (
    <AbsoluteFill style={{filter: on ? `url(#ca) blur(${(shock * 1.6).toFixed(2)}px)` : undefined}}>
      <svg width={0} height={0} style={{position: 'absolute'}}>
        <filter id="ca" colorInterpolationFilters="sRGB">
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r" />
          <feOffset in="r" dx={d} dy={0} result="ro" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b" />
          <feOffset in="b" dx={-d} dy={0} result="bo" />
          <feBlend in="ro" in2="g" mode="screen" result="rg" />
          <feBlend in="rg" in2="bo" mode="screen" />
        </filter>
      </svg>
      {children}
    </AbsoluteFill>
  );
};

type OverlayProps = {
  frame: number; labels: Label[]; captions: Caption[]; flash: number; tension: number; dark?: number;
  /** full-screen atmospheric haze between the 3D view and the text (0..1), e.g. a white-out */
  haze?: number; hazeColor?: string;
};

/** Label font size that keeps long labels ("PUFF 8 BILLION") on one line inside the safe column. */
export const fitLabel = (text: string, maxW: number, max = 150) => Math.min(max, maxW / (text.length * 0.66));

export const Overlay: React.FC<OverlayProps> = ({frame, labels, captions, flash, tension, dark = 0, haze = 0, hazeColor = '#ffffff'}) => {
  const {fps, width, height} = useVideoConfig();
  const label = [...labels].reverse().find((l) => frame >= l.frame) ?? labels[0];
  const cap = captions.find((c) => frame >= c.frame && frame < c.end);

  const pop = (start: number, isStatic?: boolean) => {
    if (isStatic && frame - start < 1) return {s: 1, y: 0};
    const k = frame - start;
    const s = spring({frame: k, fps, config: {damping: 9, stiffness: 220}});
    return {s: 0.55 + 0.45 * s + (k < 8 ? 0.15 * (1 - k / 8) : 0), y: (1 - s) * 40};
  };
  const lp = pop(label.frame, label.static);
  const cp = cap ? pop(cap.frame, cap.static) : {s: 1, y: 0};
  const capFade = cap && !cap.static ? Math.min(1, (cap.end - frame) / 8) : 1;

  const gx = Math.floor(random(`g${frame}`) * 256);
  const gy = Math.floor(random(`h${frame}`) * 256);
  const safeL = 40, safeW = width * 0.7 + 60; // left ~70 % column; right 140 px stays free
  const vig = 0.55 + tension * 0.2;
  const pulse = 1 + tension * Math.sin(frame * 0.35) * 0.02;

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {haze > 0.001 && <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 55%, ${hazeColor} 0%, ${hazeColor} 35%, ${hazeColor}00 120%)`, opacity: haze}} />}
      {haze > 0.001 && <AbsoluteFill style={{background: hazeColor, opacity: Math.max(0, haze - 0.35) * 0.9}} />}
      <AbsoluteFill style={{background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${vig}) 100%)`}} />
      <AbsoluteFill style={{
        backgroundImage: `url("data:image/svg+xml,${grainSvg}")`, backgroundPosition: `${gx}px ${gy}px`,
        opacity: 0.09, mixBlendMode: 'overlay',
      }} />
      <div style={{position: 'absolute', left: safeL, width: safeW, top: height * 0.17, textAlign: 'center', fontFamily: FONT, color: '#fff'}}>
        <div style={{fontSize: fitLabel(label.text, safeW), fontWeight: 900, whiteSpace: 'nowrap', lineHeight: 1, letterSpacing: 2, textShadow: stroke, transform: `translateY(${lp.y}px) scale(${lp.s * pulse})`, WebkitTextStroke: '3px #000', paintOrder: 'stroke fill'}}>
          {label.text}
        </div>
        {cap && (
          <div style={{marginTop: 26, fontSize: 62, fontWeight: 900, lineHeight: 1.1, textShadow: stroke, opacity: capFade, transform: `translateY(${cp.y}px) scale(${cp.s})`, WebkitTextStroke: '2px #000', paintOrder: 'stroke fill', textTransform: 'uppercase'}}>
            {cap.text}
          </div>
        )}
      </div>
      <AbsoluteFill style={{background: '#000', opacity: dark}} />
      <AbsoluteFill style={{background: '#fff', opacity: flash}} />
    </AbsoluteFill>
  );
};
