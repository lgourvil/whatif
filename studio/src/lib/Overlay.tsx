import { loadFont } from "@remotion/fonts";
import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, random, spring, staticFile } from "remotion";

// Local fonts only: nothing is fetched from the network at render time.
export const FONT_STAMP = "LuckiestGuy";
export const FONT_LINE = "Anton";
loadFont({ family: FONT_STAMP, url: staticFile("fonts/LuckiestGuy.woff2"), display: "block" });
loadFont({ family: FONT_LINE, url: staticFile("fonts/Anton.woff2"), display: "block" });

export type TimedText = { frame: number; end: number; stamp: string; line: string };

// TikTok safe zone (1080x1920): nothing in the top 15%, bottom 20%, or right 140px.
export const SAFE = { top: 300, bottom: 384, right: 140, left: 64 };

type CaptionProps = {
  frame: number;
  fps: number;
  texts: TimedText[];
  accent: string; // stamp background
  accentInk: string; // stamp text
  instantFrames?: number[]; // texts starting at these frames show with no entry anim (hook + loop)
};

// Timestamp chip + one-line caption. Spring entry + scale "pop" on each new stamp.
export const Captions: React.FC<CaptionProps> = ({ frame, fps, texts, accent, accentInk, instantFrames = [0] }) => {
  const cur = texts.find((t) => frame >= t.frame && frame < t.end);
  if (!cur) return null;
  const local = frame - cur.frame;
  const instant = instantFrames.includes(cur.frame);
  const prev = texts[texts.indexOf(cur) - 1];
  const stampChanged = !prev || prev.stamp !== cur.stamp || prev.end !== cur.frame;
  const enter = instant ? 1 : spring({ frame: local, fps, config: { damping: 12, stiffness: 180, mass: 0.6 } });
  const pop = instant || !stampChanged ? 1 : 1 + 0.25 * Math.exp(-local / 4) * Math.cos(local * 0.9);
  const lineEnter = instant ? 1 : spring({ frame: local - 3, fps, config: { damping: 14, stiffness: 160 } });
  const exit = interpolate(cur.end - frame, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const isLast = cur === texts[texts.length - 1];
  const out = isLast ? 1 : exit;

  const stroke = "0 0 0 #000, 4px 4px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 10px 24px rgba(0,0,0,0.55)";
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: SAFE.top,
          left: SAFE.left,
          width: 1080 - SAFE.left - SAFE.right - 60,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 22,
          opacity: out,
        }}
      >
        <div
          style={{
            fontFamily: FONT_STAMP,
            fontSize: 92,
            lineHeight: 1,
            padding: "22px 30px 10px",
            background: accent,
            color: accentInk,
            border: "6px solid #111",
            borderRadius: 18,
            boxShadow: "8px 8px 0 #111",
            transform: `translateX(${(1 - enter) * -120}px) scale(${pop}) rotate(-3deg)`,
            transformOrigin: "left center",
            letterSpacing: 2,
          }}
        >
          {cur.stamp}
        </div>
        <div
          style={{
            fontFamily: FONT_LINE,
            fontSize: 78,
            lineHeight: 1.08,
            color: "#fff",
            textShadow: stroke,
            WebkitTextStroke: "3px #000",
            paintOrder: "stroke fill",
            transform: `translateY(${(1 - lineEnter) * 40}px)`,
            opacity: lineEnter,
            textTransform: "uppercase",
          }}
        >
          {cur.line}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Vignette + grain + chromatic aberration + white flash, all frame-driven.
type FxProps = {
  frame: number;
  vignette?: number; // 0..1
  aberration?: number; // px
  flash?: number; // 0..1 white
  tint?: string; // optional color wash
  tintAmount?: number;
  grain?: number; // 0..1
  motionBlur?: number; // px, horizontal-ish blur on shocks
  children?: React.ReactNode; // the 3D layer, so aberration can be applied to it
};

export const ScreenFx: React.FC<FxProps> = ({ frame, vignette = 0.55, aberration = 0, flash = 0, tint, tintAmount = 0, grain = 0.06, motionBlur = 0, children }) => {
  const noiseUrl = useMemo(() => {
    // tiny tiling noise texture generated in code (SVG turbulence), offset moves deterministically
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, []);
  const gx = Math.floor(random(`gx${frame}`) * 256);
  const gy = Math.floor(random(`gy${frame}`) * 256);
  const ab = Math.max(0, aberration);
  const blur = Math.max(0, motionBlur);
  const useFilter = ab > 0.3 || blur > 0.3;
  return (
    <AbsoluteFill>
      {/* Single-pass SVG filter on the 3D layer: RGB split (chromatic aberration) + directional blur */}
      {useFilter ? (
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <filter id="screenfx" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation={`${blur.toFixed(2)} ${(blur * 0.25).toFixed(2)}`} result="b" />
            <feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
            <feOffset in="r" dx={ab} dy={0} result="ro" />
            <feColorMatrix in="b" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
            <feColorMatrix in="b" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bl" />
            <feOffset in="bl" dx={-ab} dy={0} result="bo" />
            <feBlend in="ro" in2="g" mode="screen" result="rg" />
            <feBlend in="rg" in2="bo" mode="screen" />
          </filter>
        </svg>
      ) : null}
      <AbsoluteFill style={{ filter: useFilter ? "url(#screenfx)" : undefined }}>{children}</AbsoluteFill>
      {tint && tintAmount > 0 ? <AbsoluteFill style={{ background: tint, opacity: tintAmount, mixBlendMode: "soft-light" }} /> : null}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 75% 62% at 50% 48%, rgba(0,0,0,0) 55%, rgba(0,0,0,${vignette}) 100%)`,
        }}
      />
      <AbsoluteFill style={{ backgroundImage: noiseUrl, backgroundPosition: `${gx}px ${gy}px`, opacity: grain, mixBlendMode: "overlay" }} />
      {flash > 0.001 ? <AbsoluteFill style={{ background: "#fff", opacity: Math.min(1, flash) }} /> : null}
    </AbsoluteFill>
  );
};
