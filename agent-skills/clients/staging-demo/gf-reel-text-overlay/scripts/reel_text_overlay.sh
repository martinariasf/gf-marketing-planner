#!/bin/bash
# GF reel text overlay — burn REAL sharp text onto a text-free branded seedance clip.
# The video model misspells generated text, so we generate a clean background and
# composite the copy here with ffmpeg drawtext. Copy this and edit per post.
#
# Usage: edit IN / OUT / the per-segment drawtext lines + timings, then: bash reel_text_overlay.sh
set -e
cd /opt/marketing-planner/client/assets/

IN=video_XXXXXXXXXX.mp4          # the text-free branded background clip
OUT=<POSTID>_final.mp4
F=/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf   # Inter/Arial stand-in (verify with: fc-list | grep -i bold)
G=0x22c55e   # brand green (keyword lines)
W=0xffffff   # white (body lines)

# Per-segment alpha fade envelopes: fade in 0.4s, hold, fade out 0.4s.
# Adjust the numbers to your clip length / segment count. t is in seconds.
# Seg1 visible ~0.2-2.6s | Seg2 ~2.8-4.6s | Seg3 ~4.8-end
a1="if(lt(t,0.2),0,if(lt(t,0.6),(t-0.2)/0.4,if(lt(t,2.2),1,if(lt(t,2.6),(2.6-t)/0.4,0))))"
a2="if(lt(t,2.8),0,if(lt(t,3.2),(t-2.8)/0.4,if(lt(t,4.2),1,if(lt(t,4.6),(4.6-t)/0.4,0))))"
a3="if(lt(t,4.8),0,if(lt(t,5.2),(t-4.8)/0.4,1))"

# x=(w-tw)/2 centers each line. y values stack lines; bump keyword fontsize larger.
ffmpeg -y -i "$IN" -vf "
drawtext=fontfile=$F:text='That scary AI headline?':fontcolor=$W:fontsize=52:x=(w-tw)/2:y=500:alpha='$a1',
drawtext=fontfile=$F:text='It was probably a':fontcolor=$W:fontsize=52:x=(w-tw)/2:y=600:alpha='$a1',
drawtext=fontfile=$F:text='demo.':fontcolor=$G:fontsize=64:x=(w-tw)/2:y=675:alpha='$a1',
drawtext=fontfile=$F:text='Demos show peak':fontcolor=$W:fontsize=52:x=(w-tw)/2:y=540:alpha='$a2',
drawtext=fontfile=$F:text='capability. Once.':fontcolor=$W:fontsize=52:x=(w-tw)/2:y=620:alpha='$a2',
drawtext=fontfile=$F:text='What matters is':fontcolor=$W:fontsize=52:x=(w-tw)/2:y=560:alpha='$a3',
drawtext=fontfile=$F:text='reliability.':fontcolor=$G:fontsize=68:x=(w-tw)/2:y=650:alpha='$a3'
" -c:v libx264 -pix_fmt yuv420p -crf 18 -preset medium -an "$OUT"
echo "OK $OUT"

# Then cut the cover from the closing keyword frame:
#   ffmpeg -y -ss 5.4 -i "$OUT" -frames:v 1 -q:v 2 <POSTID>_cover_final.png
# And vision-check every segment frame before approving.
