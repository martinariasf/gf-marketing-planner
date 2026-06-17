---
name: video-generation
description: Generating short marketing videos with OpenRouter Seedance 2.0. Read brand identity first, use video_generate only, and publish generated MP4s as dashboard video assets.
tags: [marketing, videos, branding, staging]
---

# Video Generation (Seedance 2.0)

For the client **staging-demo** on the Marketing-Planner staging server.

## STEP 0 - Read The Brand Identity First

Never generate a video before you know the brand. If you have not already read
the brief this conversation, your first action is:

```
GET /clients/staging-demo/brief  ->  use data.branding
```

Put the brand colors, typography, and tone into the video prompt. If the video
must preserve an exact logo, product, or existing image style, use public asset
URLs or asset filenames as `input_references`, `first_frame`, or `last_frame`.

## STEP 1 - Generate

Use **only**:

```
video_generate(
  prompt="<subject + camera movement + pacing + lighting + brand style>",
  post_id="<existing post id, when the video belongs to a post>",
  duration=5,
  resolution="720p",
  aspect_ratio="landscape",
  generate_audio=false
)
```

The model is `bytedance/seedance-2.0` through OpenRouter. The tool submits the
async job, polls until it is done, downloads the MP4, copies it into
`/opt/marketing-planner/client/assets/`, appends a manifest entry with
`kind:"video"`, appends the video to the post's `media[]` when `post_id` is
provided, and returns the public URL in `video`.

For an existing dashboard post, always pass `post_id`. This is what makes the
clip appear in the content calendar and the Videos section instead of only being
a loose asset.

Defaults when the user does not specify:
- `duration=5`
- `resolution="720p"`
- `aspect_ratio="landscape"` (16:9)
- `generate_audio=false`

Ask one short question only when duration, shape, or reference material is
unclear. Do not ask for concept directions if the request and brand context are
clear enough.

## References And Frames

Use `input_references` for loose visual guidance:

```
video_generate(
  prompt="<keep the same product identity, slow orbit, branded environment>",
  input_references=["product-photo.png"]
)
```

Use `first_frame` and `last_frame` when the clip must start or end on exact
existing images:

```
video_generate(
  prompt="<animate from the static cover into a subtle camera push>",
  first_frame="p016_cover.png"
)
```

Reference values must be public HTTPS image URLs, asset filenames, or paths
inside the client assets folder. Do not pass `data:` URLs for video.

## Delivery

Send the generated video once. Prefer the public `video` URL returned by the
tool, and mention that it is saved in the dashboard Videos section. If
`post_id` was provided, confirm that it is attached to that post.

Never create videos with terminal `curl`, raw OpenRouter calls, or any other
video API path; `video_generate` owns the whole workflow.
