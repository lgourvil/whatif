#!/usr/bin/env python3
"""
What If? — reusable procedural soundtrack engine.

Reads an episode's timeline.json (the same file the Remotion scene uses) and
writes a 48 kHz stereo WAV: music bed (slow chords, filter opening with
tension), SFX (whooshes, impacts, wind, rumble, clock ticks), and POV body
sounds (heartbeat + breaths that speed up with tension), plus small
formant "voices" for the other characters. Deterministic (fixed seeds).

usage: python3 audio/synth.py <timeline.json> <out.wav> [--score <name>]
Then normalise: ffmpeg -i out.wav -af loudnorm=I=-14:TP=-1.5 ... (see render notes)
"""
import json
import sys
import wave

import numpy as np

try:
    from scipy.signal import butter, sosfilt
except ImportError:  # graceful fallback: one-pole filters
    butter = None

SR = 48000
RNG = np.random.default_rng(14)


# ---------------------------------------------------------------- helpers
def t_axis(n):
    return np.arange(n) / SR


def lowpass(x, fc, order=2):
    fc = float(np.clip(fc, 20, SR / 2 - 100))
    if butter is None:
        a = np.exp(-2 * np.pi * fc / SR)
        y = np.zeros_like(x)
        acc = 0.0
        for i, v in enumerate(x):
            acc = (1 - a) * v + a * acc
            y[i] = acc
        return y
    return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x)


def highpass(x, fc, order=2):
    if butter is None:
        return x - lowpass(x, fc)
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x)


def bandpass(x, lo, hi, order=2):
    if butter is None:
        return lowpass(highpass(x, lo), hi)
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


def track(frames, keys, fps):
    """Linear interpolation of [frame, value] keys onto a sample-rate curve."""
    kf = np.array([k[0] for k in keys], float) / fps
    kv = np.array([k[1] for k in keys], float)
    return np.interp(frames, kf, kv)


def env_adsr(n, a=0.01, d=0.1, s=0.6, r=0.3):
    t = t_axis(n)
    dur = n / SR
    e = np.where(t < a, t / max(a, 1e-6), 1.0)
    e = np.where((t >= a) & (t < a + d), 1 - (1 - s) * (t - a) / max(d, 1e-6), e)
    e = np.where(t >= a + d, s, e)
    rel = np.clip((dur - t) / max(r, 1e-6), 0, 1)
    return e * rel


def add(buf, start_s, sig, gain=1.0, pan=0.0):
    """Mix a mono signal into a stereo buffer at start_s with constant-power pan."""
    i = int(start_s * SR)
    if i >= buf.shape[1]:
        return
    if i < 0:
        sig = sig[-i:]
        i = 0
    n = min(len(sig), buf.shape[1] - i)
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    buf[0, i:i + n] += sig[:n] * gain * l
    buf[1, i:i + n] += sig[:n] * gain * r


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


# ---------------------------------------------------------------- instruments
def pad_voice(freq, n, bright):
    """Detuned saw stack, two filter states crossfaded by `bright` (0..1 curve)."""
    t = t_axis(n)
    x = np.zeros(n)
    for det in (-0.11, -0.04, 0.0, 0.05, 0.12):
        ph = RNG.random()
        f = freq * 2 ** (det / 12)
        x += 2 * ((f * t + ph) % 1.0) - 1
    x /= 5
    dark = lowpass(x, 500)
    light = lowpass(x, 3200)
    return dark * (1 - bright) + light * bright


def pluck(freq, dur=0.9):
    n = int(dur * SR)
    t = t_axis(n)
    s = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(4 * np.pi * freq * t) + 0.12 * np.sin(6 * np.pi * freq * t)
    return s * np.exp(-t * 5.5) * np.clip(t / 0.004, 0, 1)


def bell(freq, dur=2.5):
    n = int(dur * SR)
    t = t_axis(n)
    s = sum(a * np.sin(2 * np.pi * freq * m * t) * np.exp(-t * d) for m, a, d in
            ((1, 1, 1.6), (2.76, 0.4, 3.0), (5.4, 0.2, 5.0), (8.9, 0.08, 7.0)))
    return s * np.clip(t / 0.002, 0, 1)


def heartbeat_hit(strength=1.0):
    n = int(0.22 * SR)
    t = t_axis(n)
    f = 58 - 20 * t / 0.22
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 22)
    return lowpass(s, 180) * strength


def breath(dur, inhale=True, strength=1.0):
    n = int(dur * SR)
    t = t_axis(n)
    noise = RNG.standard_normal(n)
    lo, hi = (500, 2600) if inhale else (300, 1700)
    s = bandpass(noise, lo, hi)
    shape = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** (1.3 if inhale else 0.8)
    return s * shape * strength * 0.25


def whoosh(dur=0.8, up=True):
    n = int(dur * SR)
    t = t_axis(n)
    noise = RNG.standard_normal(n)
    out = np.zeros(n)
    # sweep a band across the noise in 16 slices (cheap, smooth enough)
    slices = 16
    for k in range(slices):
        a, b = k * n // slices, (k + 1) * n // slices + 2000
        b = min(b, n)
        fc = 300 + 2300 * (k / slices) if up else 2600 - 2200 * (k / slices)
        seg = bandpass(noise[a:b], max(80, fc * 0.6), fc * 1.6)
        w = np.hanning(b - a)
        out[a:b] += seg * w
    shape = np.sin(np.pi * t / dur) ** 2
    return out * shape * 0.6


def impact(strength=1.0):
    n = int(2.2 * SR)
    t = t_axis(n)
    f = 30 + 70 * np.exp(-t * 9)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.4)
    crack = highpass(RNG.standard_normal(n), 1500) * np.exp(-t * 30) * 0.35
    rum = lowpass(RNG.standard_normal(n), 120) * np.exp(-t * 1.5) * 1.2
    return (boom + crack + rum) * strength


def tick():
    n = int(0.05 * SR)
    t = t_axis(n)
    return np.sin(2 * np.pi * 2600 * t) * np.exp(-t * 160) * 0.5 + highpass(RNG.standard_normal(n), 4000) * np.exp(-t * 200) * 0.3


def vowel(f0, dur, formants, glide=0.0, strength=1.0):
    """Tiny formant voice: glottal saw through 3 band-passes ('oh!', 'whoa', 'hm?')."""
    n = int(dur * SR)
    t = t_axis(n)
    f = f0 * (1 + glide * t / dur) * (1 + 0.02 * np.sin(2 * np.pi * 5.5 * t))
    saw = 2 * ((np.cumsum(f) / SR) % 1.0) - 1
    v = sum(bandpass(saw, fm * 0.85, fm * 1.15) * g for fm, g in formants)
    e = np.clip(t / 0.03, 0, 1) * np.clip((dur - t) / 0.12, 0, 1)
    return v * e * strength


OH = [(570, 1.0), (840, 0.6), (2410, 0.2)]
AH = [(730, 1.0), (1090, 0.6), (2440, 0.2)]
EE = [(300, 0.8), (2300, 0.5), (3000, 0.2)]


# ---------------------------------------------------------------- score
def score_telekinesis(tl):
    fps = tl['fps']
    dur = tl['durationInFrames'] / fps
    n = int(dur * SR)
    t = t_axis(n)
    music = np.zeros((2, n))
    sfx = np.zeros((2, n))
    body = np.zeros((2, n))

    tension = track(t, tl['tension'], fps)
    mv = {m['id']: (m['start'] / fps, m['end'] / fps) for m in tl['movements']}

    # --- chord bed: one chord per ~2.5 s, progression per movement (MIDI roots)
    warm = [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 62]]  # Cmaj7 Am7 Fmaj7 G
    lift = [[41, 48, 57, 64, 69], [43, 50, 59, 62, 67], [45, 52, 60, 64, 71], [48, 55, 64, 67, 74]]
    dark = [[38, 45, 53, 57], [34, 41, 50, 53], [36, 43, 51, 55], [37, 44, 52, 56]]  # Dm Bb Cm C#dim-ish
    home = [[41, 48, 57, 64], [43, 50, 59, 62], [48, 55, 64, 71]]
    plan = []  # (start, end, chord)

    def lay(a, b, prog, length):
        s = a
        i = 0
        while s < b - 0.01:
            e = min(b, s + length)
            plan.append((s, e, prog[i % len(prog)]))
            s = e
            i += 1

    lay(0, mv['m3-garden'][0], warm, 2.75)
    lay(mv['m3-garden'][0], mv['m6-moon'][0], lift, 3.0)
    lay(mv['m6-moon'][0], mv['m7-letgo'][0], dark, 2.75)
    lay(mv['m7-letgo'][0], mv['m8-student'][0], home, 2.67)
    lay(mv['m8-student'][0], dur, [warm[0]], 5.0)  # ends on the opening chord: loop

    bright_curve = np.clip(0.15 + tension * 0.85, 0, 1)
    xf = 0.6  # crossfade seconds between chords
    for (a, b, chord) in plan:
        s0 = max(0, a - xf / 2)
        s1 = min(dur, b + xf / 2)
        m = int((s1 - s0) * SR)
        if m <= 0:
            continue
        seg_bright = bright_curve[int(s0 * SR):int(s0 * SR) + m]
        if len(seg_bright) < m:
            seg_bright = np.pad(seg_bright, (0, m - len(seg_bright)), 'edge')
        sig = sum(pad_voice(midi(note), m, seg_bright) for note in chord) / len(chord)
        fade = np.ones(m)
        k = int(xf * SR)
        if s0 > 0:
            fade[:k] = np.linspace(0, 1, k) ** 0.5
        if s1 < dur:
            fade[-k:] = np.linspace(1, 0, k) ** 0.5
        add(music, s0, sig * fade, 0.32, pan=-0.15)
        add(music, s0 + 0.012, sig * fade, 0.32, pan=0.15)  # haas widening

    # --- plucked arpeggio: momentum from the time-lapse to the town
    a0, a1 = mv['m2-timelapse'][0], mv['m6-moon'][0]
    step = 60 / 104 / 2  # 8ths at 104 bpm
    s = a0
    i = 0
    while s < a1:
        chord = next((c for (a, b, c) in plan if a <= s < b), warm[0])
        note = chord[[0, 2, 1, 3, 2, 1][i % 6] % len(chord)] + 12
        g = 0.12 * np.clip((s - a0) / 4, 0, 1) * np.clip((a1 - s) / 3, 0, 1)
        add(music, s, pluck(midi(note)), g, pan=0.35 * np.sin(i * 0.7))
        s += step
        i += 1

    # --- sub drone + rumble in the moon section, released in m7
    d0, d1 = mv['m6-moon']
    dn = int((d1 - d0 + 3.5) * SR)
    dt = t_axis(dn)
    drone = (np.sin(2 * np.pi * midi(26) * dt) + 0.5 * np.sin(2 * np.pi * midi(26) * 1.5 * dt)) * np.clip(dt / 4, 0, 1) * np.clip((d1 - d0 + 3.5 - dt) / 3, 0, 1)
    add(music, d0, drone, 0.35)
    rum = lowpass(RNG.standard_normal(dn), 90) * np.clip(dt / (d1 - d0), 0, 1) ** 2 * np.clip((d1 - d0 + 3.5 - dt) / 3, 0, 1)
    add(sfx, d0, rum, 1.6)

    # --- bells: magic sparkle when the pebble wakes, and on release
    for (sec, note, g) in [(235 / fps, 84, 0.12), (330 / fps, 88, 0.2), (333 / fps, 95, 0.12), (480 / fps, 91, 0.14),
                           (1860 / fps, 84, 0.18), (1870 / fps, 91, 0.12), (2100 / fps, 88, 0.14), (2200 / fps, 84, 0.1)]:
        add(music, sec, bell(midi(note)), g, pan=0.2)

    # --- clock ticks accelerating through the time-lapse (days flying by)
    c0, c1 = mv['m2-timelapse']
    s = c0
    while s < c1:
        p = (s - c0) / (c1 - c0)
        add(sfx, s, tick(), 0.18 * (0.4 + 0.6 * np.sin(np.pi * p)), pan=0.3)
        s += 0.5 * (1 - 0.8 * np.sin(np.pi * p))

    # --- wind: grows with altitude (m4 -> m7)
    w0, w1 = mv['m4-liftoff'][0], mv['m7-letgo'][1]
    wn = int((w1 - w0) * SR)
    wt = t_axis(wn)
    wnoise = RNG.standard_normal(wn)
    wind = bandpass(wnoise, 200, 1400) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.13 * wt))
    wenv = np.clip(wt / 4, 0, 1) * np.clip((w1 - w0 - wt) / 4, 0, 1)
    add(sfx, w0, wind * wenv, 0.22, pan=-0.3)
    add(sfx, w0 + 0.2, bandpass(np.roll(wnoise, 9999), 250, 1600) * wenv, 0.18, pan=0.3)

    # --- whooshes on camera moves, impacts
    for k, f in enumerate(tl['whooshes']):
        add(sfx, f / fps - 0.35, whoosh(0.9, up=k % 2 == 0), 0.5, pan=(-0.4 if k % 2 else 0.4))
    for imp in tl['impacts']:
        add(sfx, imp['frame'] / fps, impact(imp['strength']), 0.55)

    # --- garden ambience (birds-ish chirps) at the start and end: identical -> loop
    for base in (0.0, mv['m8-student'][0]):
        for j in range(6):
            sec = base + 0.4 + j * 0.73 + RNG.random() * 0.2
            if sec > dur - 0.2:
                break
            add(sfx, sec, vowel(2600 + 400 * RNG.random(), 0.09, EE, glide=0.4, strength=0.6), 0.05, pan=0.6 - 0.2 * j)

    # --- POV body: heartbeat + breathing following the timeline
    hb_bpm = lambda sec: np.interp(sec * fps, [k[0] for k in tl['heartbeat']], [k[1] for k in tl['heartbeat']])
    s = 0.2
    while s < dur - 0.3:
        tt = float(np.interp(s, t, tension))
        g = 0.18 + 0.55 * tt
        add(body, s, heartbeat_hit(), g)
        add(body, s + 0.17, heartbeat_hit(0.7), g)
        s += 60 / hb_bpm(s)
    s = 0.6
    inhale = True
    while s < dur - 0.5:
        tt = float(np.interp(s, t, tension))
        d = 1.6 - 0.9 * tt
        add(body, s, breath(d, inhale, 0.35 + 0.6 * tt), 0.55)
        s += d + 0.25
        inhale = not inhale
    # exclamations: POV gasps, Moss's "OH!", Pip's "hm?"
    add(body, 328 / fps, breath(0.35, True, 1.4), 0.7)
    add(body, 896 / fps, breath(0.5, True, 1.6), 0.7)
    add(body, 1700 / fps, breath(0.45, True, 1.8), 0.8)
    add(body, 1890 / fps, breath(1.4, False, 1.4), 0.7)  # the long exhale: let go
    add(sfx, 695 / fps, vowel(160, 0.55, OH, glide=0.35, strength=1.0), 0.16, pan=-0.45)  # Moss: "OH!"
    add(sfx, 712 / fps, vowel(150, 0.7, AH, glide=-0.25, strength=0.9), 0.12, pan=-0.45)  # "...ahh"
    add(sfx, 2150 / fps, vowel(330, 0.35, EE, glide=0.2, strength=0.8), 0.10, pan=-0.35)  # Pip: "hm?"
    add(sfx, 2185 / fps, vowel(360, 0.5, AH, glide=0.3, strength=0.8), 0.10, pan=-0.35)  # "ahh!"

    # --- mix: music ducked a little under the big moments, gentle saturation
    duck = 1 - 0.25 * np.clip(tension - 0.6, 0, 1)
    mix = music * duck * 1.0 + sfx * 0.9 + body * 0.8
    # micro fade at both ends so the loop point is click-free
    k = int(0.03 * SR)
    mix[:, :k] *= np.linspace(0, 1, k)
    mix[:, -k:] *= np.linspace(1, 0, k)
    mix = np.tanh(mix * 1.2) / np.tanh(1.2)
    return mix


SCORES = {'telekinesis': score_telekinesis}


def write_wav(path, stereo):
    peak = np.max(np.abs(stereo)) or 1.0
    data = (stereo / peak * 0.89 * 32767).astype(np.int16).T.copy()
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    tl = json.load(open(sys.argv[1]))
    name = sys.argv[sys.argv.index('--score') + 1] if '--score' in sys.argv else tl['slug']
    stereo = SCORES[name](tl)
    write_wav(sys.argv[2], stereo)
    print(f'wrote {sys.argv[2]}: {stereo.shape[1] / SR:.2f}s')


if __name__ == '__main__':
    main()
