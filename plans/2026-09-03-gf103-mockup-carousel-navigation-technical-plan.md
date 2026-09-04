---
project: GF-103 Carousel navigation in the channel preview mockups
updated: 2026-09-03
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
focus_tasks: [TASK-001, TASK-002, TASK-003]
items:
  - gf-103: Carrousel Bug when sharing the link. | priority: high
---

# Plan

## Simple Words

On the link we share with a client, a carousel post shows only its first image.
The little "1/5" badge never moves and the dots never change, so the reviewer
has to click the magnifier and open the picture big to discover the other four
slides. After this change the preview itself is browsable: arrows on the image,
clickable dots under it, and a counter that actually counts. Opening the big
view then starts on whatever slide you were looking at. Instagram and LinkedIn
both get it. Single images, stories and videos look exactly as they do today,
and the internal dashboard's separate "Picture" tab is not touched.

## Frontend Implementation

### TASK-001: Make the Instagram and LinkedIn mockups browse their own carousel slides
status: todo
owner: martin
agent: claude
reviewer: kimi-k3
branch: claude/gf-103-carousel-nav
area: frontend
estimate: S
depends_on: []
tags: [gf-103, ui, mockup, carousel]
acceptance:
- A carousel post (slides.length > 1) in the Instagram mockup renders a left and a right chevron button overlaid on the square image; clicking them changes the displayed image inside the mockup, wrapping past both ends.
- The Instagram counter badge reads the live position (e.g. "3/5"), not a fixed "1/5", and the active carousel dot moves with it.
- The Instagram dots are clickable buttons that jump straight to their slide.
- The LinkedIn mockup gets the same three behaviours on its 1.91:1 frame.
- A single-image post, a story post (format story, no video) and a video post render byte-for-byte the same markup as before - no arrows, no dots, no counter appear.
- `ChannelMockup` accepts an optional `onSlideChange?: (index: number) => void` prop and calls it on every slide change; `routes/client/calendar.tsx` passes nothing and is unmodified.
notes:
- Source - GF-103 in Notion (Bug, High, S, proposed by Martin).
- Code evidence - `app-v2/src/components/channel-mockup/instagram.tsx:78` hardcodes `1/{slideCount}` and `:100` renders dots with `i === 0 ? active`. `linkedin.tsx:85` and `:102` have the identical frozen pair. Neither component holds any state today.
- Displayed image - both mockups currently render `post.image` (the cover). Render `slides[idx].image` when `isCarousel`, falling back to `post.image` otherwise, so a non-carousel post keeps its exact current path.
- The component stays UNCONTROLLED - `useState(0)` inside each mockup. `onSlideChange` is a notification for the parent, not a controlled value; this keeps calendar.tsx untouched (ponytail: minimum surface, lift to a controlled prop only if a second consumer needs to drive the index).
- Reset the index with `useEffect` when the post identity or slide count changes, or the deck view will show slide 3 of the next post.
- i18n - reuse the existing keys `calendar.previousSlide`, `calendar.nextSlide`, `calendar.goToSlide`, `calendar.slideCounter`; all four already exist in EN/DE/ES at `lib/i18n-dict.ts:547-550`, `:1559-1562`, `:2561-2564`. Do NOT add new dictionary entries. The mockups may import `useT` from `@/lib/i18n` - both consuming routes already sit under the provider.
- Existing visual pattern to copy - `routes/client/calendar.tsx:2214` `PicturePane` (arrow buttons, dot row, `(next + total) % total` wrap). Match its arrow styling; skip its thumbnail filmstrip, which does not fit a phone-frame mockup.
- The arrows must not swallow the zoom button in `external.tsx` - keep them inside the media frame and leave the `top-2 right-2` badge slot alone.

### TASK-002: Open the external-review lightbox on the slide the mockup is showing
status: todo
owner: martin
agent: claude
reviewer: kimi-k3
branch: claude/gf-103-carousel-nav
area: frontend
estimate: XS
depends_on: [TASK-001]
tags: [gf-103, ui, review-link]
acceptance:
- In the shared review link, navigating a carousel preview to slide 3 and then clicking the magnifier opens the lightbox on slide 3, not slide 1.
- The lightbox's own prev/next arrows still work and still wrap.
- A single-image post's magnifier behaves exactly as before.
notes:
- Source - assumption 2 confirmed by Martin 2026-09-03 - without this the fix creates a new jump-back-to-1 inconsistency.
- Code evidence - `app-v2/src/routes/review/external.tsx:389` types `onZoom: () => void` inside `PostContent`; the two card components thread it up as `() => onZoom({ post, slide: 0 })` at `:753` and `:1169`, and `:497` holds `const [lightbox, setLightbox] = useState<LightboxTarget | null>(null)`.
- Change - `PostContent` holds `const [slide, setSlide] = useState(0)`, passes `onSlideChange={setSlide}` to `ChannelMockup`, and its `onZoom` prop becomes `(slide: number) => void`. The two intermediate card components (`:807-820` and `:1243-1257`) widen their `onZoom` type the same way, and the two call sites become `onZoom={(slide) => onZoom({ post, slide })}`.
- Reset `slide` to 0 when `post.id` changes (the deck view reuses one PostContent across posts).

## Verification

### TASK-003: Verify the change locally and on live staging
status: todo
owner: martin
agent: claude
reviewer: kimi-k3
branch: claude/gf-103-carousel-nav
area: verification
estimate: XS
depends_on: [TASK-001, TASK-002]
tags: [gf-103, verification]
acceptance:
- `npx tsc -b` in app-v2 exits 0 with no output.
- `npx vite build` in app-v2 succeeds.
- `npx eslint` on the four changed files reports no new errors.
- The browser preview shows a carousel post's Instagram preview advancing through every slide with arrows and dots, and the zoom opening on the shown slide.
- After merge, the same is exercised on staging.marketing.gfinnov.com against a real shared review link.
notes:
- No test harness covers `app-v2/src/components/channel-mockup/` - `find app-v2/src -name '*.test.*'` returns nothing for this area, so TDD does not apply here. Typecheck + build + browser exercise is the verification, and that limitation is stated rather than skipped silently.
- Local dev runs against staging data with the GF-144 viewer token (see `reference_local_dev_against_staging`).
