"""Score for 'What if Guadeloupe built an empire?' — steel pan + ka-drum bounce that
swells into an imperial anthem, deflates, and lands back on the Day-1 beach (loop)."""
import numpy as np


def render(tl, S):
    fps = tl["fps"]
    dur = tl["durationInFrames"] / fps
    T = S.Track(dur)
    sec = lambda fr: fr / fps  # noqa: E731

    BPM = 100
    beat = 60 / BPM
    # chord roots (MIDI) per bar: bright major loop, minor for the collapse
    MAJOR = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]]
    MINOR = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]]
    NIGHT = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]

    def chords_at(t):
        if sec(780) <= t < sec(1060):
            return NIGHT
        if sec(1950) <= t < sec(2240):
            return MINOR
        return MAJOR

    # layer gains over time (crossfaded, never hard cuts)
    pan_g = S.curve([(0, 0.8), (sec(1600), 0.9), (sec(1680), 0.0), (sec(1960), 0.0), (sec(2000), 0.55), (sec(2230), 0.4), (sec(2260), 0.0), (sec(2290), 0.8), (dur, 0.8)], dur)
    drum_g = S.curve([(0, 0.0), (sec(400), 0.0), (sec(440), 0.5), (sec(780), 0.5), (sec(820), 0.2), (sec(1040), 0.25), (sec(1200), 0.8), (sec(1600), 1.0), (sec(1660), 0.0), (sec(1740), 0.0), (sec(1780), 0.9), (sec(1940), 0.9), (sec(1960), 0.0), (dur, 0.0)], dur)
    pad_g = S.curve([(0, 0.15), (sec(700), 0.25), (sec(800), 0.45), (sec(1060), 0.3), (sec(1500), 0.45), (sec(1700), 0.8), (sec(1900), 0.8), (sec(1960), 0.5), (sec(2220), 0.35), (sec(2260), 0.0), (sec(2300), 0.15), (dur, 0.15)], dur)
    tension = S.curve([(sec(a), b) for a, b in tl["tension"]], dur)

    # --- steel pan arpeggios (8ths when busy, quarters when calm)
    t = 0.0
    step = 0
    while t < dur - 0.2:
        i = int(t * S.SR)
        g = pan_g[i]
        busy = tension[i] > 0.45
        if g > 0.01 and (busy or step % 2 == 0):
            ch = chords_at(t)[int(t / (4 * beat)) % 4]
            pattern = [0, 1, 2, 1, 0, 2, 1, 2]
            note = ch[pattern[step % 8]] + 12 + (12 if step % 8 == 5 else 0)
            if sec(1950) <= t < sec(2240):
                note -= (step % 8) // 3  # drooping, deflated melody
            S_pan = 0.35 * np.sin(step * 0.9)
            T.add(S.steelpan(S.midi(note), 1.1, 0.6 + tension[i] * 0.6), t, 0.28 * g, S_pan)
        t += beat / 2
        step += 1

    # --- bass + ka drums (boula pattern) + shaker
    t = 0.0
    k = 0
    while t < dur - 0.3:
        i = int(t * S.SR)
        g = drum_g[i]
        if g > 0.01:
            pos = k % 8
            ch = chords_at(t)[int(t / (4 * beat)) % 4]
            if pos in (0, 3, 4, 7):
                T.add(S.drum(70 if pos in (0, 4) else 110, 0.45, 1.5, 0.2, 0.16), t, 0.55 * g, -0.15)
            if pos in (2, 6):
                T.add(S.drum(240, 0.2, 0.6, 0.6, 0.05), t, 0.35 * g, 0.25)
            if pos in (0, 3, 6):
                T.add(S.lowpass(S.steelpan(S.midi(ch[0] - 24), 0.5, 0.2), 300), t, 0.9 * g)
            T.add(S.shaker(), t, 0.25 * g * (0.6 if pos % 2 else 1.0), 0.4)
        t += beat / 2
        k += 1

    # --- pads: each chord a separate swell (crossfading into the next)
    t = 0.0
    while t < dur:
        i = int(t * S.SR)
        g = pad_g[i]
        ch = chords_at(t)[int(t / (4 * beat)) % 4]
        if g > 0.01:
            seg = S.pad([S.midi(n) for n in ch] + [S.midi(ch[0] - 12)], 4 * beat + 1.0)
            seg = S.lowpass(seg, 600 + 3500 * tension[i])
            seg = S.fade(seg, 0.5, 1.0)
            T.add(seg, t, 0.5 * g, 0.0)
        t += 4 * beat

    # imperial brass/choir swell over the globe (detuned saw stack, opening filter)
    choir_t0, choir_t1 = sec(1690), sec(1960)
    choir = S.pad([S.midi(n) for n in (48, 55, 60, 64, 67, 72)], choir_t1 - choir_t0 + 1.5, 0.01, 4)
    fc = np.linspace(500, 4000, len(choir))
    choir = S.fade(S.sweep_lowpass(choir[:, None], fc)[:, 0], 0.4, 1.4)
    T.add(choir, choir_t0, 0.55)

    # --- ambience
    T.add(S.fade(S.waves(sec(560)), 0.01, 3.0), 0, 0.5, -0.3)
    T.add(S.fade(S.waves(sec(560)), 0.01, 3.0), 0.37, 0.5, 0.3)
    sea_mid = S.fade(S.waves(sec(1660 - 520)), 2.0, 2.0)
    T.add(sea_mid, sec(520), 0.35)
    T.add(S.fade(S.waves(sec(2400 - 2245)), 0.8, 0.01), sec(2245), 0.5, -0.3)
    T.add(S.fade(S.waves(sec(2400 - 2245)), 0.8, 0.01), sec(2245) + 0.37, 0.5, 0.3)
    # crickets at night
    nt = S.tvec(sec(1040 - 780))
    crick = np.sin(2 * np.pi * 4700 * nt) * (np.sin(2 * np.pi * 28 * nt) > 0.6) * (np.sin(2 * np.pi * 0.9 * nt) > 0)
    T.add(S.fade(crick * 0.05, 1.5, 1.5), sec(780), 1.0, 0.5)
    # wind rising into the clouds
    wl = S.curve([(0, 0.0), (1.2, 0.3), (3.3, 1.0), (3.6, 0.0)], 3.7)
    T.add(S.wind(3.7, wl, 0.4), sec(1590), 1.0)

    # --- footsteps on sand (walk) and the landing
    for a, b in tl["steps"]:
        fr = a
        n = 0
        while fr < b:
            T.add(S.footstep_sand(0.55), sec(fr), 1.0, -0.2 if n % 2 else 0.2)
            fr += 15
            n += 1

    # --- POV whooshes on head turns (same keys as the camera rig)
    for fr, d in [(180, 0.6), (490, 0.6), (640, 0.6), (725, 0.9), (780, 0.7), (1025, 0.6), (1228, 0.6), (1620, 1.6)]:
        T.add(S.whoosh(d, 300, 3200, 0.5), sec(fr), 0.7)

    # --- impacts / events from the timeline
    for im in tl["impacts"]:
        t0, s = sec(im["frame"]), im["strength"]
        kind = im["kind"]
        if kind == "board":
            T.add(S.drum(60, 0.5, 1.0, 0.4, 0.1), t0, 0.9 * s)
        elif kind == "flag":
            T.add(S.drum(120, 0.3, 2.0, 0.5, 0.08), t0, 0.6 * s)
            T.add(S.crowd_cheer(2.2), t0 + 0.05, 0.9 * s, 0.2)
        elif kind == "horn":
            T.add(S.conch(1.8, 196.0), t0 - 0.2, 1.0, 0.1)
            T.add(S.crowd_cheer(2.8), t0 + 0.6, 0.8)
        elif kind == "whiteout":
            T.add(S.whoosh(1.8, 200, 6000, 0.8), t0 - 1.1, 0.5)
            T.add(S.impact(3.0, 42), t0, 0.4 * s)
        elif kind == "climax":
            T.add(S.impact(3.5, 38), t0, 0.45)
            T.add(S.crowd_cheer(3.5), t0, 0.7)
        elif kind == "crack":
            # comedic deflate: falling whistle + thud
            dd = 1.4
            tt = S.tvec(dd)
            f = 1400 * np.exp(-tt * 1.6) + 120
            whistle = np.sin(2 * np.pi * np.cumsum(f) / S.SR) * np.clip((dd - tt) / 0.2, 0, 1) * 0.35
            T.add(whistle, t0, 0.8)
            T.add(S.impact(1.5, 60), t0 + dd - 0.1, 0.6)
    for k in range(7):  # firework bursts (Fx.tsx: 868 + 21k)
        T.add(S.firework(2.0), sec(868 + 21 * k) - 0.05, 0.55, -0.5 + k * 0.17)
        T.add(S.whoosh(0.5, 1500, 5000, 0.3), sec(868 + 21 * k) - 0.5, 0.25)

    # --- POV body: breath (accelerates with tension) + heartbeat in the sky
    rate = 0.25 + tension * 0.5
    T.add(S.breath(dur, rate, 0.08), 0, 1.0)
    T.add(S.fade(S.heartbeat(72, sec(1700 - 1560)), 1.0, 0.5), sec(1560), 0.7)
    T.add(S.fade(S.heartbeat(96, sec(1960 - 1700)), 0.2, 1.0), sec(1700), 0.6)
    T.add(S.fade(S.heartbeat(62, sec(2230 - 1960)), 1.0, 1.0), sec(1960), 0.5)

    # glue: gentle high-pass + soft clip
    out = S.highpass(T.buf, 30)
    out = S.compress(out, thresh_db=-24, ratio=3.5)
    out = np.tanh(out * 1.2) / 1.2
    # match tail to head for a seamless loop (short crossfade of the last 120 ms)
    n = int(0.12 * S.SR)
    w = np.linspace(0, 1, n)[:, None]
    out[-n:] = out[-n:] * (1 - w) + out[:n] * w
    return out
