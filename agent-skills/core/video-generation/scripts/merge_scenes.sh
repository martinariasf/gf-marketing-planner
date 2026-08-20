#!/bin/bash
# Merge N composited scenes (outputs of composite_overlay.sh) into ONE branded reel
# with smooth xfade transitions. Every scene is normalized to identical geometry/fps
# FIRST (xfade refuses mismatched inputs), then crossfaded at EXPLICIT offsets.
#
# Chained-xfade offset math (fill the literals below — no bc needed):
#   offset_1 = D1 - XF
#   offset_2 = D1 + D2 - 2*XF
#   offset_k = (D1+..+Dk) - k*XF
# Final duration = (sum of all Dk) - (N-1)*XF.
#
# Requires only ffmpeg + coreutils. Copy + edit the SCENES / durations / offsets, then:
#   bash merge_scenes.sh
set -e
cd /opt/marketing-planner/client/assets/

OUT=<POSTID>_final.mp4
XF=0.6            # transition length (s)
TR=fade          # xfade transition: fade | slideleft | slideright | wipeleft | ...

# Scenes in play order. Add/remove [n:v] lines + xfade stages to match the count.
S1=<POSTID>_scene1.mp4
S2=<POSTID>_scene2.mp4
S3=<POSTID>_scene3.mp4

# EXPLICIT xfade offsets (seconds). With three 6s scenes and XF=0.6:
#   O1 = 6 - 0.6           = 5.4
#   O2 = 6 + 6 - 2*0.6     = 10.8
# Recompute from the REAL clip lengths (ffprobe -show_entries format=duration each S*).
O1=5.4           # xfade S1 -> S2
O2=10.8          # xfade (S1+S2) -> S3

ffmpeg -y -i "$S1" -i "$S2" -i "$S3" -filter_complex "
[0:v]scale=1080:1920:flags=lanczos,setsar=1,fps=30[v0];
[1:v]scale=1080:1920:flags=lanczos,setsar=1,fps=30[v1];
[2:v]scale=1080:1920:flags=lanczos,setsar=1,fps=30[v2];
[v0][v1]xfade=transition=$TR:duration=$XF:offset=$O1[x1];
[x1][v2]xfade=transition=$TR:duration=$XF:offset=$O2[v]
" -map "[v]" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -movflags +faststart -an "$OUT"
echo "OK $OUT"

# Cut the cover from a strong keyword moment of the FINAL reel:
#   ffmpeg -y -ss 10.9 -i "$OUT" -frames:v 1 -q:v 2 <POSTID>_cover_final.png
# Then append <POSTID>_final.mp4 + the cover to manifest.json and PATCH the post with
# media[] = ONLY this final clip, format="reel", image = the cover (see ../SKILL.md).
