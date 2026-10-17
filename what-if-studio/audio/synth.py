"""What If? — reusable numpy sound engine.

usage: python3 synth.py <timeline.json> <out.wav>
The timeline is the SAME json the Remotion scene reads. The episode recipe lives in
audio/episodes/<slug with - replaced by _>.py and exposes `build(eng) -> (L, R)`.
Everything is seeded (np.random.default_rng) so the soundtrack is reproducible.
Loudness normalisation to -14 LUFS is done afterwards with ffmpeg loudnorm.
"""
import importlib.util, json, os, sys
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 48000


class Engine:
    def __init__(self, tl, seed=7):
        self.tl = tl
        self.fps = tl["fps"]
        self.dur = tl["durationInFrames"] / self.fps
        self.N = int(self.dur * SR)
        self.t = np.arange(self.N) / SR
        self.rng = np.random.default_rng(seed)
        self.L = np.zeros(self.N)
        self.R = np.zeros(self.N)

    # ---------- time helpers
    def sec(self, frame):
        return frame / self.fps

    def keyed(self, keys, sec=None):
        """Interpolate [[frame, value], ...] at times (s)."""
        k = np.array(keys, float)
        x = self.t if sec is None else sec
        return np.interp(x, k[:, 0] / self.fps, k[:, 1])

    def env(self, pts_sec, vals):
        return np.interp(self.t, pts_sec, vals)

    # ---------- filters / sources
    @staticmethod
    def lp(x, fc, order=2):
        return sosfilt(butter(order, min(fc, SR / 2 - 100), "low", fs=SR, output="sos"), x)

    @staticmethod
    def hp(x, fc, order=2):
        return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x)

    @staticmethod
    def bp(x, a, b, order=2):
        return sosfilt(butter(order, [a, min(b, SR / 2 - 100)], "band", fs=SR, output="sos"), x)

    def noise(self, n):
        return self.rng.standard_normal(n)

    def brown(self, n):
        x = np.cumsum(self.noise(n))
        x = self.hp(x, 20)
        return x / (np.max(np.abs(x)) + 1e-9)

    # ---------- placement (pan -1..1, constant power)
    def place(self, snd, sec, gain=1.0, pan=0.0):
        i = int(sec * SR)
        if i >= self.N or i + len(snd) <= 0:
            return
        s0 = max(0, -i)
        j = min(self.N, i + len(snd))
        a = (pan + 1) * np.pi / 4
        self.L[max(0, i):j] += snd[s0: s0 + j - max(0, i)] * gain * np.cos(a)
        self.R[max(0, i):j] += snd[s0: s0 + j - max(0, i)] * gain * np.sin(a)

    def bed(self, x, gain=1.0, width=0.0):
        """Full-length bed; width decorrelates L/R with a short delay."""
        d = int(0.011 * SR)
        self.L += x * gain
        self.R += (np.roll(x, d) * width + x * (1 - width)) * gain

    # ---------- musical
    def pad(self, chords, seg, tension, base_cut=350, cut_span=3200, gain=0.3):
        out = np.zeros(self.N)
        for k in range(int(np.ceil(self.dur / seg))):
            s0, s1 = k * seg, min(self.dur, (k + 1) * seg + 2.0)
            i0, i1 = int(s0 * SR), min(self.N, int(s1 * SR))
            tt = self.t[i0:i1]
            ch = chords[k % len(chords)]
            x = np.zeros(len(tt))
            for f in ch:
                for det in (-0.35, 0.35):
                    ph = 2 * np.pi * (f + det) * tt
                    x += np.sin(ph) + 0.32 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)
            e = np.minimum(1, (tt - s0) / 2.5) * np.minimum(1, (s1 - tt) / 2.0)
            mt = float(np.mean(tension[i0:i1]))
            out[i0:i1] += self.lp(x, base_cut + cut_span * mt ** 1.4) * e
        return out / (np.max(np.abs(out)) + 1e-9) * gain

    def pluck(self, f, d=0.6):
        n = int(d * SR); tt = np.arange(n) / SR
        return (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(4 * np.pi * f * tt)) * np.exp(-tt * 6)

    # ---------- body
    def heartbeat(self, tension, start=0.5, end=None, gain=0.5):
        end = end or self.dur - 0.5
        sec = start
        while sec < end:
            tn = float(np.interp(sec, self.t[::480], tension[::480]))
            per = 60 / (62 + 95 * tn)
            for off, g in ((0, 1.0), (0.32 * per, 0.65)):
                n = int(0.22 * SR); tt = np.arange(n) / SR
                self.place(np.sin(2 * np.pi * 50 * tt) * np.exp(-tt * 24) * g, sec + off, gain * (0.1 + 0.9 * tn))
            sec += per

    def breath(self, tension, start, end, gain=0.12):
        sec = start
        while sec < end:
            tn = float(np.interp(sec, self.t[::480], tension[::480]))
            per = 4.0 - 2.8 * tn
            n = int(per * 0.55 * SR); tt = np.arange(n) / SR
            e = np.sin(np.pi * tt / (n / SR)) ** 2
            self.place(self.bp(self.noise(n), 350, 3000) * e, sec, gain * (0.4 + tn))
            sec += per

    def cough(self, sec, gain=0.5):
        for k in range(3):
            n = int(0.18 * SR); tt = np.arange(n) / SR
            x = self.bp(self.noise(n), 250, 2400) * np.exp(-tt * 14) + np.sin(2 * np.pi * 140 * tt) * np.exp(-tt * 20) * 0.6
            self.place(x, sec + k * 0.32, gain * (1 - k * 0.2))

    def footsteps(self, pts, gain=0.35):
        """pts: list of (start_s, end_s, period_s)."""
        for a, b, per in pts:
            sec = a
            while sec < b:
                n = int(0.1 * SR); tt = np.arange(n) / SR
                self.place(self.bp(self.noise(n), 150, 2500) * np.exp(-tt * 45), sec, gain, pan=self.rng.uniform(-0.15, 0.15))
                sec += per * (1 + 0.05 * self.rng.standard_normal())

    # ---------- SFX
    def hit(self, sec, gain=1.0):
        n = int(1.6 * SR); tt = np.arange(n) / SR
        x = np.sin(2 * np.pi * (90 * np.exp(-tt * 9) + 38) * tt) * np.exp(-tt * 3.5) + self.lp(self.noise(n), 2500) * np.exp(-tt * 18) * 0.6
        self.place(x, sec, gain)

    def boom(self, sec, gain=1.0, pan=0.0):
        n = int(3.5 * SR); tt = np.arange(n) / SR
        x = np.sin(2 * np.pi * (60 * np.exp(-tt * 1.4) + 24) * tt) * np.exp(-tt * 1.2) * 1.3 + self.lp(self.noise(n), 900) * np.exp(-tt * 1.8)
        x += self.bp(self.noise(n), 1500, 7000) * np.exp(-tt * 9) * 0.5
        self.place(np.tanh(x * 1.5), sec, gain, pan)

    def whoosh(self, sec, gain=0.5, d=0.8):
        n = int(d * SR); tt = np.arange(n) / SR
        x = self.noise(n); y = np.zeros(n)
        fc = 300 + 4500 * np.sin(np.pi * tt / d)
        for i in range(0, n, 480):
            y[i:i + 480] = self.bp(x[i:i + 480], max(100, fc[i] * 0.5), min(20000, fc[i] * 1.5))
        self.place(y * np.sin(np.pi * tt / d) ** 2, sec - d * 0.5, gain)

    def riser(self, sec_end, gain=0.4, d=1.6):
        n = int(d * SR); tt = np.arange(n) / SR
        f = 200 * (8 ** (tt / d))
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4 + self.hp(self.noise(n), 2000) * (tt / d) ** 2
        self.place(x * (tt / d) ** 1.5, sec_end - d, gain)

    def click(self, sec, gain=0.4, f=2200):
        n = int(0.05 * SR); tt = np.arange(n) / SR
        self.place((np.sin(2 * np.pi * f * tt) + self.noise(n) * 0.5) * np.exp(-tt * 120), sec, gain)

    def glass(self, sec, gain=0.6):
        for k in range(26):
            n = int(0.4 * SR); tt = np.arange(n) / SR
            f = self.rng.uniform(2500, 9000)
            x = np.sin(2 * np.pi * f * tt) * np.exp(-tt * self.rng.uniform(8, 25)) + self.hp(self.noise(n), 3000) * np.exp(-tt * 40)
            self.place(x, sec + self.rng.uniform(0, 0.6), gain * self.rng.uniform(0.2, 0.6), pan=self.rng.uniform(-0.7, 0.7))

    def horn(self, sec, gain=0.3, d=0.6, f=420, pan=0.0):
        n = int(d * SR); tt = np.arange(n) / SR
        x = np.sign(np.sin(2 * np.pi * f * tt)) * 0.5 + np.sign(np.sin(2 * np.pi * f * 1.26 * tt)) * 0.5
        x = self.lp(x, 2500) * np.minimum(1, tt / 0.02) * np.minimum(1, (d - tt) / 0.05)
        self.place(x, sec, gain, pan)

    def siren_fr(self, start, end, gain=0.25, pan=-0.3, dist_lp=2500):
        """French two-tone (≈435/580 Hz), slightly detuned, distant."""
        n = int((end - start) * SR); tt = np.arange(n) / SR
        f = np.where((tt % 1.2) < 0.6, 435.0, 580.0)
        ph = 2 * np.pi * np.cumsum(f) / SR
        x = np.sign(np.sin(ph)) * 0.6 + np.sin(ph) * 0.4
        x = self.lp(x, dist_lp) * np.minimum(1, tt / 2.0) * np.minimum(1, (end - start - tt) / 1.0)
        self.place(x, start, gain, pan)

    def crowd(self, start, end, gain=0.3, chant=0.0):
        """Murmur bed (many band-limited voices) + optional rhythmic chant/claps (3 + 2 pattern)."""
        n = int((end - start) * SR); tt = np.arange(n) / SR
        x = np.zeros(n)
        for k in range(10):
            f0 = self.rng.uniform(300, 1100)
            v = self.bp(self.noise(n), f0, f0 * 1.8) * (0.6 + 0.4 * np.sin(2 * np.pi * self.rng.uniform(0.2, 0.9) * tt + self.rng.uniform(0, 6)))
            x += v
        x /= 10
        e = np.minimum(1, tt / 2) * np.minimum(1, (end - start - tt) / 2)
        self.place(x * e, start, gain, pan=-0.4)
        if chant > 0:
            beat = 0.42
            sec = start + 1.0
            k = 0
            while sec < end - 1:
                if k % 5 < 3:
                    m = int(0.09 * SR); u = np.arange(m) / SR
                    clap = self.bp(self.noise(m), 900, 5000) * np.exp(-u * 60)
                    for j in range(8):
                        self.place(clap, sec + self.rng.uniform(0, 0.03), gain * chant * 0.25, pan=self.rng.uniform(-0.8, 0.1))
                    m = int(0.3 * SR); u = np.arange(m) / SR
                    vow = self.bp(self.noise(m), 350, 1400) * np.sin(np.pi * u / 0.3)
                    self.place(vow, sec, gain * chant * 0.8, pan=-0.4)
                sec += beat
                k += 1

    def fire(self, start, end, gain=0.3, pan=0.0, density=40):
        n = int((end - start) * SR); tt = np.arange(n) / SR
        roar = self.lp(self.brown(n), 500) * 0.8 + self.lp(self.noise(n), 1200) * 0.15
        e = np.minimum(1, tt / 3) * np.minimum(1, (end - start - tt) / 1.5)
        self.place(roar * e, start, gain, pan)
        cnt = int((end - start) * density)
        for _ in range(cnt):
            m = int(0.012 * SR); u = np.arange(m) / SR
            self.place(self.hp(self.noise(m), 1500) * np.exp(-u * 400), start + self.rng.uniform(0, end - start), gain * self.rng.uniform(0.1, 0.7), pan + self.rng.uniform(-0.3, 0.3))

    def pop(self, sec, gain=0.4, pan=0.0):
        n = int(0.4 * SR); tt = np.arange(n) / SR
        x = self.lp(self.noise(n), 3000) * np.exp(-tt * 30) + np.sin(2 * np.pi * 120 * tt) * np.exp(-tt * 25)
        self.place(x, sec, gain, pan)
        # hiss of the canister
        m = int(2.5 * SR); u = np.arange(m) / SR
        self.place(self.hp(self.noise(m), 3000) * np.exp(-u * 0.8) * 0.3, sec + 0.05, gain * 0.5, pan)

    # ---------- output
    def write(self, path, master=0.9):
        L, R = self.L, self.R
        fade = np.minimum(1, self.t / 0.02) * np.minimum(1, (self.dur - self.t) / 0.3)
        st = np.stack([L * fade, R * fade], 1)
        peak = np.max(np.abs(st)) + 1e-9
        st = np.tanh(st / peak * 1.2) * master
        wavfile.write(path, SR, (st * 32767).astype(np.int16))


def main():
    tl = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    here = os.path.dirname(os.path.abspath(__file__))
    mod_path = os.path.join(here, "episodes", tl["slug"].replace("-", "_") + ".py")
    spec = importlib.util.spec_from_file_location("recipe", mod_path)
    mod = importlib.util.module_from_spec(spec)
    sys.path.insert(0, here)
    spec.loader.exec_module(mod)
    eng = Engine(tl)
    mod.build(eng)
    eng.write(out)
    print("wrote", out, round(eng.dur, 2), "s")


if __name__ == "__main__":
    main()
