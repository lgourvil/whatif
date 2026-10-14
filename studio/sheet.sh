#!/bin/bash
# usage: sheet.sh out.jpg img1 img2 ... (contact sheet, 3 per row, 360x640 tiles)
OUT=$1; shift
n=$#; rows=$(( (n+2)/3 ))
args=(); for i in "$@"; do args+=(-i "$i"); done
ffmpeg -y -loglevel error "${args[@]}" -filter_complex "$(for k in $(seq 0 $((n-1))); do printf "[$k]scale=360:640[s$k];"; done)$(for k in $(seq 0 $((n-1))); do printf "[s$k]"; done)xstack=inputs=$n:layout=$(for k in $(seq 0 $((n-1))); do printf "%s_%s|" "$(( (k%3)*360 ))" "$(( (k/3)*640 ))"; done | sed 's/|$//')${n:+}" -q:v 3 "$OUT"
