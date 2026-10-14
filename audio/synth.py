#!/usr/bin/env python3
"""Reusable numpy sound engine for the What If series.

Reads the episode's timeline.json (same file the Remotion scene reads) so every sound lands on
the exact frame of its camera movement / impact / text. Output: 48 kHz stereo WAV, loudnorm'd
to about -14 LUFS with ffmpeg.

usage: python3 audio/synth.py studio/src/episodes/<slug>/timeline.json studio/public/audio/<slug>.wav
"""
import json, subprocess, sys, tempfile, os
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 48000


# ---------------------------------------------------------------- helpers
def lp(x, fc, order=2): return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x)
def hp(x, fc, order=2): return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi, order=2): return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)
def smooth(x): x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)


class Mix:
    def __init__(self, n):
        self.n = n
        self.L = np.zeros(n, np.float32)
        self.R = np.zeros(n, np.float32)

    def add(self, x, gain=1.0, pan=0.0, at=0):
        """pan -1..1 (equal power). x may be mono; `at` = start sample."""
        if at >= self.n: return
        x = x[: self.n - at] if at >= 0 else x[-at:]
        at = max(at, 0)
        a = (pan + 1) * np.pi / 4
        self.L[at:at + len(x)] += (np.cos(a) * gain * x).astype(np.float32)
        self.R[at:at + len(x)] += (np.sin(a) * gain * x).astype(np.float32)

    def add_st(self, l, r, gain=1.0):
        self.L += (l * gain).astype(np.float32)
        self.R += (r * gain).astype(np.float32)


def curve(pts, n, scale=1.0):
    """[[frame, value]] -> per-sample curve (linear)"""
    fr = np.array([p[0] for p in pts], float) / FPS
    v = np.array([p[1] for p in pts], float)
    return np.interp(np.arange(n) / SR, fr, v) * scale


def exp_env(n, tau): return np.exp(-np.arange(n) / (tau * SR))


def saw(f, t, ph=0.0, harm=7):
    return sum(np.sin(2 * np.pi * f * h * t + ph * h) / h for h in range(1, harm + 1))


# ---------------------------------------------------------------- main
tl = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
FPS = tl['fps']
DUR = tl['duration'] / FPS
N = int(DUR * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(14102026)
T = curve(tl['tension'], N)                      # tension 0..1
LV = curve(tl['seaLevel'], N)                    # sea level (m)
drained = np.clip(-LV / 14.6, 0, 1)
fs = lambda fr: fr / FPS                         # frame -> seconds
mix = Mix(N)
noise = lambda n=N: rng.standard_normal(n).astype(np.float32)

# --- 1. pad: slow chords, filter opens with tension --------------------------------------
CH = {
    'Am': [110, 164.8, 220, 261.6, 329.6], 'F': [87.3, 130.8, 174.6, 220, 261.6],
    'C': [65.4, 130.8, 196, 261.6, 329.6], 'E': [82.4, 123.5, 164.8, 207.7, 246.9, 233.1],
}
sched = [(0, 'Am'), (9, 'F'), (18, 'C'), (27, 'Am'), (36, 'F'), (45, 'C'), (54, 'E'), (60, 'E'), (66, 'Am')]
edges = [s[0] for s in sched] + [DUR]
pad = np.zeros(N, np.float32)
tt = t.astype(np.float64)
for i, (s0, name) in enumerate(sched):
    a, b = edges[i], edges[i + 1]
    xf = 2.5
    env = smooth((tt - (a - xf / 2)) / xf) * (1 - smooth((tt - (b - xf / 2)) / xf))
    if i == 0: env = 1 - smooth((tt - (b - xf / 2)) / xf)
    if i == len(sched) - 1: env = smooth((tt - (a - xf / 2)) / xf)
    lo, hi = int(max(0, (a - 2) * SR)), int(min(N, (b + 2) * SR))
    seg = tt[lo:hi]
    v = np.zeros(hi - lo)
    for k, f in enumerate(CH[name]):
        v += saw(f, seg, ph=k * 1.3, harm=6) + saw(f * 1.004, seg, ph=k * 2.1, harm=6)
    pad[lo:hi] += (v * env[lo:hi]).astype(np.float32) * 0.05
pad_dark, pad_bright = lp(pad, 520), lp(pad, 3400)
pad = pad_dark * (1 - T) + pad_bright * T
pad *= (0.8 + 0.5 * (0.5 + 0.5 * np.sin(2 * np.pi * t / 7.0)))
duck = 1 - 0.92 * np.exp(-np.clip(t - fs(1745), 0, None) / 1.2) * (t > fs(1745)) * (t < fs(1745) + 4)
duck *= 1 - 0.7 * smooth((t - fs(1990)) / 0.5) * (1 - smooth((t - fs(1990) - 3.5) / 3))
mix.add_st(pad * duck, np.roll(pad, 90) * duck, 0.9)

# --- 2. moon drone (look-up) + rumble (quakes) ------------------------------------------
moon_env = curve([[900, 0], [1100, 0.7], [1320, 1], [1735, 1.2], [1745, 0], [2159, 0]], N)
drone = (np.sin(2 * np.pi * 55 * t) + 0.7 * np.sin(2 * np.pi * 82.6 * t + 1) + 0.4 * np.sin(2 * np.pi * (110 + 3 * T) * t))
drone *= moon_env * (0.6 + 0.4 * np.sin(2 * np.pi * t * (0.15 + 0.6 * T)))
mix.add(drone.astype(np.float32), 0.12)
rumble = lp(noise(), 70, 3) * curve([[1440, 0], [1745, 1], [1750, 0], [2159, 0]], N)
mix.add(rumble * 6.0, 0.5)

# --- 3. surf: waves fade as the sea leaves, calm waves come back at the end --------------
surf_raw = lp(noise(), 1200) * 0.5 + lp(noise(), 400) * 0.8
swell = 0.55 + 0.45 * np.sin(2 * np.pi * t / 6.5 - 1.0) ** 2
surf_gain = (1 - smooth(drained * 2.2)) * swell * 0.3
surf_gain += smooth((t - fs(2020)) / 3.0) * swell * 0.3 * (t < DUR + 1)
surf_gain *= (1 - (t > fs(1745)) * (t < fs(2020)))
mixL = surf_raw * surf_gain
mixR = np.roll(surf_raw, 4800) * surf_gain
mix.add_st(mixL, mixR, 0.8)

# --- 4. wind (rises with tension, dead calm at 'no sound') ------------------------------
w = bp(noise(), 150, 900) * 1.4
wind_gain = (0.04 + 0.5 * T ** 1.5) * (0.6 + 0.4 * np.sin(2 * np.pi * t / 4.1 + 0.5))
wind_gain *= 1 - 0.85 * (curve([[360, 0], [420, 1], [900, 1], [960, 0.3], [2159, 0]], N))
mix.add_st(w * wind_gain, np.roll(w, 2400) * wind_gain, 0.7)

# --- 5. rising-water shimmer: pings that follow how much sea has left -------------------
n_ping = 260
for i in range(n_ping):
    ts = rng.uniform(1.0, fs(1745))
    p = np.interp(ts, np.arange(N) / SR, np.clip(-LV / 12, 0, 1)) + 0.05
    if rng.random() > p: continue
    L_ = int(0.5 * SR)
    tp = np.arange(L_) / SR
    f0 = rng.uniform(1400, 4800)
    ping = np.sin(2 * np.pi * f0 * tp) * np.exp(-tp / 0.12) + 0.3 * np.sin(2 * np.pi * f0 * 2.01 * tp) * np.exp(-tp / 0.05)
    mix.add(ping.astype(np.float32), 0.028 + 0.02 * p, pan=rng.uniform(-0.9, 0.9), at=int(ts * SR))
# gulls at the opening and at the very end (they bookend the loop)
def gull(f0, dur=0.55):
    n = int(dur * SR); tp = np.arange(n) / SR
    f = f0 * (1 + 0.35 * np.exp(-tp / 0.2)) - 300 * tp
    ph = 2 * np.pi * np.cumsum(f + 40 * np.sin(2 * np.pi * 30 * tp)) / SR
    return (np.sin(ph) + 0.4 * np.sin(2 * ph)) * np.sin(np.pi * tp / dur) ** 0.7
for ts, f0, pn in [(0.9, 1900, -0.5), (1.55, 1700, -0.4), (DUR - 1.8, 1850, 0.4)]:
    mix.add(gull(f0).astype(np.float32), 0.11, pan=pn, at=int(ts * SR))

# --- 6. footsteps, ladder taps, running -------------------------------------------------
def tap(kind):
    if kind == 'rung':
        n = int(0.14 * SR); tp = np.arange(n) / SR
        return (np.sin(2 * np.pi * 420 * tp) * np.exp(-tp / 0.03) + 0.5 * bp(noise(n), 2000, 5000) * np.exp(-tp / 0.01)) * 0.8
    if kind == 'sand':
        n = int(0.22 * SR); tp = np.arange(n) / SR
        return lp(noise(n), 900) * np.exp(-tp / 0.05) * 1.8 + np.sin(2 * np.pi * 70 * tp) * np.exp(-tp / 0.05) * 0.5
    n = int(0.25 * SR); tp = np.arange(n) / SR   # run
    return lp(noise(n), 1400) * np.exp(-tp / 0.06) * 2.4 + np.sin(2 * np.pi * 62 * tp) * np.exp(-tp / 0.07)
a, b = 385 / FPS, 570 / FPS
for k in range(26):
    ts = a + (k + 0.5) * (b - a) / 26
    mix.add(tap('rung').astype(np.float32), 0.35, pan=(-0.25 if k % 2 else 0.25), at=int(ts * SR))
ts = fs(610)
while ts < fs(955):
    mix.add(tap('sand').astype(np.float32), 0.3, pan=rng.uniform(-0.2, 0.2), at=int(ts * SR)); ts += 1 / 1.9
ts = fs(1360)
while ts < fs(1735):
    mix.add(tap('run').astype(np.float32), 0.5 + 0.2 * np.interp(ts, np.arange(N) / SR, T), pan=rng.uniform(-0.2, 0.2), at=int(ts * SR)); ts += 1 / 3.2
# water-dripping 'fish flop' slaps while the seabed is dry
for ts in np.sort(rng.uniform(fs(640), fs(1300), 70)):
    n = int(0.12 * SR); tp = np.arange(n) / SR
    s = bp(noise(n), 500, 2500) * np.exp(-tp / 0.025)
    mix.add(s.astype(np.float32), 0.25 * float(np.interp(ts, np.arange(N) / SR, 1 - smooth((t - 14) / 20) * 0.6)), pan=rng.uniform(-0.9, 0.9), at=int(ts * SR))

# --- 7. heartbeat + breath, accelerating with tension -----------------------------------
beat_t, ts = [], 4.0
while ts < DUR - 2:
    beat_t.append(ts)
    Tn = float(np.interp(ts, np.arange(N) / SR, T))
    ts += 60.0 / (58 + 95 * Tn ** 1.2)
for ts in beat_t:
    Tn = float(np.interp(ts, np.arange(N) / SR, T))
    if ts > fs(1990) and ts < fs(2060): Tn *= 0.6
    n = int(0.3 * SR); tp = np.arange(n) / SR
    lub = np.sin(2 * np.pi * (58 - 10 * tp * 6) * tp) * np.exp(-tp / 0.07)
    dub = np.sin(2 * np.pi * (66 - 12 * tp * 6) * tp) * np.exp(-tp / 0.06)
    gap = int((0.26 - 0.08 * Tn) * SR)
    beat = np.zeros(n + gap)
    beat[:n] += lub; beat[gap:gap + n] += dub * 0.7
    mix.add(beat.astype(np.float32), 0.16 + 0.55 * Tn ** 1.1, at=int(ts * SR))
ts = 3.0
while ts < DUR - 2:
    Tn = float(np.interp(ts, np.arange(N) / SR, T))
    dur = 0.55 - 0.25 * Tn
    n = int(dur * SR); tp = np.arange(n) / SR
    br = bp(noise(n), 700, 3600) * np.sin(np.pi * tp / dur) ** 2
    mix.add(br.astype(np.float32), 0.06 + 0.2 * Tn, pan=0.0, at=int(ts * SR))
    ts += dur + 2.0 - 1.35 * Tn
# the big gasp when the water drops us back on the pier
n = int(0.7 * SR); tp = np.arange(n) / SR
mix.add((bp(noise(n), 500, 4500) * np.sin(np.pi * tp / 0.7) ** 1.5).astype(np.float32), 0.7, at=int(fs(1960) * SR))

# --- 8. movement whooshes, impacts, the snap, the surge ---------------------------------
def whoosh(dur, lo, hi, rise=True):
    n = int(dur * SR); tp = np.arange(n) / SR
    base = noise(n)
    bands = [bp(base, f, f * 1.8) for f in np.geomspace(lo, hi, 5)]
    out = np.zeros(n)
    for i, bnd in enumerate(bands):
        c = (i + 0.5) / 5 if rise else 1 - (i + 0.5) / 5
        out += bnd * np.exp(-((tp / dur - c) ** 2) / 0.04)
    return out * np.sin(np.pi * tp / dur) ** 1.3
for m in tl['movements'][1:]:
    s = fs(m['start'])
    mix.add(whoosh(1.1, 200, 5000).astype(np.float32), 0.5, pan=0.0, at=int((s - 0.35) * SR))
for im in tl['impacts']:
    ts = fs(im['frame']); k = im['strength']
    n = int(1.6 * SR); tp = np.arange(n) / SR
    boom = np.sin(2 * np.pi * (46 - 14 * np.minimum(tp, 0.8)) * tp) * np.exp(-tp / 0.55) + lp(noise(n), 300) * np.exp(-tp / 0.25) * 0.9
    mix.add(boom.astype(np.float32), 0.8 * k, at=int(ts * SR))
# snap: a sucking inhale just before, then the sub drop and the roar of water coming home
ts = fs(1745)
n = int(2.0 * SR); tp = np.arange(n) / SR
mix.add((bp(noise(n), 100, 1800) * smooth(tp / 1.8) * 0.9).astype(np.float32), 0.7, at=int((ts - 1.8) * SR))
n = int(5.5 * SR); tp = np.arange(n) / SR
roar = lp(noise(n), 3000) * smooth(tp / 2.2) * np.exp(-np.clip(tp - 3.5, 0, None) / 0.9)
roar += bp(noise(n), 60, 260) * 3 * smooth(tp / 1.5) * np.exp(-np.clip(tp - 3.5, 0, None) / 0.9)
mix.add_st(roar * 1.1, np.roll(roar, 1200), 0.8) if False else mix.add(roar.astype(np.float32), 0.8, pan=0.0, at=int((ts + 0.3) * SR))
# splash on breaking the surface
ts = fs(1946); n = int(1.4 * SR); tp = np.arange(n) / SR
mix.add((hp(noise(n), 1500) * np.exp(-tp / 0.35) + lp(noise(n), 700) * np.exp(-tp / 0.5)).astype(np.float32), 0.7, at=int(ts * SR))

# --- 9. assemble: underwater muffle, soft limit, edge fades -----------------------------
sub = smooth((t - fs(1815)) / 0.4) * (1 - smooth((t - fs(1946)) / 0.15))
L, R = mix.L, mix.R
L = L * (1 - sub) + lp(L, 520) * sub
R = R * (1 - sub) + lp(R, 520) * sub
edge = np.minimum(1, np.minimum(t, DUR - t) / 0.03)
L = np.tanh(L * 1.3) * edge; R = np.tanh(R * 1.3) * edge
pk = max(np.abs(L).max(), np.abs(R).max())
st = np.stack([L, R], 1) / pk * 0.9
tmp = tempfile.mktemp(suffix='.wav')
wavfile.write(tmp, SR, (st * 32767).astype(np.int16))
os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-ac', '2', OUT], check=True)
os.remove(tmp)
print('wrote', OUT, f'{DUR:.1f}s')
