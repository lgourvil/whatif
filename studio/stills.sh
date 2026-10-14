#!/bin/bash
# usage: ./stills.sh <outdir> frame1 frame2 ...  (bundles once, renders PNG stills)
set -e
OUT=$1; shift
export REMOTION_BROWSER=${REMOTION_BROWSER:-/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell}
B=$(mktemp -d)
npx remotion bundle --out-dir="$B" >/dev/null 2>&1
mkdir -p "$OUT"
for f in "$@"; do
  npx remotion still "$B" GuadeloupeEmpire "$OUT/f$(printf %04d $f).png" --frame=$f --browser-executable="$REMOTION_BROWSER" --gl=angle >/dev/null 2>&1 && echo "ok $f"
done
rm -rf "$B"
