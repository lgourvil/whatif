"""Sound design for the jersey reveal: riser, impacts, spin whooshes, pulse beat. Beats mirror src/jersey/timeline.ts.
usage: python3 jersey_synth.py <out.wav>"""
import sys, numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

SR = 48000; DUR = 9.5
N = int(DUR * SR); t = np.arange(N) / SR
rng = np.random.default_rng(19)
B = dict(flash=0.25, spinStart=0.9, spinStop=2.15, zoomLogo=3.0, zoomSponsor=4.05, turnBack=5.3, backStop=6.2, recenter=7.25, endFlash=9.0)

def filt(x, kind, f, order=2): return sosfilt(butter(order, f, kind, fs=SR, output='sos'), x)
def noise(n): return rng.standard_normal(n)
def place(buf, snd, sec, g=1.0):
    i = int(sec * SR); j = min(N, i + len(snd))
    if 0 <= i < N: buf[i:j] += snd[:j - i] * g
def env(n, a, d):
    k = np.arange(n) / SR; return np.minimum(1, k / max(a, 1e-4)) * np.exp(-k / d)

def boom(f0=60, f1=28, d=1.1, crack=0.6):
    n = int(d * 3 * SR); k = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-k * 9)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-k / d)
    c = filt(noise(n), 'high', 1800) * np.exp(-k / 0.05) * crack
    m = filt(noise(n), 'band', [150, 900]) * np.exp(-k / 0.25) * 0.4
    return np.tanh(1.6 * (s + c + m))

def whoosh(d, f0, f1, peak=0.6):
    n = int(d * SR); k = np.arange(n) / d / SR
    x = noise(n); out = np.zeros(n); blk = 1024
    for i in range(0, n, blk):
        fc = f0 * (f1 / f0) ** (k[i])
        out[i:i + blk] = filt(x[max(0, i - 4096):i + blk], 'band', [fc * 0.6, min(fc * 1.6, SR / 2 - 100)])[-len(out[i:i + blk]):]
    e = np.sin(np.pi * np.clip(k / peak, 0, 1) * 0.5) ** 2 * np.where(k < peak, 1, np.exp(-(k - peak) * 8))
    return out * e

def kick():
    n = int(0.45 * SR); k = np.arange(n) / SR
    f = 45 + 110 * np.exp(-k * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-k / 0.16) + filt(noise(n), 'high', 3000) * np.exp(-k / 0.004) * 0.3

def hat():
    n = int(0.08 * SR); k = np.arange(n) / SR
    return filt(noise(n), 'high', 7000) * np.exp(-k / 0.018)

L = np.zeros(N); Rr = np.zeros(N)
def both(snd, sec, g=1.0, pan=0.0):
    place(L, snd, sec, g * (1 - pan) ** 0.5 / 1.0); place(Rr, snd, sec, g * (1 + pan) ** 0.5 / 1.0)

# dark drone: A1 + E2, filter opens across the piece
dr = sum(np.sin(2 * np.pi * f * t + p) for f, p in [(55, 0), (55.3, 1), (82.4, 2), (110.1, 0.5)])
dr = filt(dr, 'low', 400) * (0.12 + 0.1 * np.clip((t - 0.25) / 8, 0, 1)) * (t > B['flash'])
both(dr, 0, 0.9)

# riser into the flash (reverse swell)
n = int(B['flash'] * SR); k = np.arange(n) / SR
both(filt(noise(n), 'high', 1200) * (k / k[-1]) ** 3, 0, 0.5)
both(boom(70, 26, 1.3, 0.9), B['flash'], 1.0)

# spin: whoosh with amplitude pulses at the rotation rate
sp = whoosh(B['spinStop'] - B['spinStart'] + 0.2, 300, 3500, peak=0.75)
k = np.arange(len(sp)) / SR
sp *= 0.6 + 0.4 * np.sin(2 * np.pi * 2.2 * k) ** 2
both(sp, B['spinStart'], 0.9, -0.2); both(np.roll(sp, 900), B['spinStart'], 0.6, 0.3)
both(boom(55, 30, 0.6, 0.7), B['spinStop'], 0.7)
# slow-mo tape drop after the brake
n = int(0.6 * SR); k = np.arange(n) / SR
both(np.sin(2 * np.pi * np.cumsum(220 * np.exp(-k * 4)) / SR) * np.exp(-k / 0.25) * 0.25, B['spinStop'] + 0.02)

# zooms
for s in (B['zoomLogo'], B['zoomSponsor']):
    both(whoosh(0.5, 2500, 400, peak=0.25), s - 0.05, 0.5)
    both(hat(), s + 0.25, 0.4)

# pulse beat from the front hold to the final hit (120 bpm)
for i, s in enumerate(np.arange(2.9, B['endFlash'] - 0.1, 0.5)):
    both(kick(), s, 0.55)
    both(hat(), s + 0.25, 0.18, 0.4 if i % 2 else -0.4)

# turn to the back + stop
both(whoosh(B['backStop'] - B['turnBack'] + 0.1, 250, 2800, peak=0.85), B['turnBack'], 0.8)
both(boom(62, 32, 0.8, 0.8), B['backStop'], 0.8)
n = int(1.5 * SR); k = np.arange(n) / SR
shimmer = sum(np.sin(2 * np.pi * f * k) for f in (880, 1320, 1760, 2637)) * np.exp(-k / 0.5) * 0.05
both(shimmer, B['backStop'], 1.0)

# reverse cymbal into the end flash, final hit
n = int(0.8 * SR); k = np.arange(n) / SR
both(filt(noise(n), 'high', 4000) * (k / k[-1]) ** 4 * 0.4, B['endFlash'] - 0.8)
both(boom(75, 25, 1.4, 1.0), B['endFlash'], 1.1)

# room reverb
ir_n = int(1.4 * SR); ki = np.arange(ir_n) / SR
for ch in (L, Rr):
    ir = noise(ir_n) * np.exp(-ki / 0.35); ir = filt(ir, 'low', 6000); ir /= np.sqrt((ir ** 2).sum())
    ch += fftconvolve(ch, ir)[:N] * 0.22
st = np.stack([L, Rr], 1)
st *= np.clip((DUR - t) / 0.35, 0, 1)[:, None]  # tail fades with the picture
st = np.tanh(st / (np.abs(st).max() + 1e-9) * 1.3) * 0.9
wavfile.write(sys.argv[1], SR, (st * 32767).astype(np.int16))
print('wrote', sys.argv[1], DUR, 's')
