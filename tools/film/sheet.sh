#!/bin/sh
# sheet.sh <fmt> <frame> <out.png> <clip>…  : one frame of each clip, side by side (for looking at)
fmt=$1; fr=$2; out=$3; shift 3
dir=${FILM_OUT:-/home/claude/work/promo/footage}/$fmt
tmp=$(mktemp -d)
i=0
for c in "$@"; do
  f=$(printf "%s/%s/%05d.png" "$dir" "$c" "$fr")
  [ -f "$f" ] || f=$(ls "$dir/$c"/*.png | tail -1)
  cp "$f" "$tmp/$(printf %03d $i).png"; i=$((i+1))
done
cols=${COLS:-5}
ffmpeg -hide_banner -loglevel error -y -framerate 1 -i "$tmp/%03d.png" -vf "scale=iw*${SCALE:-1}:ih*${SCALE:-1}:flags=neighbor,tile=${cols}x$(( (i + cols - 1) / cols )):padding=3" -frames:v 1 "$out"
rm -r "$tmp"
