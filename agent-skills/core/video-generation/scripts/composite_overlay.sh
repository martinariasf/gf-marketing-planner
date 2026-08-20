#!/bin/bash
# Branded video — burn REAL sharp text + the REAL client logo onto ONE text-free
# Seedance plate. Seedance misspells generated copy ("headlines" -> "headlanes") and
# invents fake logos, so it only makes clean MOTION; we composite everything a viewer
# reads here with ffmpeg. This is the DEFAULT pipeline (see ../SKILL.md), not opt-in.
#
# Copy this file per SCENE and edit the marked spots. Requires only ffmpeg + coreutils
# on the box — the Montserrat fonts ship with this skill; the logo is the client's real
# transparent PNG. Vision-check EVERY text beat frame before approving.
#
# Usage: edit IN / OUT / LOGO / the fonts dir / colors / the drawtext beats + timings,
# then:  bash composite_overlay.sh
set -e
cd /opt/marketing-planner/client/assets/

# ---- Inputs ------------------------------------------------------------------
IN=plate_XXXXXXXXXX.mp4          # the text-free branded Seedance plate for this scene
OUT=<POSTID>_scene1.mp4          # composited scene (a merge_scenes.sh input)

# Montserrat ships with THIS skill. You run INSIDE the agent container, where skills are
# mounted at /opt/data/skills/ (NOT the host /opt/agents/<slug>/... path). So:
#   /opt/data/skills/core/video-generation/assets/fonts/
# Confirm the real path once with:  ls "$FONTS"
FONTS=/opt/data/skills/core/video-generation/assets/fonts
F_BODY=$FONTS/Montserrat-SemiBold.ttf
F_KEY=$FONTS/Montserrat-ExtraBold.ttf

# The client's REAL logo as a transparent PNG (NEVER let Seedance draw a logo). Client
# skills mount under /opt/data/skills/client/ in the container, e.g. gf-innov's overlay.
# Use the LIGHT/WHITE lockup for video — cinematic plates are usually dark, and a dark
# logo disappears on them. A subtle dark scrim (below) then guarantees it reads even on
# bright shots. gf-innov ships both: gf-logo-white.png (default) + gf-logo-transparent.png.
LOGO=/opt/data/skills/client/gf-reel-text-overlay/assets/gf-logo-white.png
LOGO_W=380                       # logo width px (height auto-scales); tune per layout
# Scrim = a subtle semi-transparent dark pill behind the logo so it reads on ANY plate
# (white logo vanishes on bright footage without it). Sized for a WIDE horizontal lockup;
# for a tall/square logo raise SCRIM_H. Set SCRIM_A=0 to drop the scrim (then you MUST
# pick the logo variant that contrasts with the plate area behind it).
SCRIM_W=$((LOGO_W + 44)); SCRIM_H=120; SCRIM_Y=48; SCRIM_A=0.35
LOGO_Y=$((SCRIM_Y + 20))         # logo sits inside the scrim with ~20px top padding

# Brand colors (edit per the client brief branding)
KEY=0x22c55e                     # keyword / accent color
BODY=0xffffff                    # body text color

# ---- Text beat alpha envelopes (fade in 0.4s, hold, fade out 0.4s) -----------
# t is seconds. Adjust the numbers to this scene's length / beat count. One idea per
# beat, <=6 words, held >=1.5s so it stays readable on a phone.
a1="if(lt(t,0.2),0,if(lt(t,0.6),(t-0.2)/0.4,if(lt(t,2.2),1,if(lt(t,2.6),(2.6-t)/0.4,0))))"
a2="if(lt(t,2.8),0,if(lt(t,3.2),(t-2.8)/0.4,if(lt(t,4.2),1,if(lt(t,4.6),(4.6-t)/0.4,0))))"
a3="if(lt(t,4.8),0,if(lt(t,5.2),(t-4.8)/0.4,1))"

# ---- Composite: normalize -> drawtext beats -> persistent logo overlay -------
# scale/setsar/fps normalize the plate so every scene matches BEFORE merge_scenes.sh
# (xfade requires identical geometry). Portrait 9:16 default — swap 1080:1920 for the
# post's real shape (landscape 1920:1080, square 1080:1080).
# NOTE the `-loop 1` on the logo: it is a single still, so it MUST be looped or overlay
# only paints it on frame 1 and it vanishes. `shortest=1` then ends the output with the
# video (not the infinite logo). The logo overlay therefore does NOT use eof_action=pass;
# only the timed TEXT beats fade (via alpha) — the logo persists the whole clip.
ffmpeg -y -i "$IN" -loop 1 -i "$LOGO" -filter_complex "
[1:v]scale=$LOGO_W:-1[logo];
[0:v]scale=1080:1920:flags=lanczos,setsar=1,fps=30,
drawbox=x=(iw-$SCRIM_W)/2:y=$SCRIM_Y:w=$SCRIM_W:h=$SCRIM_H:color=black@$SCRIM_A:t=fill,
drawtext=fontfile=$F_BODY:text='Your headline here':fontcolor=$BODY:fontsize=56:x=(w-tw)/2:y=760:alpha='$a1',
drawtext=fontfile=$F_KEY:text='keyword':fontcolor=$KEY:fontsize=72:x=(w-tw)/2:y=850:alpha='$a1',
drawtext=fontfile=$F_BODY:text='Second beat':fontcolor=$BODY:fontsize=56:x=(w-tw)/2:y=800:alpha='$a2',
drawtext=fontfile=$F_BODY:text='Third beat':fontcolor=$BODY:fontsize=56:x=(w-tw)/2:y=800:alpha='$a3'[base];
[base][logo]overlay=x=(W-w)/2:y=$LOGO_Y:shortest=1[v]
" -map "[v]" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -movflags +faststart -an "$OUT"
echo "OK $OUT"

# MANDATORY: vision-check EACH beat frame AND the logo before approving. Read the exact
# copy back (spelling), AND confirm the REAL logo is clearly VISIBLE (not washed out /
# lost on the plate). An invisible logo is a fail — raise SCRIM_A, move it, or swap the
# logo variant, then re-check.
#   ffmpeg -y -ss 1.2 -i "$OUT" -frames:v 1 -q:v 2 check_beat1.png   # text + logo
#   ffmpeg -y -ss 3.5 -i "$OUT" -frames:v 1 -q:v 2 check_beat2.png   (repeat per beat)
