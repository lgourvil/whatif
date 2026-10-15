"""Soundtrack for 'Shadows at Noon'. Reads the SAME timeline.json as the Remotion scene.
usage: python3 synth_shadows.py <timeline.json> <out.wav>
TikTok sound-design codes: clock tick that accelerates, whisper bed, reverse riser -> 0.4 s of silence -> hit, sub drops on every reveal."""
import json, sys, numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 48000
tl = json.load(open(sys.argv[1]))
fps = tl["fps"]; dur = tl["durationInFrames"] / fps
N = int(dur * SR); t = np.arange(N) / SR
rng = np.random.default_rng(11)
K = np.array(tl["tension"], float)
def tens(sec): return np.interp(sec, K[:, 0] / fps, K[:, 1])
T = tens(t)
def lp(x, fc): return sosfilt(butter(2, min(fc, SR / 2 - 100), "low", fs=SR, output="sos"), x)
def bp(x, a, b): return sosfilt(butter(2, [a, min(b, SR / 2 - 100)], "band", fs=SR, output="sos"), x)
def noise(n): return rng.standard_normal(n)
def place(buf, snd, sec, g=1.0):
    i = int(sec * SR); j = min(N, i + len(snd))
    if 0 <= i < N: buf[i:j] += snd[: j - i] * g

hit_t = 1640 / fps; black0 = 1668 / fps; black1 = 1840 / fps

# drone: minor cluster, filter opens with tension; sub swells
drone = np.zeros(N)
for f in (55.0, 82.4, 98.0, 110.0):
    drone += np.sin(2 * np.pi * f * t + np.sin(2 * np.pi * 0.1 * t)) + 0.4 * np.sin(2 * np.pi * (f * 1.005) * t)
drone = lp(drone, 500) * (0.05 + 0.12 * T)
sub = np.sin(2 * np.pi * (36 + 10 * T) * t) * (0.1 + 0.4 * T ** 2)

# whispers: formant-filtered noise swells (distant, grows as shadows rise)
whisp = np.zeros(N)
sec = 7.0
while sec < hit_t - 1:
    n = int(rng.uniform(0.8, 1.6) * SR); tt = np.arange(n) / SR
    s = bp(noise(n), rng.uniform(900, 1500), rng.uniform(2200, 3600)) * np.sin(np.pi * tt / (n / SR)) ** 2
    place(whisp, s, sec, 0.05 + 0.2 * float(tens(sec)))
    sec += rng.uniform(0.35, 0.9) / (0.6 + float(tens(sec)))

# clock: tick every second, accelerating; hard tick on each label
tick = np.zeros(N)
def tk(sec, g, f=1800):
    n = int(0.05 * SR); tt = np.arange(n) / SR
    place(tick, np.sin(2 * np.pi * f * tt) * np.exp(-tt * 120) + noise(n) * np.exp(-tt * 200) * 0.3, sec, g)
sec = 0.4
while sec < hit_t - 1.0:
    tk(sec, 0.18 + 0.2 * float(tens(sec)))
    sec += max(0.18, 1.0 - 0.7 * float(tens(sec)) ** 1.5)
for l in tl["labels"]:
    tk(l["frame"] / fps, 0.35, 900)

# footsteps (walk to the fountain) and heartbeat/breath following tension
steps = np.zeros(N)
sec = 7.2
while sec < 16.0:
    n = int(0.1 * SR); s = lp(noise(n), 700) * np.exp(-np.arange(n) / SR * 45)
    place(steps, s, sec, 0.35); sec += 0.58
heart = np.zeros(N)
sec = 0.6
while sec < hit_t:
    tn = float(tens(sec)); per = 60 / (60 + 100 * tn)
    for off, g in ((0, 1.0), (0.2 * per + 0.08, 0.65)):
        n = int(0.2 * SR); tt = np.arange(n) / SR
        place(heart, np.sin(2 * np.pi * 50 * tt) * np.exp(-tt * 22) * g, sec + off, 0.55 * (0.1 + 0.9 * tn))
    sec += per

sfx = np.zeros(N)
def boom(sec, g):
    n = int(2.2 * SR); tt = np.arange(n) / SR
    place(sfx, np.sin(2 * np.pi * (80 * np.exp(-tt * 1.3) + 30) * tt) * np.exp(-tt * 1.7) + lp(noise(n), 250) * np.exp(-tt * 3) * 0.6, sec, g)
def rumble(sec, g):
    n = int(3 * SR); tt = np.arange(n) / SR
    place(sfx, lp(noise(n), 150) * np.sin(np.pi * tt / 3) ** 2, sec, g)
def riser(sec, g):   # reverse-cymbal style swell that stops dead 0.4 s before the hit
    d = hit_t - 0.4 - sec; n = int(d * SR); tt = np.arange(n) / SR
    x = noise(n); y = np.zeros(n); blk = 960
    for i in range(0, n, blk):
        fc = 300 + 7000 * (i / n) ** 2
        y[i:i + blk] = bp(x[i:i + blk], fc * 0.6, fc * 1.6)
    place(sfx, y * (tt / d) ** 2 + np.sin(2 * np.pi * (200 + 900 * (tt / d) ** 2) * tt) * (tt / d) ** 3 * 0.3, sec, g)
def hit(sec, g):
    n = int(3.5 * SR); tt = np.arange(n) / SR
    s = lp(noise(n), 4000) * np.exp(-tt * 3.0) + np.sin(2 * np.pi * (60 * np.exp(-tt * 1.0) + 22) * tt) * np.exp(-tt * 0.9) * 1.6
    s += np.sin(2 * np.pi * 440 * tt) * np.exp(-tt * 6) * 0.3 + np.sin(2 * np.pi * 466 * tt) * np.exp(-tt * 6) * 0.3  # dissonant stab
    place(sfx, s, sec, g)
fn = {"boom": lambda s: boom(s, 0.9), "rumble": lambda s: rumble(s, 0.6), "riser": lambda s: riser(s, 0.7), "hit": lambda s: hit(s, 1.7)}
for ev in tl["sfx"]: fn[ev["type"]](ev["frame"] / fps)
# whoosh at movement changes
for m in tl["movements"][1:6]:
    n = int(0.6 * SR); tt = np.arange(n) / SR
    place(sfx, bp(noise(n), 400, 4000) * np.sin(np.pi * tt / 0.6) ** 2, m["start"] / fps - 0.3, 0.12)

# the 0.4 s of silence before the hit, then black = near silence + heartbeat only, then noon returns with a calm pad
silence = np.where((t > hit_t - 0.4) & (t < hit_t), 0.0, 1.0)
tail_gate = np.where(t > hit_t + 0.1, np.clip(1 - (t - hit_t - 0.1) / 1.6, 0.0, 1.0) ** 1.5, 1.0)
bed = (drone + sub * 0.5 + whisp + tick + steps + heart) * silence * np.where(t < black0, 1.0, 0.0 + 0.25 * np.exp(-(t - black0) / 1.5))
pad = np.zeros(N)
for f in (220.0, 277.2, 329.6):
    pad += np.sin(2 * np.pi * f * t)
pad = lp(pad, 900) * np.clip((t - black1 + 0.4) / 1.2, 0, 1) * 0.07
pad[: int(2 * SR)] += lp(np.sin(2 * np.pi * 220 * t[: int(2 * SR)]) + np.sin(2 * np.pi * 277.2 * t[: int(2 * SR)]), 900) * 0.07 * np.clip(1 - t[: int(2 * SR)] / 2, 0, 1)
mono = bed + sfx * np.where(t < black0 + 1.0, 1.0, 0.0) + pad
mono *= np.minimum(1, t / 0.03) * np.minimum(1, (dur - t) / 0.3)
d = int(0.012 * SR)
st = np.stack([mono, np.roll(mono, d) * 0.96], 1)
w = lp(noise(N), 2000)[:, None] * 0.03 * T[:, None] * np.array([[1, -1]])
st = st + w
st = np.tanh(st / (np.max(np.abs(st)) * 0.8) * 1.15) * 0.9
wavfile.write(sys.argv[2], SR, (st * 32767).astype(np.int16))
print("wrote", sys.argv[2], dur)
