#!/bin/bash
# usage: still.sh frame [outdir]
cd "$(dirname "$0")"
F=$1; D=${2:-../episodes/2026-10-13-ocean-drain/stills}
npx remotion still src/index.ts OceanDrain $D/f$(printf %04d $F).png --frame=$F --browser-executable=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell --gl=angle --timeout=120000 >/dev/null 2>&1
