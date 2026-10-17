"""Legacy soundtrack recipe for ocean-drains (standalone). usage: python3 ocean_drains.py <timeline.json> <out.wav>
usage: python3 synth.py <timeline.json> <out.wav>"""
import json, sys, numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 48000
tl = json.load(open(sys.argv[1]))
fps = tl["fps"]; dur = tl["durationInFrames"] / fps
N = int(dur * SR); t = np.arange(N) / SR
rng = np.random.default_rng(7)

def tens_at(sec):
    k = np.array(tl["tension"], float)
    return np.interp(sec, k[:, 0] / fps, k[:, 1])
T = tens_at(t)

def lp(x, fc, order=2):
    return sosfilt(butter(order, min(fc, SR / 2 - 100), "low", fs=SR, output="sos"), x)
def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x)
def bp(x, a, b):
    return sosfilt(butter(2, [a, b], "band", fs=SR, output="sos"), x)
def noise(n): return rng.standard_normal(n)
def env_at(sec_pts, vals): return np.interp(t, sec_pts, vals)
def place(buf, snd, sec, gain=1.0):
    i = int(sec * SR); j = min(N, i + len(snd))
    if i < N: buf[i:j] += snd[: j - i] * gain

# ---- music pad: slow chords, filter opens with tension (block-wise cutoff) ----
chords = [[110.0, 164.8, 220.0, 277.2], [98.0, 146.8, 196.0, 246.9], [87.3, 130.8, 174.6, 220.0], [92.5, 138.6, 185.0, 233.1]]
pad = np.zeros(N)
seg = 8.0
for k in range(int(np.ceil(dur / seg))):
    s0, s1 = k * seg, min(dur, (k + 1) * seg + 2.0)
    i0, i1 = int(s0 * SR), min(N, int(s1 * SR))
    tt = t[i0:i1]
    ch = chords[k % len(chords)]
    x = np.zeros(len(tt))
    for f in ch:
        for det in (-0.4, 0.4):
            x += np.sin(2 * np.pi * (f + det) * tt) + 0.35 * np.sin(2 * np.pi * 2 * (f + det) * tt)
    e = np.minimum(1, (tt - s0) / 3.0) * np.minimum(1, (s1 - tt) / 2.0)  # crossfade overlap
    mt = float(np.mean(tens_at(tt)))
    x = lp(x, 350 + 3200 * mt ** 1.5) * e
    pad[i0:i1] += x
pad /= np.max(np.abs(pad)) + 1e-9
pad *= 0.34 * (0.55 + 0.6 * T)

# ---- sub drone rising with tension ----
drone = np.sin(2 * np.pi * (41 + 14 * T) * t) * (0.1 + 0.3 * T ** 2)

# ---- ocean / wind beds ----
surf_env = env_at([0, 8, 20, 45, 49], [0.9, 0.5, 0.05, 0.0, 0.0]) * (0.5 + 0.5 * np.sin(2 * np.pi * t / 7.5) ** 2)
surf = lp(noise(N), 900) * surf_env * 0.22
wind = bp(noise(N), 150, 900) * env_at([0, 12, 40, 60, 64, 66], [0.05, 0.15, 0.25, 0.4, 0.6, 0.0]) * 0.28
# the water returning: roar that grows from the moment the wall appears
wall_t0 = 1440 / fps; hit = 1962 / fps
roar = lp(noise(N), 500) * env_at([0, wall_t0, hit - 4, hit, hit + 0.5, hit + 1.5], [0, 0, 0.35, 0.9, 0.0, 0.0]) * 0.8
# night: faint crystal chime shimmer
shimmer = np.zeros(N)
for kk in range(40):
    ts = 24 + kk * 1.0 + rng.random() * 0.8
    if ts > 63: break
    f = rng.choice([880, 1318, 1760, 1175])
    n = int(1.8 * SR); tt = np.arange(n) / SR
    place(shimmer, np.sin(2 * np.pi * f * tt) * np.exp(-tt * 2.2) * 0.05, ts)

# ---- footsteps, cadence follows speed through the timeline (walk then run) ----
steps = np.zeros(N)
def step(sec, g, sand=True):
    n = int(0.12 * SR)
    s = noise(n); s = (bp(s, 200, 1800) if sand else lp(s, 400)) * np.exp(-np.arange(n) / SR * 40)
    place(steps, s, sec, g)
for a, b, per in [(3.4, 8.0, 0.62), (10.0, 46.0, 0.55), (54.0, 65.4, 0.30)]:
    sec = a
    while sec < b:
        step(sec, 0.35 + 0.25 * float(tens_at(sec)))
        sec += per * (1 + 0.04 * rng.standard_normal())

# ---- heartbeat + breath, both accelerate with tension ----
heart = np.zeros(N)
sec = 0.5
while sec < dur - 1:
    tn = float(tens_at(sec)); bpm = 62 + 90 * tn; per = 60 / bpm
    for off, g in ((0, 1.0), (0.17 * per / 0.8 * 0.8 + 0.12, 0.7)):
        n = int(0.22 * SR); tt = np.arange(n) / SR
        place(heart, np.sin(2 * np.pi * 52 * tt) * np.exp(-tt * 22) * g, sec + off, 0.5 * (0.15 + 0.85 * tn))
    sec += per
breath = np.zeros(N)
sec = 2.0
while sec < 64.5:
    tn = float(tens_at(sec)); per = 4.2 - 2.9 * tn
    n = int(per * 0.55 * SR); tt = np.arange(n) / SR
    e = np.sin(np.pi * tt / (n / SR)) ** 2
    place(breath, bp(noise(n), 400, 3200) * e, sec, 0.07 + 0.12 * tn)
    sec += per

# ---- event SFX from timeline ----
sfx = np.zeros(N)
def boom(sec, g):
    n = int(2.5 * SR); tt = np.arange(n) / SR
    s = np.sin(2 * np.pi * (70 * np.exp(-tt * 1.2) + 28) * tt) * np.exp(-tt * 1.6) + lp(noise(n), 300) * np.exp(-tt * 2.5) * 0.7
    place(sfx, s, sec, g)
def rumble(sec, g):
    n = int(3 * SR); tt = np.arange(n) / SR
    place(sfx, lp(noise(n), 160) * np.sin(np.pi * tt / 3) ** 2, sec, g)
def whoosh(sec, g, d=0.9):
    n = int(d * SR); tt = np.arange(n) / SR
    x = noise(n); fc = 300 + 5000 * np.sin(np.pi * tt / d)
    y = np.zeros(n); blk = 480
    for i in range(0, n, blk):
        y[i:i + blk] = bp(x[i:i + blk], max(100, fc[i] * 0.5), min(20000, fc[i] * 1.5))
    place(sfx, y * np.sin(np.pi * tt / d) ** 2, sec - d * 0.5, g)
def crash(sec, g):
    n = int(4 * SR); tt = np.arange(n) / SR
    s = lp(noise(n), 3000) * np.exp(-tt * 1.3) + np.sin(2 * np.pi * (55 * np.exp(-tt * 0.9) + 24) * tt) * np.exp(-tt * 1.0) * 1.4
    place(sfx, s, sec, g)
for ev in tl["sfx"]:
    s = ev["frame"] / fps
    {"boom": lambda: boom(s, 0.9), "rumble": lambda: rumble(s, 0.7), "whoosh": lambda: whoosh(s, 0.7), "crash": lambda: crash(s, 1.6)}[ev["type"]]()
for m in tl["movements"][1:]:  # soft whoosh on each camera movement boundary
    whoosh(m["start"] / fps, 0.18, 0.6)
for l in tl["labels"]:         # tick on each timestamp pop
    n = int(0.15 * SR); tt = np.arange(n) / SR
    place(sfx, np.sin(2 * np.pi * 1200 * tt) * np.exp(-tt * 35), l["frame"] / fps, 0.12)

# ---- mix, loop-safe fades, stereo spread ----
mono = pad + drone * 0.5 + surf + wind + roar + shimmer + steps + heart + breath + sfx
fade = np.minimum(1, t / 0.05) * np.minimum(1, (dur - t) / 0.4)
mono *= fade
d = int(0.012 * SR)
L = mono + 0.0 * mono
R = np.roll(mono, d) * 0.96
wide = lp(noise(N), 1500) * (surf_env * 0.06)
L += wide; R -= wide
st = np.stack([L, R], 1)
st = np.tanh(st / (np.max(np.abs(st)) * 0.8) * 1.1) * 0.9
wavfile.write(sys.argv[2], SR, (st * 32767).astype(np.int16))
print("wrote", sys.argv[2], dur, "s")
