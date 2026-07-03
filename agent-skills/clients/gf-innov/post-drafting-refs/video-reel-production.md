# GF Instagram video / reel production

How to produce a short branded motion-graphics video for a GF Instagram post (e.g. the
"video" slot in a monthly plan) and wire it correctly into the dashboard.

## Generation

- Tool: `video_generate` with `model=bytedance/seedance-2.0` (default), `aspect_ratio=portrait`
  (9:16), `resolution=720p`.
- Pass `post_id` so the MP4 is auto-published to the client assets folder AND appended to the
  post's `media[]` as `type:"video"` in one call. The tool returns a local `path:` under
  `/opt/data/cache/videos/...` — share THAT path as a `MEDIA:` attachment so Pilar can watch it
  in chat (the public `marketing.gfinnov.com` host does NOT resolve from the tool environment, so
  do not try to curl the returned public URL — it will time out).
- Design system matches the carousel/cover doctrine: solid charcoal `#1a1a1a` background, white +
  bright-green `#22c55e` only, bold Inter-style kinetic type, no people, no stock footage, no logos
  in the corner, mobile-legible large text.

## Pacing for readability (HARD — Pilar, July 2026)

Pilar's first 5–6s clip went "too fast, I can't read the text." The fix that worked: **give each
text block ~3 seconds on screen** and make the total duration the sum of the blocks (e.g. 5 blocks
→ ~15s). In the prompt, spell out an explicit timed storyboard ("[0-3s] ... holds", "[3-6s] ...
holds", etc.) and use the words "SLOW, RELAXED PACING" and "stay fully on screen and readable for
about 3 seconds." Seedance respects an explicit per-segment timeline far better than a vague "slow
it down." Default to ~3s per readable text block unless the user says otherwise.

## Format field matters for the calendar/preview

- After attaching a video, the post `format` may still be `carousel` (or `single image`) from when
  it was first planned. **Set `format` to `reel`** via
  `PATCH /clients/$CLIENT_SLUG/posts/{id}` so the content calendar treats it as a video, not a
  static post. If left as `carousel`, the calendar shows "imagen y vista previa" and renders a
  static preview instead of a playable reel.
- Each regeneration appends a NEW entry to `media[]` (old videos are not removed). The post's
  active video is the latest entry; earlier ones are harmless history but be aware `media[]` can
  hold several videos after a few iterations.

## Copy must follow the new video angle

When the video's concept changes (e.g. from "do these tasks" to "peak capability vs reliability"),
rewrite the post `copy`, `title`, and `cta` to match — don't leave the old caption that names tools
or tasks the video no longer mentions. PATCH all three in one call.

## Known dashboard UI gaps (report to Pilar, not agent-fixable from here)

These are dashboard front-end issues Pilar tracks in Notion; the agent cannot fix them from the
API but should be aware they affect what she sees:
- Post detail labels media as "imagen y vista previa" even for videos — should say "video".
- Video preview renders as a static post, not a playable reel, and doesn't show the actual clip.
- The dashboard "reload/refresh" button is broken — so status changes (e.g. drafting→in_review)
  won't appear until a manual browser reload. If Pilar says "I don't see the change," suspect the
  broken refresh first and confirm the API state is correct before re-doing the work.
