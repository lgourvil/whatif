"""Reusable numpy sound engine. Reads timeline.json (same file as the scene) so sound and picture are in sync.
usage: python3 synth.py <timeline.json> <out.wav>"""
import json, sys
import numpy as np
from scipy.signal import butter, lfilter
from scipy.io import wavfile

SR = 48000
rng = np.random.default_rng(7)  # fixed seed: deterministic bed

def lp(x, fc, order=2):
    b, a = butter(order, fc / (SR / 2), 'low'); return lfilter(b, a, x)
def hp(x, fc, order=2):
    b, a = butter(order, fc / (SR / 2), 'high'); return lfilter(b, a, x)
def bp(x, lo, hi):
    b, a = butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band'); return lfilter(b, a, x)
def noise(n): return rng.standard_normal(n)
def interp(frames, pts, N):
    f = np.arange(N) / SR * 30
    return np.interp(f, [p[0] for p in pts], [p[1] for p in pts])
def env_at(N, t0, a, d, amp=1.0):
    t = np.arange(N) / SR - t0
    e = np.where(t < 0, 0, np.where(t < a, t / max(a, 1e-4), np.exp(-(t - a) / d)))
    return e * amp

def stereo(x, pan=0.0):
    return np.stack([x * (1 - max(pan, 0)), x * (1 + min(pan, 0))], 1)

def build(tl):
    N = int(tl['total'] / 30 * SR)
    t = np.arange(N) / SR
    ten = interp(None, tl['tension'], N)
    hit = tl['wall']['hit']
    # water presence: loud calm sea -> drains to silence -> returns after impact
    sea = np.clip(np.interp(np.arange(N) / SR * 30, [0, 150, 700, 1100, 1500, 1520, 1700, 1860, 2040], [1, 0.9, 0.12, 0.0, 0.0, 0.0, 0.0, 0.8, 1.0]), 0, 1)
    under = np.interp(np.arange(N) / SR * 30, [0, 1500, 1512, 1830, 1858, 2040], [0, 0, 1, 1, 0, 0])
    L = np.zeros(N); R = np.zeros(N)

    # --- music pad: slow chords, filter opens with tension
    chords = [[220, 277.2, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [164.8, 207.7, 246.9]]
    pad = np.zeros(N)
    seg = N // len(chords) + 1
    for i in range(N // SR * 2 + 1):
        pass
    for ci in range(10):
        c = chords[ci % 4]; s0 = int(ci * 8.5 * SR); s1 = min(N, s0 + int(11 * SR))
        if s0 >= N: break
        tt = np.arange(s1 - s0) / SR
        w = np.zeros(s1 - s0)
        for fr in c:
            for det in (0.997, 1.003):
                w += np.sin(2 * np.pi * fr * det * tt + rng.random() * 6) + 0.4 * np.sin(2 * np.pi * fr * 2 * det * tt)
        e = np.minimum(1, tt / 3.0) * np.minimum(1, (tt[-1] - tt) / 3.0)
        pad[s0:s1] += w * e
    pad = lp(pad, 900) * 0.02
    pad_t = pad * (0.5 + 0.8 * ten) * (1 - 0.7 * under)
    # tension drone (sub + dissonance) rises toward impact
    drone = (np.sin(2 * np.pi * 55 * t) + 0.6 * np.sin(2 * np.pi * 58.3 * t) + 0.3 * np.sin(2 * np.pi * 110 * t * (1 + 0.01 * ten)))
    drone *= np.clip((ten - 0.25) / 0.75, 0, 1) ** 1.5 * 0.10
    L += pad_t + drone; R += pad_t * 0.95 + drone

    # --- sea: filtered noise with slow swells
    sw = 0.6 + 0.4 * np.sin(2 * np.pi * t / 6.5)
    seaN = lp(noise(N), 700) * sw * sea * 0.35
    L += seaN; R += np.roll(seaN, 300)
    # --- wind (grows as the sea leaves)
    windE = np.clip(1 - sea, 0, 1) * (1 - under) * (0.25 + 0.5 * ten)
    wind = bp(noise(N), 200, 900) * (0.7 + 0.3 * np.sin(2 * np.pi * t / 4.1 + 1)) * windE * 0.25
    L += wind; R += np.roll(wind, 200)

    # --- gulls
    for k in range(14):
        tc = 29.5 + k * 0.7 + rng.random() * 0.4
        d = int(0.35 * SR); s0 = int(tc * SR)
        if s0 + d >= N: continue
        tt = np.arange(d) / SR
        f0 = 1300 + 500 * rng.random()
        y = np.sin(2 * np.pi * (f0 * tt + 700 * tt ** 2 * (1 - tt * 2))) * np.hanning(d) * 0.05
        pan = rng.random() * 1.6 - 0.8
        L[s0:s0 + d] += y * (1 - max(pan, 0)); R[s0:s0 + d] += y * (1 + min(pan, 0))

    # --- footsteps (sand/boots): thump + grit, synced to walk segments
    for w in tl['walk']:
        step = w['cadence']; i = 0
        for f in range(w['from'], w['to'], step):
            s0 = int(f / 30 * SR); d = int(0.12 * SR)
            if s0 + d >= N: break
            tt = np.arange(d) / SR
            th = np.sin(2 * np.pi * 70 * tt) * np.exp(-tt * 38) * 0.35 + lp(noise(d), 2500) * np.exp(-tt * 40) * 0.18
            gain = 0.7 if w['cadence'] > 12 else 1.2
            sgn = 1 if i % 2 else -1
            L[s0:s0 + d] += th * gain * (0.8 + 0.2 * sgn); R[s0:s0 + d] += th * gain * (0.8 - 0.2 * sgn); i += 1
    # ladder clanks
    for f in range(tl['ladder']['from'], tl['ladder']['to'], 18):
        s0 = int(f / 30 * SR); d = int(0.4 * SR); tt = np.arange(d) / SR
        c = (np.sin(2 * np.pi * 880 * tt) + np.sin(2 * np.pi * 1330 * tt)) * np.exp(-tt * 14) * 0.06
        L[s0:s0 + d] += c; R[s0:s0 + d] += c

    # --- heartbeat + breath: accelerate with tension (lub-dub), muffled under water
    tpos = 0.0; beats = []
    while tpos < N / SR:
        beats.append(tpos)
        tn = ten[min(N - 1, int(tpos * SR))]
        tpos += 1.15 - 0.62 * tn
    hb = np.zeros(N)
    for b in beats:
        for off, amp in ((0, 1.0), (0.17, 0.7)):
            s0 = int((b + off) * SR); d = int(0.2 * SR)
            if s0 + d >= N: continue
            tt = np.arange(d) / SR
            hb[s0:s0 + d] += np.sin(2 * np.pi * 52 * tt) * np.exp(-tt * 22) * amp
    hb *= (0.08 + 0.38 * ten)
    L += hb; R += hb
    breath = np.zeros(N)
    tpos = 1.0
    while tpos < N / SR - 1:
        tn = ten[int(tpos * SR)]
        d = int((0.9 - 0.5 * tn) * SR); s0 = int(tpos * SR)
        seg = bp(noise(d), 500, 3500) * np.sin(np.linspace(0, np.pi, d)) ** 2
        breath[s0:s0 + d] += seg * (0.05 + 0.2 * tn) * (1 - under[s0])
        tpos += 2.6 - 1.8 * tn
    L += breath; R += np.roll(breath, 100)

    # --- the wall: rumble swelling (-> impact), whoosh at whip-pan
    rum = lp(noise(N), 140, 3) * np.interp(np.arange(N) / SR * 30, [1020, 1300, 1480, 1500, 1512], [0, 0.6, 1.6, 2.2, 0]) * 0.9
    rum += lp(noise(N), 500) * np.interp(np.arange(N) / SR * 30, [1300, 1500, 1512], [0, 0.5, 0]) * 0.4
    L += rum; R += rum
    s0 = int(1236 / 30 * SR); d = int(0.5 * SR)
    wh = bp(noise(d), 300, 5000) * np.sin(np.linspace(0, np.pi, d)) ** 2 * 0.35
    L[s0:s0 + d] += wh; R[s0:s0 + d] += wh[::-1]

    # --- impacts (boom + noise crash), underwater muffle afterwards
    for im in tl['impacts']:
        s0 = int(im['frame'] / 30 * SR); d = int(2.2 * SR)
        if s0 + d >= N: d = N - s0
        tt = np.arange(d) / SR
        boom = (np.sin(2 * np.pi * (48 - 14 * tt) * tt) * np.exp(-tt * 2.2) * 1.2 + lp(noise(d), 1800) * np.exp(-tt * 3.5) * 0.7) * im['strength']
        L[s0:s0 + d] += boom; R[s0:s0 + d] += boom
    # underwater: low-pass the whole bed, add bubbles
    mask = under > 0.5
    Lw = lp(L, 500); Rw = lp(R, 500)
    L = L * (1 - under) + Lw * under; R = R * (1 - under) + Rw * under
    for k in range(60):
        tc = 51 + rng.random() * 11; s0 = int(tc * SR); d = int(0.12 * SR); tt = np.arange(d) / SR
        f0 = 300 + 900 * rng.random()
        b = np.sin(2 * np.pi * (f0 + 2500 * tt) * tt) * np.exp(-tt * 40) * 0.06
        L[s0:s0 + d] += b; R[s0:s0 + d] += b[::-1]
    # surfacing gasp: breath in at 60.7 s
    s0 = int(1858 / 30 * SR); d = int(0.9 * SR)
    g = bp(noise(d), 600, 4000) * np.sin(np.linspace(0, np.pi, d)) ** 1.5 * 0.5
    L[s0:s0 + d] += g; R[s0:s0 + d] += g
    # exclamation at the whip (ah!) – simple vocal formant burst
    s0 = int(1262 / 30 * SR); d = int(0.35 * SR); tt = np.arange(d) / SR
    v = sum(np.sin(2 * np.pi * h * 190 * tt) / h for h in range(1, 14)); v = bp(v, 600, 1500) * np.hanning(d) * 0.12
    L[s0:s0 + d] += v; R[s0:s0 + d] += v

    # loop-friendly crossfade: fade in/out edges, no hard cuts
    fade = int(0.6 * SR)
    ramp = np.linspace(0, 1, fade)
    for ch in (L, R):
        ch[:fade] *= ramp; ch[-fade:] *= ramp[::-1]
    out = np.stack([L, R], 1)
    out /= max(1e-6, np.abs(out).max()) / 0.9
    return out

if __name__ == '__main__':
    tl = json.load(open(sys.argv[1]))
    y = build(tl)
    wavfile.write(sys.argv[2], SR, (y * 32767).astype(np.int16))
