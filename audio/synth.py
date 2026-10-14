"""what-if-studio — reusable numpy sound engine.

Everything is generated in code (no samples): pads, plucks, drums, noise-based SFX,
breathing and heartbeats. Episode scores live in audio/scores/<slug>.py and read the
same timeline.json as the Remotion scene, so picture and sound stay in sync.

Usage: python3 audio/synth.py <slug>   → studio/public/audio/<slug>.wav (48 kHz stereo)
"""
import importlib
import json
import os
import subprocess
import sys
import wave

import numpy as np

try:
    from scipy import signal as sps
except ImportError:  # scipy optional: fall back to one-pole filters
    sps = None

SR = 48000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RNG = np.random.default_rng(1234)  # fixed seed → deterministic soundtrack


# ---------------------------------------------------------------- buffer & timing
class Track:
    def __init__(self, seconds):
        self.n = int(seconds * SR)
        self.buf = np.zeros((self.n, 2), dtype=np.float64)

    def add(self, sig, t, gain=1.0, pan=0.0):
        """Mix a mono or stereo signal at time t (s) with equal-power pan (-1..1)."""
        i = int(t * SR)
        if i >= self.n or len(sig) == 0:
            return
        if sig.ndim == 1:
            a = (pan + 1) * np.pi / 4
            sig = np.stack([sig * np.cos(a), sig * np.sin(a)], axis=1)
        j = min(self.n, i + len(sig))
        s0 = max(0, -i)
        self.buf[max(0, i):j] += sig[s0 : j - i] * gain


def tvec(seconds):
    return np.arange(int(seconds * SR)) / SR


def env_ad(n, attack, decay_tau):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(0, t - attack) / decay_tau)


def fade(sig, fin=0.01, fout=0.05):
    n = len(sig)
    e = np.ones(n)
    a, b = int(fin * SR), int(fout * SR)
    if a:
        e[: min(a, n)] = np.linspace(0, 1, min(a, n))
    if b:
        e[-min(b, n):] *= np.linspace(1, 0, min(b, n))
    return sig * (e if sig.ndim == 1 else e[:, None])


def curve(points, seconds):
    """Piecewise-linear automation from [(t, v), …] sampled at SR."""
    t = tvec(seconds)
    xs, ys = zip(*points)
    return np.interp(t, xs, ys)


# ---------------------------------------------------------------- filters
def lowpass(x, fc, order=2):
    if sps is not None:
        sos = sps.butter(order, min(fc, SR * 0.45), "low", fs=SR, output="sos")
        return sps.sosfilt(sos, x, axis=0)
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.zeros_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def highpass(x, fc, order=2):
    if sps is not None:
        sos = sps.butter(order, fc, "high", fs=SR, output="sos")
        return sps.sosfilt(sos, x, axis=0)
    return x - lowpass(x, fc)


def bandpass(x, lo, hi, order=2):
    return lowpass(highpass(x, lo, order), hi, order)


def sweep_lowpass(x, fc_curve, block=512):
    """Time-varying low-pass (block-wise one-pole cascade) — 'filter opens with tension'."""
    y = np.zeros_like(x)
    s1 = np.zeros(x.shape[1:]) if x.ndim > 1 else 0.0
    s2 = np.zeros(x.shape[1:]) if x.ndim > 1 else 0.0
    for b0 in range(0, len(x), block):
        fc = float(fc_curve[min(b0, len(fc_curve) - 1)])
        a = np.exp(-2 * np.pi * fc / SR)
        seg = x[b0 : b0 + block]
        out = np.empty_like(seg)
        for i in range(len(seg)):
            s1 = (1 - a) * seg[i] + a * s1
            s2 = (1 - a) * s1 + a * s2
            out[i] = s2
        y[b0 : b0 + block] = out
    return y


def noise(seconds):
    return RNG.standard_normal(int(seconds * SR))


# ---------------------------------------------------------------- instruments
def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def steelpan(freq, dur=1.2, bright=1.0):
    t = tvec(dur)
    partials = [(1, 1.0, 0.9), (2, 0.5 * bright, 0.45), (3.01, 0.22 * bright, 0.3), (4.2, 0.08, 0.18)]
    s = sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / d) for r, a, d in partials)
    s *= np.clip(t / 0.004, 0, 1)
    return s * 0.5


def pad(freqs, dur, detune=0.006, voices=3):
    t = tvec(dur)
    s = np.zeros_like(t)
    for f in freqs:
        for v in range(voices):
            d = 1 + detune * (v - (voices - 1) / 2)
            ph = RNG.random() * 2 * np.pi
            # soft saw from a few harmonics
            s += sum(np.sin(2 * np.pi * f * d * k * t + ph * k) / k for k in range(1, 6))
    return s / (len(freqs) * voices * 2)


def drum(f0=90, dur=0.5, pitch_drop=2.0, noise_amt=0.15, tau=0.18):
    t = tvec(dur)
    f = f0 * (1 + pitch_drop * np.exp(-t / 0.02))
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / tau)
    hit = highpass(noise(dur), 1500) * np.exp(-t / 0.015) * noise_amt
    return body + hit


def shaker(dur=0.09):
    t = tvec(dur)
    return highpass(noise(dur), 5000) * np.exp(-t / 0.025) * 0.5


def whoosh(dur=0.9, lo=300, hi=3000, peak=0.6):
    n = noise(dur)
    t = tvec(dur)
    fc = lo + (hi - lo) * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    y = sweep_lowpass(n[:, None], fc)[:, 0]
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    return highpass(y, 150) * e * peak * 3


def impact(dur=2.5, f0=48):
    t = tvec(dur)
    boom = np.sin(2 * np.pi * f0 * t * (1 + 0.6 * np.exp(-t / 0.08))) * np.exp(-t / 0.7)
    crack = lowpass(noise(dur), 2500) * np.exp(-t / 0.12) * 0.6
    return boom + crack


def heartbeat(bpm, seconds, gain=1.0):
    out = np.zeros(int(seconds * SR))
    period = 60.0 / bpm
    beat = drum(52, 0.35, 0.8, 0.0, 0.09)
    t = 0.0
    while t < seconds:
        for off, g in ((0, 1.0), (0.24, 0.65)):
            i = int((t + off) * SR)
            j = min(len(out), i + len(beat))
            if i < len(out):
                out[i:j] += beat[: j - i] * g
        t += period
    return lowpass(out, 140) * gain


def breath(seconds, rate_curve, gain=0.2):
    """Filtered-noise breathing; rate_curve (breaths/s) sampled at SR."""
    ph = 2 * np.pi * np.cumsum(rate_curve[: int(seconds * SR)]) / SR
    e = np.clip(np.sin(ph), 0, 1) ** 2 * 0.8 + np.clip(-np.sin(ph), 0, 1) ** 3 * 0.5
    n = bandpass(noise(seconds), 400, 2200)
    return n * e * gain


def waves(seconds, gain=0.3):
    n = lowpass(noise(seconds), 900)
    t = tvec(seconds)
    e = 0.55 + 0.45 * np.sin(2 * np.pi * t / 6.0) ** 2
    return n * e * gain


def wind(seconds, level_curve, gain=0.3):
    n = noise(seconds)
    y = sweep_lowpass(n[:, None], 200 + level_curve * 1800)[:, 0]
    return y * level_curve * gain * 3


def crowd_cheer(dur=2.2, gain=0.4):
    t = tvec(dur)
    s = np.zeros_like(t)
    for k in range(10):
        f = 300 + RNG.random() * 500
        vib = np.sin(2 * np.pi * (5 + RNG.random() * 3) * t) * 20
        s += np.sin(2 * np.pi * np.cumsum(f + vib) / SR) * (0.4 + RNG.random() * 0.6)
    s = bandpass(s / 10 + noise(dur) * 0.3, 300, 3500)
    return s * env_ad(len(t), 0.15, 0.9) * gain


def conch(dur=1.6, f=196.0):
    t = tvec(dur)
    vib = 1 + 0.012 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / 0.4, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    s = sum(np.sin(ph * k) / k ** 1.2 for k in range(1, 9))
    s = lowpass(s, 1600) + bandpass(noise(dur), 600, 1800) * 0.08
    e = np.clip(t / 0.12, 0, 1) * np.clip((dur - t) / 0.3, 0, 1)
    return s * e * 0.5


def firework(dur=2.0):
    t = tvec(dur)
    pop = impact(0.6, 70)[: len(t)] if dur >= 0.6 else 0
    crackle = np.zeros_like(t)
    for k in range(60):
        i = int((0.15 + RNG.random() * 1.4) * SR)
        if i < len(t) - 300:
            crackle[i : i + 300] += highpass(noise(300 / SR), 3000) * np.exp(-np.arange(300) / 60) * 0.6
    out = crackle.copy()
    out[: len(pop)] += pop * 0.8
    return out


def footstep_sand(gain=0.5):
    d = 0.18
    t = tvec(d)
    return bandpass(noise(d), 200, 1800) * np.exp(-t / 0.04) * gain


def compress(x, thresh_db=-20.0, ratio=3.0, attack=0.01, release=0.25):
    """Feed-forward RMS compressor (stereo-linked), so loudnorm can stay in linear mode."""
    mono = np.sqrt(np.mean(x ** 2, axis=1) + 1e-12)
    blk = 256
    nb = len(mono) // blk + 1
    lv = np.array([mono[i * blk : (i + 1) * blk].max() if i * blk < len(mono) else 0 for i in range(nb)])
    env = np.zeros(nb)
    a_at = np.exp(-blk / (attack * SR))
    a_rel = np.exp(-blk / (release * SR))
    e = 0.0
    for i, v in enumerate(lv):
        e = a_at * e + (1 - a_at) * v if v > e else a_rel * e + (1 - a_rel) * v
        env[i] = e
    db = 20 * np.log10(env + 1e-9)
    gain_db = np.where(db > thresh_db, (thresh_db - db) * (1 - 1 / ratio), 0.0)
    g = 10 ** (np.repeat(gain_db, blk)[: len(x)] / 20)
    return x * g[:, None]


# ---------------------------------------------------------------- export
def write_wav(path, buf):
    peak = np.max(np.abs(buf)) or 1.0
    buf = buf / peak * 0.89
    data = (np.clip(buf, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def loudnorm(src, dst, lufs=-14):
    """Two-pass EBU R128 loudnorm (linear mode) → accurate −14 LUFS for TikTok."""
    base = f"loudnorm=I={lufs}:TP=-1.5:LRA=11"
    p1 = subprocess.run(["ffmpeg", "-hide_banner", "-i", src, "-af", base + ":print_format=json", "-f", "null", "-"],
                        capture_output=True, text=True, check=True)
    js = p1.stderr[p1.stderr.rindex("{") : p1.stderr.rindex("}") + 1]
    m = json.loads(js)
    second = (f"{base}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
              f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-af", second, "-ar", str(SR), "-ac", "2", dst], check=True)


if __name__ == "__main__":
    slug = sys.argv[1]
    tl_path = os.path.join(ROOT, "studio", "src", "episodes", slug, "timeline.json")
    with open(tl_path) as fh:
        timeline = json.load(fh)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    score = importlib.import_module("scores." + slug.replace("-", "_"))
    buf = score.render(timeline, sys.modules[__name__])
    raw = os.path.join(ROOT, "audio", f"{slug}.raw.wav")
    out = os.path.join(ROOT, "studio", "public", "audio", f"{slug}.wav")
    write_wav(raw, buf)
    loudnorm(raw, out)
    os.remove(raw)
    print("wrote", out)
