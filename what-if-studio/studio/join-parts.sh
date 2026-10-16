#!/bin/bash
# Join chunk MP4s (same encoder settings => stream copy, no re-encode) and mux the episode WAV as AAC.
# Usage: ./join-parts.sh <out.mp4> <audio.wav> part1.mp4 part2.mp4 ...
set -euo pipefail
OUT=$1; WAV=$2; shift 2
LIST=$(mktemp)
for p in "$@"; do echo "file '$(realpath "$p")'" >> "$LIST"; done
ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" -i "$WAV" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart "$OUT"
rm -f "$LIST"
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate:format=duration -of compact "$OUT"
