#!/usr/bin/env zsh

set -euo pipefail

script_dir=${0:a:h}
project_root=${script_dir:h}
cd "$project_root"

if ! command -v ffmpeg >/dev/null 2>&1; then
  print -u2 "ffmpeg is required to build the cat-part sprites."
  exit 1
fi

ids=(calico tuxedo orange tabby white)
paw_y=(35 290 530 760 995)
tail_y=(15 275 530 790 1025)
tail_h=(245 245 245 235 225)

for index in {1..5}; do
  cat_id=${ids[$index]}
  output_dir="public/assets/cats/$cat_id"
  mkdir -p "$output_dir"

  ffmpeg -loglevel error -y \
    -i art/generated/cat-parts/paw-sheet-v1-alpha.png \
    -vf "crop=940:245:175:${paw_y[$index]},scale=230:70,pad=240:90:(ow-iw)/2:(oh-ih)/2:color=0x00000000" \
    "$output_dir/paw-flipper-v4.png"

  ffmpeg -loglevel error -y \
    -i art/generated/cat-parts/tail-sheet-v1-alpha.png \
    -vf "crop=1110:${tail_h[$index]}:70:${tail_y[$index]},transpose=2,scale=100:230,pad=120:240:(ow-iw)/2:(oh-ih)/2:color=0x00000000" \
    "$output_dir/tail-launcher-v4.png"
done

ffmpeg -loglevel error -y \
  -i public/assets/cats/tuxedo/paw-flipper-v4.png \
  -vf "eq=brightness=0.08:saturation=0.92" \
  public/assets/cats/tuxedo/paw-flipper-v4-tuned.png
mv public/assets/cats/tuxedo/paw-flipper-v4-tuned.png public/assets/cats/tuxedo/paw-flipper-v4.png

ffmpeg -loglevel error -y \
  -i public/assets/cats/tuxedo/tail-launcher-v4.png \
  -vf "eq=brightness=0.08:saturation=0.92" \
  public/assets/cats/tuxedo/tail-launcher-v4-tuned.png
mv public/assets/cats/tuxedo/tail-launcher-v4-tuned.png public/assets/cats/tuxedo/tail-launcher-v4.png

print "Built cat-part sprites for: ${ids[*]}"
