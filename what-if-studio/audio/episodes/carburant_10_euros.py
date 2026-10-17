"""Soundtrack recipe — What If #2026-10-17 « Et si le litre passait de 1 € à 10 € ? »
Calm golden-hour station → klaxons and chants on the roundabout → sirens, tear gas → war.
All timings come from the shared timeline.json (prices, sfx, interactions, movements, tension)."""
import numpy as np


def build(e):
    tl = e.tl
    T = e.keyed(tl["tension"])
    s = e.sec
    SR = 48000

    # ---------------- music: major & bright at 1 €, sliding to minor, then drones and war drums
    calm = [[130.8, 164.8, 196.0, 261.6], [174.6, 220.0, 261.6, 349.2], [196.0, 246.9, 293.7, 392.0], [130.8, 164.8, 196.0, 261.6]]
    tense = [[110.0, 130.8, 164.8, 220.0], [87.3, 110.0, 130.8, 174.6], [98.0, 123.5, 146.8, 196.0], [82.4, 103.8, 123.5, 164.8]]
    pad_calm = e.pad(calm, 4.0, T, base_cut=900, cut_span=1500, gain=0.26)
    pad_tense = e.pad(tense, 6.0, T, base_cut=300, cut_span=3000, gain=0.32)
    xf = e.env([0, s(540), s(990), s(2384), s(2386), e.dur], [0, 0, 1, 1, 0, 0])  # crossfade calm → tense, back to calm on the loop
    e.bed(pad_calm * (1 - xf) + pad_tense * xf, 1.0, width=0.6)
    # plucked arpeggio while everybody is happy (0 → 2,50 €) and again on the loop tail
    notes = [523.3, 659.3, 784.0, 1046.5, 784.0, 659.3]
    k = 0
    sec = 0.4
    while sec < s(560):
        g = 0.09 * (1 - sec / s(600))
        e.place(e.pluck(notes[k % 6]), sec, g, pan=0.3 if k % 2 else -0.3)
        sec += 0.36
        k += 1
    sec = s(2392)
    while sec < e.dur - 0.2:
        e.place(e.pluck(notes[k % 6]), sec, 0.07, pan=0.3 if k % 2 else -0.3)
        sec += 0.36
        k += 1
    # sub drone rising with tension
    drone = np.sin(2 * np.pi * (38 + 16 * T) * e.t) * (0.05 + 0.32 * T ** 2) * e.env([0, s(2384), s(2386), e.dur], [1, 1, 0, 0])
    e.bed(drone, 1.0)
    # war drums from 8,00 €
    sec = s(1920)
    while sec < s(2380):
        tn = float(np.interp(sec, e.t[::480], T[::480]))
        n = int(0.5 * SR); tt = np.arange(n) / SR
        drum = np.sin(2 * np.pi * (70 * np.exp(-tt * 8) + 45) * tt) * np.exp(-tt * 7) + e.lp(e.noise(n), 600) * np.exp(-tt * 20) * 0.4
        e.place(drum, sec, 0.5 * tn)
        e.place(drum * 0.6, sec + 0.27, 0.35 * tn)
        sec += 0.54 if sec < s(2175) else 0.45

    # ---------------- ambience
    # golden hour: light wind, distant traffic, birds
    wind = e.bp(e.noise(e.N), 120, 800) * e.env([0, s(990), s(1600), s(2384), s(2386), e.dur], [0.06, 0.1, 0.18, 0.25, 0.06, 0.06])
    e.bed(wind, 1.0, width=0.8)
    traffic = e.lp(e.brown(e.N), 400) * e.env([0, s(500), s(1290), s(1420), s(2384), s(2386), e.dur], [0.12, 0.2, 0.18, 0.0, 0.0, 0.12, 0.12])
    e.bed(traffic, 0.8, width=0.5)
    for _ in range(40):
        sec = e.rng.uniform(0, s(900))
        if e.rng.random() < 0.25:
            sec = e.rng.uniform(s(2386), e.dur - 0.3)
        n = int(0.12 * SR); tt = np.arange(n) / SR
        f0 = e.rng.uniform(3000, 5200)
        chirp = np.sin(2 * np.pi * (f0 + 1800 * np.sin(2 * np.pi * 18 * tt)) * tt) * np.sin(np.pi * tt / 0.12) ** 2
        e.place(chirp, sec, 0.035, pan=e.rng.uniform(-0.9, 0.9))

    # ---------------- pump: click, motor hum + fuel flow while squeezing
    hum_n = int((s(700) - s(150)) * SR); tt = np.arange(hum_n) / SR
    hum = (np.sin(2 * np.pi * 100 * tt) * 0.4 + np.sin(2 * np.pi * 200 * tt) * 0.2) * np.minimum(1, tt / 0.3) * np.minimum(1, (tt[-1] - tt) / 0.2)
    flow = e.bp(e.noise(hum_n), 300, 2500) * np.minimum(1, tt / 0.5) * np.minimum(1, (tt[-1] - tt) / 0.2)
    e.place(hum * 0.08 + flow * 0.06, s(150), 1.0, pan=0.25)
    # price display ticks (one per 50 cents), lower and harsher as the price climbs
    for i, (fr, p) in enumerate(tl["prices"]):
        if fr == 0:
            continue
        f = 1500 - p * 80
        n = int(0.18 * SR); tt = np.arange(n) / SR
        tick = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sign(np.sin(2 * np.pi * f * 0.5 * tt))) * np.exp(-tt * 22)
        e.place(tick, s(fr), 0.12 + 0.012 * p)

    # ---------------- crowd, klaxons, chants
    e.crowd(s(980), s(1700), gain=0.22, chant=1.0)
    e.crowd(s(1700), s(2384), gain=0.3, chant=0.0)
    for sec in np.concatenate([e.rng.uniform(s(560), s(1000), 14), e.rng.uniform(s(1000), s(1400), 10)]):
        e.horn(sec, 0.16, d=e.rng.uniform(0.25, 0.9), f=e.rng.uniform(380, 520), pan=e.rng.uniform(-0.2, 0.9))

    # ---------------- police, gas, fire
    e.siren_fr(s(1500), s(2384), gain=0.16, pan=-0.5)
    e.siren_fr(s(1560), s(2300), gain=0.1, pan=-0.2, dist_lp=1800)
    e.fire(s(1000), s(2384), gain=0.14, pan=-0.5, density=25)
    e.fire(s(1760), s(2384), gain=0.2, pan=0.6, density=35)

    # ---------------- body: heartbeat, breath, steps, coughs
    e.heartbeat(T, start=1.0, end=s(2384), gain=0.55)
    e.breath(T, start=2.0, end=s(2384), gain=0.08)
    e.footsteps([(s(995), s(1330), 0.56), (s(1600), s(1720), 0.42)], gain=0.25)

    # ---------------- timeline SFX
    for ev in tl["sfx"]:
        t0 = s(ev["frame"]); ty = ev["type"]
        if ty == "hit": e.hit(t0, 0.9)
        elif ty == "nozzle_click": e.click(t0, 0.5, 1800); e.click(t0 + 0.06, 0.3, 1200)
        elif ty == "pump_start": e.click(t0, 0.3, 900)
        elif ty == "pump_stop":
            n = int(1.5 * SR); tt = np.arange(n) / SR
            e.place(np.sin(2 * np.pi * np.cumsum(220 * np.exp(-tt * 1.5)) / SR) * np.exp(-tt * 1.2), t0, 0.15, pan=0.2)
        elif ty == "horns": e.horn(t0, 0.2, 0.8, 440, 0.6); e.horn(t0 + 0.9, 0.18, 0.4, 470, 0.4)
        elif ty == "zip":
            n = int(0.5 * SR); tt = np.arange(n) / SR
            e.place(e.bp(e.noise(n), 2000, 7000) * (np.sin(2 * np.pi * 60 * tt) > 0) * np.sin(np.pi * tt / 0.5), t0, 0.25)
        elif ty == "crowd_cheer": e.whoosh(t0, 0.2, 1.2)
        elif ty == "siren": e.riser(t0, 0.2, 1.2)
        elif ty == "gas_pop": e.pop(t0, 0.5, pan=-0.4)
        elif ty == "cough": e.cough(t0, 0.5); e.cough(t0 + 1.6, 0.35)
        elif ty == "whoosh_fire": e.whoosh(t0, 0.5, 1.4); e.boom(t0, 0.35, pan=0.6)
        elif ty == "boom_small": e.boom(t0, 0.6, pan=-0.5)
        elif ty == "riser": e.riser(t0 + 0.5, 0.35, 1.8)
        elif ty == "explosion": e.boom(t0, 1.6, pan=0.3); e.boom(t0 + 0.05, 0.8, pan=-0.3); e.whoosh(t0, 0.6, 1.0)
        elif ty == "glass": e.glass(t0, 0.5)

    # camera whips → whoosh
    for a, b in [(1330, 1395), (1700, 1730), (2172, 2182), (2300, 2335)]:
        e.whoosh(s((a + b) / 2), 0.3, 0.7)
    # strong relance riser
    for r in tl["relances"]:
        if r["role"] in ("RELANCE_FORTE", "CLIMAX"):
            e.riser(s(r["frame"]), 0.25, 1.2)
