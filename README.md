# What If? studio

A daily "What if…?" scenario as a 65–90 s vertical POV video (1080×1920, 30 fps), rendered in stylised 3D with Remotion and React Three Fiber.

```
episodes.json                  history of every episode (subject, theme, time scale, duration)
episodes/<date>-<slug>/        kit.md (production kit), stills/, render.log
studio/                        the single Remotion project, reused every day
  src/lib/                     shared 3D library: grows with each episode
    PovCamera.tsx              subjective camera rig (spline + monotone easing, walk, handheld, head, impacts)
    Sky.tsx                    gradient sky dome, sun/moon/stars, synced exponential fog
    Particles.tsx              generic deterministic InstancedMesh (per-instance colour, instanced outlines)
    ToonMaterial.ts            toon materials, stepped gradient map, smooth-normal inverted-hull outlines
    ToonMesh.tsx               toon mesh + outline in one component
    Props.tsx                  low-poly kit: trees, houses, car, table, chair, pots, mug, fence
    Characters.tsx             Moss, Pip, POV hands and POV legs
    Overlay.tsx                TikTok-style text cues, vignette, grain, flash, RGB split, shock blur
    palettes.ts                5-colour palettes and mood blending (morning/day/sunset/night/tension)
    noise.ts / track.ts        deterministic noise, ramps, monotone keyframe tracks
  src/episodes/<slug>/         that day's scene + timeline.json (shared with the audio)
audio/synth.py                 procedural soundtrack engine (numpy/scipy) driven by timeline.json
```

## Run

```bash
cd studio && npm ci
python3 ../audio/synth.py src/episodes/<slug>/timeline.json /tmp/raw.wav
ffmpeg -i /tmp/raw.wav -af loudnorm=I=-14:TP=-1.5 public/audio/<slug>.wav
npx remotion still <CompositionId> out/f.png --frame=0
npx remotion render <CompositionId> out/<slug>.mp4 --gl=angle --codec=h264 --crf=16 \
  --x264-preset=slow --pixel-format=yuv420p --color-space=bt709 --concurrency=3
```

In the cloud container, add `--browser-executable=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` because the Remotion Chrome download host is blocked there.
