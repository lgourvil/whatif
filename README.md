# What If studio

Daily "What if…?" POV shorts (9:16, 1080×1920, 30 fps) rendered in 3D with Remotion + React Three Fiber.

```
episodes.json                 history (date, slug, title, theme, time scale, duration)
episodes/<date>-<slug>/       kit.md, stills/, render.log
studio/                       ONE Remotion project, reused every day
  src/lib/                    shared library, improved every episode
  src/episodes/<slug>/        per-episode scene (+ timeline.json shared with the audio)
audio/synth.py                numpy sound engine, reads the same timeline.json
```

## Render an episode
```
cd studio && npm ci
python3 -m pip install numpy scipy
python3 ../audio/synth.py src/episodes/<slug>/timeline.json public/audio/<slug>.wav
npx remotion still <CompId> out/f.png --frame=0 --gl=angle      # QC stills first
npx remotion render <CompId> out/<slug>.mp4 --gl=angle --codec=h264 --crf=16 --x264-preset=slow \
  --pixel-format=yuv420p --color-space=bt709 --concurrency=3 --timeout=120000
```
(Offline sandbox: pass `--browser-executable=<headless_shell>`; `scripts/stills.sh` renders QC stills in parallel.)
Rules: everything driven by `useCurrentFrame()`; no `useFrame`, no `Math.random()` (use `random(seed)`); max 5 colours per episode in the palette.
