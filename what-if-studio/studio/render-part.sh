#!/bin/bash
# Render one chunk of a composition (video only) with the series' final settings.
# Software WebGL tops out at ~5-7 s/frame here, so long episodes are rendered in chunks (each < 2 h) and joined
# with join-parts.sh. Usage: ./render-part.sh <CompositionId> <first> <last> <out.mp4>
set -euo pipefail
cd "$(dirname "$0")"
COMP=$1; A=$2; B=$3; OUT=$4
C=$(( $(nproc) - 1 ))
npx remotion render src/index.ts "$COMP" "$OUT" --frames="$A-$B" --muted \
  --gl=angle --codec=h264 --crf=16 --x264-preset=slow --pixel-format=yuv420p --color-space=bt709 \
  --concurrency="$C" --timeout=120000
