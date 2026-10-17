import React, {useMemo} from 'react';
import {AbsoluteFill, random, spring, useVideoConfig} from 'remotion';

export type Label = {frame: number; text: string; static?: boolean};
export type Caption = {frame: number; end: number; text: string; static?: boolean};

const FONT = `"Arial Black", "DejaVu Sans", "Liberation Sans", Impact, sans-serif`;
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

type OverlayProps = {frame: number; labels: Label[]; captions: Caption[]; flash: number; tension: number};

export const Overlay: React.FC<OverlayProps> = ({frame, labels, captions, flash, tension}) => {
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
      <AbsoluteFill style={{background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${vig}) 100%)`}} />
      <AbsoluteFill style={{
        backgroundImage: `url("data:image/svg+xml,${grainSvg}")`, backgroundPosition: `${gx}px ${gy}px`,
        opacity: 0.09, mixBlendMode: 'overlay',
      }} />
      <div style={{position: 'absolute', left: safeL, width: safeW, top: height * 0.17, textAlign: 'center', fontFamily: FONT, color: '#fff'}}>
        <div style={{fontSize: 150, fontWeight: 900, lineHeight: 1, letterSpacing: 2, textShadow: stroke, transform: `translateY(${lp.y}px) scale(${lp.s * pulse})`, WebkitTextStroke: '3px #000', paintOrder: 'stroke fill'}}>
          {label.text}
        </div>
        {cap && (
          <div style={{marginTop: 26, fontSize: 62, fontWeight: 900, lineHeight: 1.1, textShadow: stroke, opacity: capFade, transform: `translateY(${cp.y}px) scale(${cp.s})`, WebkitTextStroke: '2px #000', paintOrder: 'stroke fill', textTransform: 'uppercase'}}>
            {cap.text}
          </div>
        )}
      </div>
      <AbsoluteFill style={{background: '#fff', opacity: flash}} />
    </AbsoluteFill>
  );
};

/* ================================================================================================
 * TikTok overlay v2 (realistic series): frame-0 hook, pinned band, rolling timestamp counter,
 * short curiosity "relances" (+ optional source line), climax card, loop card. Safe zones:
 * nothing in the top 15 % / bottom 20 % / right 140 px; text column ≈ 70 % width on the left.
 * ============================================================================================== */
import {DISPLAY_FONT as _DF, TEXT_FONT as _TF} from './fonts';

export type Relance = {frame: number; end: number; text: string; role: string; source?: string};
export type HookSpec = {top: string; question: string; highlights: string[]; band: string};

const STROKE = (px: number) => ({WebkitTextStroke: `${px}px #000`, paintOrder: 'stroke fill' as const, textShadow: '0 6px 0 rgba(0,0,0,.85), 0 10px 28px rgba(0,0,0,.55)'});
const ACCENT = '#FFD400';

const highlight = (text: string, keys: string[]) => {
  const parts: {t: string; hl: boolean}[] = [];
  let rest = text;
  while (rest.length) {
    let best = -1, key = '';
    for (const k of keys) { const i = rest.indexOf(k); if (i >= 0 && (best < 0 || i < best)) { best = i; key = k; } }
    if (best < 0) { parts.push({t: rest, hl: false}); break; }
    if (best > 0) parts.push({t: rest.slice(0, best), hl: false});
    parts.push({t: key, hl: true});
    rest = rest.slice(best + key.length);
  }
  return parts;
};

/** One digit column that rolls from the previous value to the new one. */
const RollDigit: React.FC<{from: string; to: string; t: number; size: number}> = ({from, to, t, size}) => {
  if (from === to || !/[0-9]/.test(to)) return <span>{to}</span>;
  const y = -t * size * 1.05;
  return (
    <span style={{display: 'inline-block', height: size * 1.05, overflow: 'hidden', verticalAlign: 'top', position: 'relative'}}>
      <span style={{display: 'block', transform: `translateY(${y}px)`}}>
        <span style={{display: 'block', height: size * 1.05}}>{from}</span>
        <span style={{display: 'block', height: size * 1.05}}>{to}</span>
      </span>
    </span>
  );
};

type TikTokProps = {
  frame: number;
  hook: HookSpec;
  hookEnd: number;
  /** [frame, value] steps of the counter */
  steps: [number, number][];
  format: (v: number) => string;
  unit: string;
  label: string;
  relances: Relance[];
  flash: number;
  tension: number;
  /** frame where the loop card starts and where the hook comes back */
  loopStart: number;
  hookBack: number;
};

export const TikTokOverlay: React.FC<TikTokProps> = ({frame, hook, hookEnd, steps, format, unit, label, relances, flash, tension, loopStart, hookBack}) => {
  const {fps, width, height} = useVideoConfig();
  const colL = 56, colW = 830;
  const showHook = frame < hookEnd + 14 || frame >= hookBack;
  // hook → band morph
  const m = frame >= hookBack ? 0 : Math.min(1, Math.max(0, (frame - hookEnd) / 14));
  const me = m * m * (3 - 2 * m);
  const hookZoom = frame >= hookBack ? 1 : 1 + Math.min(frame, hookEnd) * 0.0007;
  const punch = frame >= 2 && frame < 12 ? 0.06 * Math.sin(((frame - 2) / 10) * Math.PI) : 0;

  // counter
  let si = 0;
  for (let i = 0; i < steps.length; i++) if (frame >= steps[i][0]) si = i;
  const cur = format(steps[si][1]);
  const prev = si > 0 ? format(steps[si - 1][1]) : cur;
  const k = frame - steps[si][0];
  const roll = si > 0 ? spring({frame: k, fps, config: {damping: 13, stiffness: 160}}) : 1;
  const pop = si > 0 && k < 12 ? 1 + 0.16 * Math.sin((k / 12) * Math.PI) : 1;
  const v = steps[si][1];
  const counterColor = v >= 8.5 ? '#FF3B2F' : v >= 6 ? '#FF7A1A' : v >= 3 ? ACCENT : '#FFFFFF';
  const showCounter = frame >= hookEnd && frame < loopStart;
  const counterIn = spring({frame: frame - hookEnd, fps, config: {damping: 12, stiffness: 140}});
  const padded = cur.padStart(prev.length, ' ');
  const prevPad = prev.padStart(cur.length, ' ');

  const rel = relances.find((r) => frame >= r.frame && frame < r.end);
  const rk = rel ? frame - rel.frame : 0;
  const rs = rel ? spring({frame: rk, fps, config: {damping: 11, stiffness: 190}}) : 0;
  const rOut = rel ? Math.min(1, (rel.end - frame) / 7) : 0;
  const climax = rel?.role === 'CLIMAX';
  const loop = rel?.role === 'LOOP';

  const gx = Math.floor(random(`g${frame}`) * 256), gy = Math.floor(random(`h${frame}`) * 256);
  const shake = tension > 0.8 ? (random(`sx${frame}`) - 0.5) * 6 * (tension - 0.8) * 5 : 0;

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {/* legibility veil behind the hook */}
      {showHook && (
        <AbsoluteFill style={{background: `linear-gradient(180deg, rgba(0,0,0,${0.55 * (1 - me)}) 0%, rgba(0,0,0,${0.35 * (1 - me)}) 38%, rgba(0,0,0,0) 55%)`}} />
      )}
      {/* HOOK (frame 0, no fade-in) */}
      {showHook && m < 1 && (
        <div style={{position: 'absolute', left: colL, width: colW, top: height * 0.155, textAlign: 'center', color: '#fff',
          transform: `scale(${(hookZoom + punch) * (1 - me * 0.55)}) translateY(${-me * 120}px)`, transformOrigin: '50% 0%', opacity: 1 - me}}>
          <div style={{fontFamily: _DF, fontSize: 250, lineHeight: 0.95, letterSpacing: 4, ...STROKE(9)}}>{hook.top}</div>
          <div style={{fontFamily: _DF, fontSize: 92, lineHeight: 1.06, marginTop: 18, textTransform: 'uppercase', ...STROKE(7)}}>
            {highlight(hook.question, hook.highlights).map((p, i) => (
              <span key={i} style={{color: p.hl ? ACCENT : '#fff'}}>{p.t}</span>
            ))}
          </div>
        </div>
      )}
      {/* PINNED BAND */}
      {m > 0 && frame < hookBack && (
        <div style={{position: 'absolute', left: colL, width: colW, top: height * 0.152, display: 'flex', justifyContent: 'center', opacity: me}}>
          <div style={{fontFamily: _DF, fontSize: 50, color: '#fff', background: 'rgba(0,0,0,0.42)', borderRadius: 14, padding: '6px 22px', ...STROKE(4), textTransform: 'uppercase'}}>
            {highlight(hook.band, hook.highlights).map((p, i) => <span key={i} style={{color: p.hl ? ACCENT : '#fff'}}>{p.t}</span>)}
          </div>
        </div>
      )}
      {/* TIMESTAMP COUNTER */}
      {showCounter && (
        <div style={{position: 'absolute', left: colL, width: colW, top: height * 0.205, textAlign: 'center', color: '#fff',
          transform: `translateX(${shake}px) scale(${(0.6 + 0.4 * counterIn) * pop})`, transformOrigin: '50% 50%'}}>
          <div style={{fontFamily: _TF, fontWeight: 700, fontSize: 40, letterSpacing: 6, ...STROKE(3)}}>{label}</div>
          <div style={{fontFamily: _DF, fontSize: 196, lineHeight: 1.05, color: counterColor, ...STROKE(9), whiteSpace: 'pre'}}>
            {padded.split('').map((ch, i) => <RollDigit key={i} from={prevPad[i] ?? ch} to={ch} t={roll} size={196} />)}
            <span style={{fontSize: 120, marginLeft: 14}}>{unit}</span>
          </div>
        </div>
      )}
      {/* RELANCE / FACT / CLIMAX / LOOP */}
      {rel && (
        <div style={{position: 'absolute', left: colL, width: colW, top: loop ? height * 0.24 : climax ? height * 0.36 : height * 0.355, textAlign: 'center', color: '#fff',
          opacity: rOut, transform: `translateY(${(1 - rs) * 50}px) scale(${0.7 + 0.3 * rs + (rk < 6 && !loop ? 0.08 * (1 - rk / 6) : 0)})`}}>
          <div style={{fontFamily: climax || loop ? _DF : _TF, fontWeight: 700, fontSize: climax ? 150 : loop ? 92 : 66, lineHeight: 1.08,
            textTransform: 'uppercase', color: climax ? '#FF3B2F' : '#fff', ...STROKE(climax ? 9 : 6)}}>
            {rel.text}
          </div>
          {rel.source && (
            <div style={{fontFamily: _TF, fontWeight: 500, fontSize: 30, marginTop: 12, opacity: 0.92, ...STROKE(2)}}>Source : {rel.source}</div>
          )}
        </div>
      )}
      {/* grain + flash */}
      <AbsoluteFill style={{backgroundImage: `url("data:image/svg+xml,${grainSvg}")`, backgroundPosition: `${gx}px ${gy}px`, opacity: 0.05, mixBlendMode: 'overlay'}} />
      <AbsoluteFill style={{background: '#fff', opacity: flash}} />
    </AbsoluteFill>
  );
};
