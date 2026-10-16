"""Soundtrack for 'Everyone Vapes'. Reads the SAME timeline.json as the Remotion scene.
usage: python3 synth_vapes.py <timeline.json> <out.wav>

Sound idea: a chill lo-fi beat (ironic) that gets more and more MUFFLED as the haze thickens — you literally hear
the world through vapour — then everything dies with the batteries (power-down + silence), and the beat comes back
crisp with birds. The music is periodic over the full duration (24 bars at 76.8 BPM = 75 s) so the loop is seamless.
TikTok codes: sync'd "HAAAH" crowd exhale on the hook, low-battery beeps that accelerate, 0.6 s of silence, reverse whoosh.
"""
import json, sys
import numpy as np
from scipy.signal import butter, sosfilt, sosfilt_zi
from scipy.io import wavfile

SR = 48000
tl = json.load(open(sys.argv[1]))
fps = tl["fps"]; dur = tl["durationInFrames"] / fps
N = int(round(dur * SR)); t = np.arange(N) / SR
rng = np.random.default_rng(16)
F = lambda f: f / fps

def keys(name):
    k = np.array(tl[name], float)
    return lambda sec: np.interp(sec, k[:, 0] / fps, k[:, 1])
tens = keys("tension"); haze = keys("haze")
T = tens(t); H = haze(t)

def lp(x, fc, o=2): return sosfilt(butter(o, min(fc, SR / 2 - 200), "low", fs=SR, output="sos"), x)
def hp(x, fc, o=2): return sosfilt(butter(o, fc, "high", fs=SR, output="sos"), x)
def bp(x, a, b, o=2): return sosfilt(butter(o, [a, min(b, SR / 2 - 200)], "band", fs=SR, output="sos"), x)
def noise(n): return rng.standard_normal(n)
def env(pts, vals): return np.interp(t, pts, vals)
def place(buf, snd, sec, g=1.0, pan=0.0):
    i = int(sec * SR)
    if i >= N: return
    if i < 0: snd = snd[-i:]; i = 0
    j = min(N, i + len(snd)); s = snd[: j - i] * g
    buf[i:j, 0] += s * np.sqrt((1 - pan) / 2); buf[i:j, 1] += s * np.sqrt((1 + pan) / 2)

def var_lp(x, cutoff, blk=1024):
    """time-varying low-pass (block-wise coefficients, state carried) — the 'heard through vapour' filter"""
    y = np.zeros_like(x); zi = None
    for i in range(0, len(x), blk):
        sos = butter(2, float(np.clip(cutoff[i], 120, SR / 2 - 500)), "low", fs=SR, output="sos")
        if zi is None: zi = sosfilt_zi(sos) * x[0]
        y[i:i + blk], zi = sosfilt(sos, x[i:i + blk], zi=zi)
    return y

# ------------------------------------------------------------------ music (periodic, 24 bars)
bpm = tl["bpm"]; beat = 60 / bpm; bar = beat * 4
nf = lambda m: 440 * 2 ** ((m - 69) / 12)
CH = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]  # Fmaj7 Em7 Dm7 Cmaj7
BASS = [41, 40, 38, 36]
music = np.zeros((N, 2)); drums = np.zeros((N, 2))
nbars = int(round(dur / bar))
def keys_tone(f, n, decay):
    tt = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * 2 * f * tt) * np.exp(-tt * 3) + 0.12 * np.sin(2 * np.pi * 3 * f * tt) * np.exp(-tt * 6)
    x *= np.sin(2 * np.pi * 4.5 * tt) * 0.06 + 1  # tremolo (rhodes-ish)
    return x * np.minimum(1, tt / 0.012) * np.exp(-tt * decay)
for b in range(nbars):
    c = CH[(b // 2) % 4]; s0 = b * bar
    for k, hit in enumerate((0, 1.5, 2.5)):  # lazy syncopated stabs
        for m in c:
            place(music, keys_tone(nf(m + 12), int(1.6 * SR), 1.6), s0 + hit * beat + rng.uniform(0, 0.012), 0.05 if k else 0.065, pan=rng.uniform(-0.3, 0.3))
    # bass
    n = int(bar * SR); tt = np.arange(n) / SR
    bs = np.sin(2 * np.pi * nf(BASS[(b // 2) % 4]) * tt) * np.minimum(1, tt / 0.02) * np.exp(-tt * 0.7)
    place(music, lp(bs, 300), s0, 0.32)
    # drums: kick 1 & 2.5, snare 2 & 4, swung 8th hats
    for kb in (0, 2.5):
        n = int(0.4 * SR); tt = np.arange(n) / SR
        place(drums, np.sin(2 * np.pi * (48 + 90 * np.exp(-tt * 28)) * tt) * np.exp(-tt * 9), s0 + kb * beat, 0.55)
    for sb in (1, 3):
        n = int(0.3 * SR); tt = np.arange(n) / SR
        sn = bp(noise(n), 900, 5000) * np.exp(-tt * 18) + np.sin(2 * np.pi * 190 * tt) * np.exp(-tt * 30) * 0.4
        place(drums, sn, s0 + sb * beat, 0.22, pan=0.1)
    for h in range(8):
        n = int(0.06 * SR); tt = np.arange(n) / SR
        sw = 0.12 * beat if h % 2 else 0
        place(drums, hp(noise(n), 7000) * np.exp(-tt * 70), s0 + h * beat / 2 + sw, 0.07 if h % 2 else 0.1, pan=-0.35)
# vinyl crackle bed
crk = np.zeros(N); idx = rng.integers(0, N, int(dur * 9)); crk[idx] = rng.uniform(-1, 1, len(idx))
crk = hp(crk, 1500) * 0.25 + lp(noise(N), 3000) * 0.006
music[:, 0] += crk; music[:, 1] += np.roll(crk, 37)

# haze muffles everything musical; drums drop out in the white-out, come back after the clearing
cut = 7500 * (1 - H) ** 2.2 + 260
for ch in (0, 1):
    music[:, ch] = var_lp(music[:, ch], cut); drums[:, ch] = var_lp(drums[:, ch], cut * 1.2)
dead0, dead1 = F(1560), F(1592)
drum_gain = np.clip(1 - (H - 0.55) / 0.3, 0, 1) * env([0, F(1990), F(2010), F(2120), F(2130)], [1, 1, 0, 0, 1])
mus_gain = (1 - 0.45 * H) * env([0, F(1990), F(2040), F(2120), F(2130)], [1, 1, 0.55, 0.55, 1])
power = np.where((t >= dead0) & (t < dead1), 0.0, 1.0) * np.clip((t - dead1) / 1.6, 0, 1) ** 1.5
power = np.where(t < dead0, 1.0, power)
music *= (mus_gain * power)[:, None] * 0.9
drums *= (drum_gain * power)[:, None]

# ------------------------------------------------------------------ SFX
sfx = np.zeros((N, 2))
def breath_in(sec, d=1.3, g=0.5, sizzle=True):
    n = int(d * SR); tt = np.arange(n) / SR
    e = np.sin(np.pi * np.clip(tt / d, 0, 1)) ** 1.5
    s = bp(noise(n), 500, 2500) * e * 0.6
    if sizzle:  # coil crackle of the device, rising
        cr = np.zeros(n); k = rng.integers(0, n, int(d * 260)); cr[k] = rng.uniform(-1, 1, len(k))
        s += hp(cr, 2500) * (tt / d) * 1.4 + bp(noise(n), 3000, 9000) * (tt / d) ** 2 * 0.35
    place(sfx, s, sec, g)
def breath_out(sec, d=2.0, g=0.7, pan=0.0):
    n = int(d * SR); tt = np.arange(n) / SR
    e = np.minimum(1, tt / 0.06) * np.exp(-tt * 1.9)
    place(sfx, lp(bp(noise(n), 200, 2200), 1800) * e, sec, g, pan)
for p in tl["user_puffs"]:
    breath_in(F(p["inhale"]) + 0.4, (p["exhale"] - p["inhale"]) / fps - 0.45, 0.55)
    breath_out(F(p["exhale"]), 2.2, 0.85)
def crowd_exhale(sec):
    for k in range(26):
        breath_out(sec + rng.uniform(-0.12, 0.2), rng.uniform(1.4, 2.6), 0.16, pan=rng.uniform(-0.9, 0.9))
# distant crowd puffs everywhere, denser with the tension, until the batteries die
sec = 5.0
while sec < dead0 - 0.5:
    breath_out(sec, rng.uniform(0.8, 1.6), 0.05 + 0.08 * float(tens(sec)), pan=rng.uniform(-1, 1))
    sec += rng.uniform(0.4, 1.2) / (0.4 + float(tens(sec)))
def cough(sec, g=0.4, pan=0.0):
    for k in range(rng.integers(2, 4)):
        n = int(0.22 * SR); tt = np.arange(n) / SR
        c = bp(noise(n), rng.uniform(350, 500), rng.uniform(1600, 2400)) * np.exp(-tt * 14) * np.minimum(1, tt / 0.004)
        c += np.sin(2 * np.pi * rng.uniform(110, 170) * tt) * np.exp(-tt * 20) * 0.5
        place(sfx, c, sec + k * rng.uniform(0.2, 0.3), g, pan)
for i, f in enumerate(tl["coughs"]): cough(F(f), 0.25 + 0.15 * (i % 3 == 0), pan=rng.uniform(-0.8, 0.8))
def beep(sec):
    for k in (0, 0.12):
        n = int(0.07 * SR); tt = np.arange(n) / SR
        place(sfx, np.sign(np.sin(2 * np.pi * 2100 * tt)) * np.exp(-tt * 25) * 0.5, sec + k, 0.3)
def powerdown(sec):
    n = int(0.9 * SR); tt = np.arange(n) / SR
    f = 900 * np.exp(-tt * 4.5) + 40
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 3.5) + np.sin(2 * np.pi * (55 * np.exp(-tt * 2) + 25) * tt) * np.exp(-tt * 4) * 1.4
    place(sfx, s, sec, 0.9)
def clear_whoosh(sec):
    d = 2.6; n = int(d * SR); tt = np.arange(n) / SR; x = noise(n); y = np.zeros(n); blk = 960
    for i in range(0, n, blk):
        fc = 200 + 6000 * (i / n) ** 1.5; y[i:i + blk] = bp(x[i:i + blk], fc * 0.5, fc * 1.6)
    e = np.sin(np.pi * tt / d) ** 2
    place(sfx, y * e, sec, 0.55)
    # bright major swell = the sun
    sw = sum(np.sin(2 * np.pi * nf(m) * tt) for m in (65, 69, 72, 77)) * e * 0.08
    place(sfx, sw, sec + 0.3, 1.0)
def bird(sec, pan):
    n = int(0.18 * SR); tt = np.arange(n) / SR
    f = 3200 + 1400 * np.sin(2 * np.pi * 9 * tt) + rng.uniform(-300, 300)
    place(sfx, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / 0.18) ** 2, sec, 0.06, pan)
def click(sec):
    n = int(0.08 * SR); tt = np.arange(n) / SR
    place(sfx, hp(noise(n), 2000) * np.exp(-tt * 90) + np.sin(2 * np.pi * 2900 * tt) * np.exp(-tt * 40) * 0.4, sec, 0.5)
    n = int(0.6 * SR); tt = np.arange(n) / SR
    place(sfx, np.sin(2 * np.pi * 1760 * tt) * np.exp(-tt * 6) * 0.25 + np.sin(2 * np.pi * 2637 * tt) * np.exp(-tt * 7) * 0.15, sec + 0.12, 0.6)
def bus_hiss(sec):
    n = int(0.9 * SR); tt = np.arange(n) / SR
    place(sfx, hp(noise(n), 2500) * np.minimum(1, tt / 0.02) * np.exp(-tt * 3.5), sec, 0.18, pan=-0.6)
def riser_soft(sec):
    d = 5.0; n = int(d * SR); tt = np.arange(n) / SR
    place(sfx, lp(noise(n), 1200) * (tt / d) ** 2 * np.exp(-np.maximum(0, tt - d + 0.6) * 6), sec, 0.12)

for ev in tl["sfx"]:
    s = F(ev["frame"]); k = ev["type"]
    if k == "crowd_exhale": crowd_exhale(s)
    elif k == "beep": beep(s)
    elif k == "powerdown": powerdown(s)
    elif k == "clear_whoosh": clear_whoosh(s)
    elif k == "click": click(s)
    elif k == "bus_hiss": bus_hiss(s)
    elif k == "riser_soft": riser_soft(s)
    elif k == "birds":
        sec = s
        while sec < dur - 0.5:
            bird(sec, rng.uniform(-0.9, 0.9)); sec += rng.uniform(0.3, 1.4)
# birds at the start too (they go quiet as the haze rises) — mirrors the end for the loop
sec = 0.3
while sec < 14:
    bird(sec, rng.uniform(-0.9, 0.9)); sec += rng.uniform(0.4, 1.5) * (1 + sec / 6)

# ------------------------------------------------------------------ ambience beds
amb = np.zeros((N, 2))
city = lp(np.cumsum(noise(N)) * 0.002, 400); city -= lp(city, 20)
city_g = (0.5 - 0.3 * H) * power
amb[:, 0] += city * city_g; amb[:, 1] += np.roll(city, 480) * city_g
rain = hp(noise(N), 1800) * 0.05 + bp(noise(N), 400, 1500) * 0.03
drops = np.zeros(N); k = rng.integers(0, N, int(dur * 40)); drops[k] = rng.uniform(0.3, 1, len(k))
rain += bp(drops, 2000, 6000) * 0.6
rain_g = env([0, F(790), F(860), F(1300), F(1430), dur], [0, 0, 1, 1, 0, 0])
amb[:, 0] += rain * rain_g; amb[:, 1] += np.roll(rain, 911) * rain_g
fogbed = lp(noise(N), 180) * (0.25 * H ** 2) * power
amb[:, 0] += fogbed; amb[:, 1] += np.roll(fogbed, 2000)
# heartbeat in the thick of it
heart = np.zeros((N, 2)); sec = F(1080)
while sec < dead0:
    tn = float(tens(sec)); per = 60 / (70 + 90 * tn)
    for off, g in ((0, 1.0), (0.2 * per + 0.06, 0.6)):
        n = int(0.2 * SR); tt = np.arange(n) / SR
        place(heart, np.sin(2 * np.pi * 48 * tt) * np.exp(-tt * 20) * g, sec + off, 0.5 * tn)
    sec += per

mix = music + drums + sfx + amb + heart
# global fades: 30 ms in / 30 ms out only (the music is periodic, the loop must stay continuous)
mix *= (np.minimum(1, t / 0.03) * np.minimum(1, (dur - t) / 0.03))[:, None]
mix = np.tanh(mix / (np.max(np.abs(mix)) * 0.7) * 1.1) * 0.9
wavfile.write(sys.argv[2], SR, (mix * 32767).astype(np.int16))
print("wrote", sys.argv[2], f"{dur:.2f}s")
