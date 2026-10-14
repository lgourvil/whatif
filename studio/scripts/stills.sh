#!/usr/bin/env bash
# usage: scripts/stills.sh <episode-dir> <CompId> <frame...>   (control images for the QC loop)
set -e
CHROME=${CHROME:-/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell}
DIR=$1; COMP=$2; shift 2
for f in "$@"; do
  npx remotion still "$COMP" "$DIR/stills/f$(printf %04d $f).png" --frame=$f --gl=angle --browser-executable=$CHROME >/dev/null 2>&1 &
  while [ "$(jobs -r | wc -l)" -ge 3 ]; do sleep 1; done
done
wait
