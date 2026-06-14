---
project: GF-4 Review — mobile polish (swipe feel + Share dialog)
updated: 2026-06-13
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
default_group: item
items:
  - gf-4: Collaboration layer | priority: high
---

# Plan

Mobile-polish follow-up to the GF-4 review page v3 (merged 22ef83c). Two areas
Martin flagged on the phone:

1. **Swipe feel** — the deck card lets you scroll down to read AND swipe
   left/right to decide, but the gesture is "sometimes not that clear." Keep
   BOTH gestures (Martin: "like Tinder or Bumble where you can do both") but make
   the flip crisp via axis-intent locking + stronger feedback + lower commit
   threshold.
2. **"Share for review" dialog** — on a phone the window is clipped (can't see
   all of it), the copy actions are split (link vs code), and the layout "is a
   bit weird." Make it a mobile bottom sheet that fits the viewport, add a single
   "Copy link & code" action, and tighten the visual hierarchy.

Decisions confirmed by Martin (2026-06-13, via AskUserQuestion):
- Swipe: keep scroll + add direction lock (Tinder/Bumble-style "do both").
- Share dialog: bottom sheet on mobile, centered dialog on desktop.
- Copy: one prominent "Copy link & code" button (ready-to-paste), keep the small
  individual link/code copy icons as fallback.

Branch: `feat/gf4-review-mobile-polish` off `experimental`, merged back at the
end. No backend or API changes — frontend + i18n only. Reviewer decisions stay
signals only.

## Frontend Implementation — swipe deck

### TASK-001: Crisp Tinder-style swipe that still allows vertical scroll-to-read
status: done
owner: claude
agent: claude
area: frontend
estimate: M
depends_on: []
tags: [gf-4, ui, review, deck, mobile]
acceptance:
- On a touch viewport, a deliberate horizontal drag past ~25% of the card width OR a horizontal flick (velocity) commits accept (right) / opens the changes sheet (left); a partial drag springs back smoothly to center.
- A vertical drag scrolls the card body to read the post and NEVER translates or rotates the card; a horizontal drag suppresses vertical scroll for that gesture (one gesture = one axis, decided from the initial movement — Tinder/Bumble feel).
- Visual feedback scales with drag distance: a growing green (accept) / amber (changes) tint over the card plus enlarging LIKE / NEEDS-CHANGES stamps; the card follows the finger ~1:1 with a slight rotation.
- Buttons (Accept / Request changes / Skip) and desktop ←/→ keys still work unchanged; `prefers-reduced-motion` disables the rotation/tint animation but keeps the commit logic.
notes:
- Source: GF-4 in Notion (Collaboration layer); Martin 2026-06-13.
- Code evidence: app-v2/src/routes/review/external.tsx DeckCard `motion.article` (lines ~741-810: drag="x", dragElastic=0.9, onDragEnd offset/velocity), SWIPE_OFFSET/SWIPE_VELOCITY consts (~58-60), inner scroll `<div className="flex-1 overflow-y-auto">` (~799).
- Technical scope: the card already has `touch-pan-y`, so the browser does coarse directional locking; the weakness is (a) commit threshold 120px is too high → swipes snap back and feel dead, (b) no `dragSnapToOrigin`, (c) faint corner stamps. Lower SWIPE_OFFSET to a width fraction, add `dragSnapToOrigin`, add `whileDrag` scale, grow the tint/stamps via useTransform on x. Reinforce axis lock with explicit pointer-intent detection (record first move; if |dy|>|dx| treat as scroll and keep the card pinned; if |dx|>|dy| engage the swipe and preventDefault scroll) so diagonal gestures pick one axis cleanly.

## Frontend Implementation — Share dialog

### TASK-002: Share dialog becomes a mobile bottom sheet, fully visible + scrollable
status: done
owner: claude
agent: claude
area: frontend
estimate: M
depends_on: []
tags: [gf-4, ui, review, mobile, dialog]
acceptance:
- On a ~390px viewport the whole dialog is reachable: sticky title + Links/Activity tabs stay pinned while the list scrolls inside; capped to the visible viewport (dvh/svh) so nothing clips behind mobile browser chrome.
- On mobile it reads as a bottom sheet (anchored to the bottom, rounded top, full width); on desktop (sm+) it is unchanged from today (centered, max-w-2xl).
- The "New review link" / create button stays visible (sticky footer or in the pinned header) — never scrolled out of reach.
notes:
- Code evidence: app-v2/src/components/review-share-dialog.tsx DialogContent usage (~line 182, `className="sm:max-w-2xl"`); the Links list container (~line 229 `max-h-[46vh] overflow-y-auto`); shared primitive app-v2/src/components/ui/dialog.tsx DialogContent base classes (top-1/2 left-1/2 -translate-y-1/2, NO max-height/scroll — root cause of the clipping).
- Technical scope: `cn()` uses tailwind-merge (app-v2/src/lib/utils.ts), so override the base centering via responsive classes on THIS DialogContent without touching the shared primitive, e.g. `top-auto bottom-0 translate-y-0 max-w-full rounded-b-none rounded-t-2xl max-h-[92dvh] sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:max-w-2xl sm:rounded-xl`. Make the dialog a column flex with a sticky header (title+tabs) and a scroll region; drop the inner `max-h-[46vh]` in favor of the dialog-level scroll.

### TASK-003: "Copy link & code" combined action + clearer link cards
status: done
owner: claude
agent: claude
area: frontend
estimate: M
depends_on: []
tags: [gf-4, ui, review]
acceptance:
- When a link's access code is visible (just created/rotated), a prominent primary "Copy link & code" button copies a single ready-to-paste block (localized template containing the review URL and the code) and toasts success.
- The small individual copy icons for the link (and for the code) remain as a fallback; copying still works for links whose code is not currently revealed (link-only).
- Because the code is shown only once (hashed server-side), the combined button appears only while the code is revealed for that link; otherwise the card offers link copy + the existing "code shown once / rotate" hint.
- The link card visual hierarchy is tightened: clearer separation of title, URL, code, and actions; the code box reads as the primary thing to share when present.
notes:
- Code evidence: app-v2/src/components/review-share-dialog.tsx copy() helper (~line 144), `revealed` map set on create/rotate (~line 107 & 134), link card render block (~lines 230-326), code reveal box (~lines 273-298).
- Technical scope: add a `copyBoth(url, code)` that writes a localized multi-line string; render the combined button inside the `code &&` block. No API change.

### TASK-004: i18n for combined copy + any new labels (ES/DE/EN)
status: done
owner: claude
agent: claude
area: frontend
estimate: XS
depends_on: [TASK-003]
tags: [gf-4, i18n]
acceptance:
- New strings (combined copy button label, the clipboard message template with {url}/{code} placeholders, any sheet labels) resolve in EN, DE and ES; no raw keys rendered.
notes:
- Code evidence: app-v2/src/lib/i18n-dict.ts review.* block (existing review.copyLink/copyCode/code/codeOnce keys live here).

## Verification

### TASK-005: Build + mobile browser walkthrough
status: done
owner: claude
agent: claude
area: verification
estimate: S
depends_on: [TASK-001, TASK-002, TASK-003, TASK-004]
tags: [gf-4, verify, mobile]
acceptance:
- app-v2 build (tsc -b + vite) passes.
- Browser at a 390px viewport (stub API): in the deck, a synthetic vertical drag scrolls the card without moving it, and a horizontal drag/flick commits accept and opens the changes sheet; partial drag springs back.
- Share dialog at 390px: title+tabs pinned, list scrolls, create button reachable, nothing clipped; desktop (≥1024px) dialog visually unchanged.
- "Copy link & code" writes a block containing both the URL and the code (read back via navigator.clipboard in the harness).
notes:
- Mirror the v3 stub-API approach (node http stub + vite dev with VITE_API_BASE); use preview_resize / eval to drive a phone-width viewport and synthetic pointer events.

### TASK-006: Merge feat/gf4-review-mobile-polish to experimental, deploy, staging check
status: todo
owner: claude
agent: claude
area: deployment
estimate: XS
depends_on: [TASK-005]
tags: [gf-4, deploy]
acceptance:
- Branch merged to experimental; CI deploy green; the new code is present in the deployed staging bundle.
- Notion GF-4 decision log updated.
notes:
- Per new-task-workflow: never commit directly on experimental; merge via the feature branch.
