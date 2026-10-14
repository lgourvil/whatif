# what-if-studio

Daily "What if…?" POV shorts (9:16, 65–90 s) rendered in stylized 3D with Remotion + React Three Fiber.

- `episodes.json` — history (date, slug, theme, time scale, duration)
- `episodes/<date>-<slug>/` — production kit (`kit.md`), control stills, `render.log`
- `studio/` — the single Remotion project; `src/lib/` is the shared, growing 3D library, `src/episodes/<slug>/` the day's scene + `timeline.json`
- `audio/synth.py` — numpy sound engine; `audio/scores/<slug>.py` — per-episode score reading the same timeline

## Commands (cloud sandbox)

```bash
cd studio && npm ci
python3 audio/synth.py <slug>                      # → studio/public/audio/<slug>.wav (−14 LUFS)
export REMOTION_BROWSER=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
./stills.sh <outdir> 0 600 1200                    # quick PNG control stills
./sheet.sh sheet.jpg a.png b.png …                 # contact sheet
npx remotion render <CompositionId> out/<slug>.mp4 --gl=angle --codec=h264 --crf=16 \
  --x264-preset=slow --pixel-format=yuv420p --color-space=bt709 --concurrency=3 --timeout=120000
```

`remotion browser ensure` cannot download in the sandbox (remotion.media blocked), so the pre-installed
Playwright headless shell is used via `REMOTION_BROWSER` (see `remotion.config.ts`).
