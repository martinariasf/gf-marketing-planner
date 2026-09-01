# Staging V4 — Plan

> Status: **PLAN ONLY — no code changes yet.**
> Branch target: `experimental` (staging). Ship rules unchanged — see
> [`AGENTS.md`](./AGENTS.md): source-only edits, CI builds with `VITE_API_BASE`,
> never hand-edit `app-dist`.
> Date: 2026-06-05. Author: Martin + Claude.

This document turns Martin's V4 feedback into a concrete, file-level work plan.
Each item lists **what, where, how, and risk**. It is grounded in the current
code (file + line references are real as of this date). Decisions already locked
with Martin are marked **[decided]**.

The product is a per-client marketing dashboard surfacing Viktor (Hermes agent).
Two moving parts touched here: the **SPA** (`app-v2/`) and the **agent config**
(`deploy-staging/staging-demo-agent/config.yaml`). The REST API
(`deploy-staging/api/`) is touched only lightly (one optional schema note).

---

## Summary of changes

| # | Area | Change | Surface |
|---|------|--------|---------|
| 1 | Chat | Fast/High picture-fidelity switch in the chat UI | SPA + agent prompt |
| 2 | Strategy | Make the strategy page company/time-agnostic (general framework) | SPA + i18n |
| 3 | Approvals | Pure drag-and-drop board; remove move-buttons, Waiting list & Telegram banner; click card → open post | SPA |
| 4 | Assets | Delete a picture, with a confirm dialog | SPA (+ API delete route) |
| 5 | Suggestions | Collapse 4 buttons → **Accept** (posts into chat) + **Dismiss** | SPA |
| 6 | Branding | Real GF logo in the top header + favicon | SPA + `public/` |
| 7 | i18n | Fix Spanish/German translation gaps — months shown in English | SPA (`format.ts`, `planning-range.ts`) |
| 8 | Calendar | Platform icons top-right of each post, clickable to change platform | SPA |
| 9 | Copy | Fix doubled CTA + hashtags missing from Preview (fold CTA into copy) | SPA + agent prompt |

---

## 1. Picture-fidelity switch in the chat  **[decided: Fast/High switch only]**

**Today:** the agent (`config.yaml` lines 60–90, 188) supports
`fidelity="fast"` (Nano Banana 2, seconds) vs `fidelity="high"` (premium,
~2–3 min) and is told to **ask the user every time** before generating. That
round-trip is the friction Martin wants gone.

**Goal:** a small, persistent **Fast / High** switch in the chat panel. The
chosen value is sent with every image request so the agent never has to ask.
No reference-image toggle, no third tier (locked with Martin).

**How:**
- **SPA — [`chat-sheet.tsx`](app-v2/src/components/chat-sheet.tsx):**
  - Add a two-option segmented control in the composer toolbar (next to the
    slash-chips row, ~line 611). State: `const [fidelity, setFidelity] =
    useState<'fast'|'high'>('fast')`, persisted to `localStorage`
    (`mp.imgFidelity`) like the language pref in `i18n.tsx`.
  - When sending (the `send()` callback, ~line 329), prepend a machine-readable
    hint to the outgoing message body, e.g. a single leading line
    `[image_fidelity=fast]` (only when the message looks image-related is
    overkill — simplest is to always include it; the agent ignores it for
    non-image turns). Keep it out of the rendered bubble by stripping that token
    in `MessageContent`/before display, OR send it via a side channel — see note.
  - **Cleaner alternative (preferred):** thread `fidelity` into
    `apiChatStream({...})` as an explicit field rather than smuggling it in the
    text. Requires a 1-line addition to the `/chat/stream` body in
    [`api-client.ts`](app-v2/src/lib/api-client.ts) and the API’s
    [`chat.ts`](deploy-staging/api/src/routes/chat.ts) to forward it to Hermes
    as a system preamble. Decide at implementation time; the localStorage switch
    + system-preamble path keeps the chat transcript clean.
- **Agent — `config.yaml`:** change the image instructions (lines 60–90, 188)
  from "ask first, then pass fidelity" to **"a fidelity preference is supplied
  with the request (`fast` default). Do NOT ask; use the supplied value. Only
  ask if none is present."** This removes the mandatory question while staying
  safe.

**Risk:** low. Behaviour degrades gracefully — if the hint is missing the agent
falls back to asking (today's behaviour).

---

## 2. Strategy page: company- & time-agnostic framework

**Today:** [`strategy.tsx`](app-v2/src/routes/client/strategy.tsx) renders a
fixed framework (positioning → priorities → pillars → roadmap → platforms → key
dates) which is already generic. Two things make it feel "Q2-locked":
1. The eyebrow prints `plan.quarter.label` (e.g. "Q2 2026") — line 329 — and the
   headline falls back to `plan.quarter.theme`.
2. The **"Revisar con Víktor" review prompts are hardcoded Spanish strings**
   (lines 374, 412, 452, 517, 654) regardless of selected language.

**Goal:** the *structure/labels* are a general framework valid for any company
and any time; only the *content* (positioning text, pillars, priorities, dates)
comes from the user/`plan.json`. Nothing in the chrome should pin it to a
specific quarter or language.

**How:**
- **De-quarter the hero:** stop leading with `Q2 2026`. Replace the eyebrow with
  a neutral, translated label (e.g. `t('strategy.frameworkEyebrow')` →
  "Marketing strategy" / "Estrategia de marketing" / "Marketing-Strategie").
  Keep `plan.quarter.*` available but no longer the headline source-of-truth;
  the headline uses `plan.headline` with a generic translated placeholder.
- **The campaign roadmap** already derives its months from the live calendar
  range (`planningMonths`), so it rolls forward automatically once #7 (month
  localization) lands — no hardcoded quarter there. Verify the
  `planningMonths[0]?.label … last.label` range header reads cleanly when the
  range spans a year boundary.
- **i18n the review prompts:** move the five hardcoded Spanish
  `ReviewButton` messages into `i18n-dict.ts` keys with `{var}` interpolation
  (e.g. `strategy.reviewPromptStrategy`, `…Positioning`, `…Priorities`,
  `…Pillars`, `…Platforms`) and translate EN/DE/ES. The button label
  `strategy.reviewWithViktor` is already keyed.
- Confirm every visible string on this page resolves through `useT()` — audit
  for any other literal copy.

**Risk:** low/medium — mostly string plumbing. The roadmap math is unchanged.

---

## 3. Approvals: pure drag-and-drop + click-through  **[decided: also remove Waiting/Telegram]**

**Today** ([`approvals.tsx`](app-v2/src/routes/client/approvals.tsx) +
[`approval-kanban.tsx`](app-v2/src/components/approval-kanban.tsx)):
- The kanban has 4 columns *and* per-card "→ Column" text buttons
  (`approval-kanban.tsx` lines 204–217) — the space hog Martin called out.
- Below the board: a Telegram copy-command banner (`TelegramBanner`), a
  "Waiting for approval" list (`WaitingRow`), and a recent-activity log.

**Goal:** the page is just **the drag-and-drop board + the activity log**.
Cards are draggable between the 4 columns (in review / approved / scheduled /
rejected) and **clicking a card (or its icon) opens that post** in the calendar.

**How:**
- **`approval-kanban.tsx`:**
  - Remove the "→ Column" button row (lines 204–217). Keep native HTML5 drag
    (already implemented, lines 103–131) as the only move mechanism.
  - Make the card body clickable → navigate to the post. Reuse the calendar's
    deep-link pattern: the calendar already supports landing on a specific post
    (`jumpToPost`, [`calendar.tsx`](app-v2/src/routes/client/calendar.tsx:255)).
    Simplest: `navigate(\`/c/${slug}/calendar?post=${post.id}\`)` and have
    `calendar.tsx` read a `?post=` query param on mount to call `jumpToPost`.
    (Add that query-param handling to `calendar.tsx`.)
  - Keep drag working without hijacking the click: start navigation on a plain
    click, suppress it if a drag occurred (`onDragStart` sets a flag).
  - **Accessibility note:** the per-card buttons were the keyboard/touch
    fallback. Replace with a small drag-handle affordance or a compact
    kebab-menu move action so touch users aren't stranded (drag on touch is
    unreliable). Flag for design at implementation time.
- **`approvals.tsx`:** delete `TelegramBanner` (lines 156–206), the Waiting
  section (lines 107–133) and `WaitingRow` (208–284), plus now-unused imports
  (`batchCommand`, `waiting`, the related i18n keys can stay). Keep the kanban
  section and the "Recent activity" log.

**Risk:** medium. Touch/keyboard fallback for moves needs a deliberate
replacement; don't ship drag-only without it.

---

## 4. Assets: delete a picture with confirm dialog

**Today:** [`assets.tsx`](app-v2/src/routes/client/assets.tsx) shows manifest
images (Viktor + Uploads folders) and a detail `Dialog` (lines 389–470). There
is **no delete** for manifest assets. (The Inspiration board *does* have delete +
`apiDeleteInspiration`, lines 604–613 — but that's a different store.)

**Goal:** delete a manifest picture, gated by a confirm dialog.

**How:**
- **API:** add a delete endpoint for manifest assets if one doesn't exist.
  Check [`assetFiles.ts`](deploy-staging/api/src/routes/assetFiles.ts) — there
  is an upload/list/serve surface; confirm whether `DELETE
  /clients/:slug/assets/files/:id` (remove file + manifest entry, append audit)
  exists. If not, add it following the `userOwned`/`viktorOwned` route pattern.
  Manifest is Viktor-owned, so deletion is a dashboard-initiated write to a
  Viktor-owned file — mirror how inspiration deletes are authorized.
- **`api-client.ts`:** add `apiDeleteAsset(slug, id)`.
- **`assets.tsx`:** in the detail `Dialog` footer (near line 457), add a
  destructive **Delete** button. Clicking opens a second confirm dialog
  (reuse shadcn `Dialog`, or an `AlertDialog` if available) — "Delete this
  image? This can't be undone." On confirm: call `apiDeleteAsset`, optimistic
  remove from the grid, toast, close. Roll back on error (pattern already used
  in `InspirationBoard.remove`, line 604).

**Risk:** medium — this is a real destructive write to Viktor-owned data. Ensure
the audit log records it and the file is actually removed from
`clients/<slug>/assets/`. Posts that referenced the deleted image will show the
empty-image placeholder (acceptable; note it in the confirm copy if cheap).

---

## 5. Suggestions: Accept (into chat) + Dismiss  **[decided]**

**Today:** [`suggestions.tsx`](app-v2/src/routes/client/suggestions.tsx) renders
**four** actions per open card (lines 286–321): "Copy" (copy accept text),
"Dismiss" (copy dismiss cmd), "Accept (staging)" (PATCH status), "Dismiss
(staging)" (PATCH status). Confusing.

**Goal:** two buttons — **Accept** and **Dismiss**.
- **Accept** → the suggestion's `suggestedAction` is sent into the Ask-Viktor
  chat (so Viktor acts on it), and the suggestion is marked accepted.
- **Dismiss** → mark dismissed. Done.

**How:**
- **`suggestions.tsx` `SuggestionCard`:** replace the 4-button block with two.
  - **Accept:** dispatch the existing chat-open event with the action as the
    message — `window.dispatchEvent(new CustomEvent('mp:open-chat', { detail: {
    message: suggestion.suggestedAction } }))` (same event the calendar uses,
    [`calendar.tsx`](app-v2/src/routes/client/calendar.tsx:82), handled in
    [`layout.tsx`](app-v2/src/routes/client/layout.tsx)). Then
    `apiPatchSuggestion(slug, id, { status: 'accepted' })` + `onChanged()`.
    Open question: auto-send vs pre-fill the composer. The chat's `initialMessage`
    pre-fills (not auto-sends) by design — keep that; the user hits Enter. (If
    Martin wants true one-click, we'd add an `autoSend` flag to `ChatSheet`.)
  - **Dismiss:** `apiPatchSuggestion(slug, id, { status: 'dismissed' })`.
  - Drop the clipboard-copy variants and their toasts/i18n usage.
- Remove now-unused imports (`Copy`, copy-state) and the
  `suggestions.copyAccept` / `dismissCopy` / `acceptStaging` / `dismissStaging`
  i18n keys (or leave keys, just stop referencing).

**Risk:** low. Confirm the `mp:open-chat` handler opens the panel even when
collapsed (it does — panel stays mounted, `chat-sheet.tsx` lines 521–543).

---

## 6. Real GF logo in header + favicon

**Today:** header in [`layout.tsx`](app-v2/src/routes/client/layout.tsx:203)
shows the **client** `logoInitials` (line 256), and `GFLogo` is imported
(line 32) from [`gf-logo.tsx`](app-v2/src/components/gf-logo.tsx) — but Martin
says the current asset isn't the real logo. Favicon is `public/favicon.svg`
(referenced in [`index.html`](app-v2/index.html)).

**Goal:** the **real GF logo** (navy "G" with green diagonal accents + navy "F",
the file Martin uploaded) appears in the top header as the product brand, and as
the browser favicon.

**How:**
- Save the uploaded logo into `app-v2/public/` (e.g. `gf-logo.png` or a cleaned
  `gf-logo.svg`). Replace the placeholder `public/gf-logo.svg` /
  `public/favicon.svg` with the real artwork. (SVG preferred for crispness; if
  only PNG is available, add a 32×32/180×180 favicon set.)
- **`index.html`:** point `<link rel="icon">` at the real file; add an
  `apple-touch-icon`. Update `<title>` if desired (currently "Viktor Marketing
  Operating Dashboard").
- **`gf-logo.tsx` / `layout.tsx` header:** render the real GF logo at top-left
  as the global brand, keeping the per-client `logoInitials`/name as the client
  context (they serve different roles: GF = product brand, initials = which
  client you're viewing). Confirm placement with Martin ("on the side of Edit").
- Production parity: the same `public/` assets ship to prod on the next
  promotion — fine, the logo is GF's in both.

**Risk:** low. Just verify the SVG has a transparent background and reads on the
header's `bg-paper`.

---

## 7. Translation fixes — months in English despite ES/DE  **[root cause found]**

**Root cause:** date/month formatting bypasses i18n entirely.
- [`format.ts`](app-v2/src/lib/format.ts) hardcodes **`'en-US'`** in every
  `Intl.DateTimeFormat` (lines 25, 31, 45) and `Intl.NumberFormat` (lines 1, 6).
- [`planning-range.ts`](app-v2/src/lib/planning-range.ts) builds month names
  with `date.toLocaleString('en-US', …)` (lines 75–76) — this is what prints
  "June"/"July" in the calendar tabs and strategy roadmap even when ES is
  selected.

**Goal:** all dates, month names, and numbers follow the selected language
(`en`/`de`/`es`).

**How:**
- Map app `Lang` → BCP-47 locale: `en → 'en-US'`, `de → 'de-DE'`, `es → 'es-ES'`.
- **`format.ts`:** the functions are pure (no React). Two options:
  1. **Locale-aware hook (preferred):** add `useFormat()` in `i18n.tsx` (or a
     `format` module that reads current lang) returning `fmtDate`, `fmtDateShort`,
     `fmtDateTime`, `fmtNumber`, … bound to the active locale. Migrate call sites
     (calendar, approvals, suggestions, assets, strategy) from the static
     imports to the hook. More touch points but correct and reactive.
  2. **Lightweight:** keep the functions but read a module-level "current locale"
     that `LanguageProvider` sets in its `useEffect` (lines 38–41). Fewer call-site
     changes; slightly less "reactive" (fine, since changing language re-renders).
  Recommend option 2 for the date/number formatters (smallest diff, no signature
  churn) — set a module var `currentLocale` from the provider and have
  `format.ts` read it.
- **`planning-range.ts`:** `monthsInRange()` runs outside React and is memoized
  per component. Add a `locale` param (default `'en-US'`) to `monthsInRange` /
  the `name`/`label` formatting, and pass the active locale from each caller
  (`calendar.tsx`, `strategy.tsx`), OR read the same module-level `currentLocale`.
  Keep `monthKeyFromDate` (machine keys) locale-independent.
- **Audit `i18n-dict.ts`** for missing ES/DE keys while here — Martin reports
  "some translation errors, especially to Spanish." Grep components for any
  literal (non-`t()`) user-facing strings (e.g. calendar's "Today"/"now"
  markers, `calendar.tsx` lines 342, 368, 598; the range dialog copy lines
  708–711; assets "Information Sources" literals lines 219, 260, 782) and key
  them. Fill EN/DE/ES.

**Risk:** medium — many call sites for dates. Module-level-locale approach keeps
the diff small. Test by switching to ES and checking calendar tabs + strategy
roadmap render "junio/julio".

---

## 8. Calendar: platform icon top-right, clickable to change platform

**Today:** the post's channel is shown as plain text (`· {post.channel}`) in
several places ([`calendar.tsx`](app-v2/src/routes/client/calendar.tsx) lines
241, 667, 791, 903). No icons, not changeable from the calendar.

**Goal:** show a **platform icon in the top-right corner** of the post view, and
make it **clickable to pick the platform** (Instagram, LinkedIn, TikTok, X,
Facebook — the schema's `CHANNELS`, `post.ts` line 27). Changing it PATCHes the
post.

**How:**
- **Icon set:** map each channel → an icon. Lucide lacks brand glyphs; the repo
  has `public/icons.svg` (an SVG sprite) — check whether platform marks live
  there; otherwise add small brand SVGs to `public/` or a `platform-icon.tsx`
  component. Define `PLATFORM_ICON: Record<Channel, …>`.
- **Placement:** in the Month-view right pane header
  ([`calendar.tsx`](app-v2/src/routes/client/calendar.tsx:486-508), the same row
  as the Picture/Preview toggle), add the platform icon top-right.
- **Picker:** clicking the icon opens a small popover/menu listing the 5
  channels. Selecting one calls `apiPatchPost(slug, post.id, { channel })`
  (already imported, line 197 usage) + `refetch()`. The Preview mockup
  (`ChannelMockup`) already switches IG/LinkedIn by `post.channel`, so the
  preview updates for free.
- Optionally surface the icon on the compact cards (`CompactPostCard`,
  line 774's thumbnail corner) for consistency — read-only there.
- i18n the channel labels.

**Risk:** low/medium. Sourcing clean brand icons is the only real task; the
PATCH + refetch path already exists.

---

## 9. Doubled CTA + hashtags missing in Preview  **[decided: fold CTA into copy]**

**Two bugs, one section.**

**9a. Hashtags missing from Preview.** The LinkedIn mockup
([`linkedin.tsx`](app-v2/src/components/channel-mockup/linkedin.tsx)) renders
title + copy but **no hashtags and no CTA**. Instagram
([`instagram.tsx`](app-v2/src/components/channel-mockup/instagram.tsx) lines
77–79) renders hashtags but no CTA. So in LinkedIn preview hashtags vanish.

**9b. CTA appears twice.** The agent sometimes writes the call-to-action into
the post `copy` *and* fills the separate `cta` field. The calendar `CopyPane`
shows `cta` as its own block (lines 962–979) → user sees it twice.

**Decision (locked):** **fold the CTA into `copy`.** Drop the separate CTA field
from the UI; the CTA becomes the final line(s) of the post body. This removes the
double-render by construction and matches how the platforms actually display a
post (one body, hashtags below).

**How:**
- **SPA — `calendar.tsx` `CopyPane`:** remove the CTA input block (lines
  962–979) and the `cta` state/dirty/patch wiring (lines 855, 862, 873). Editing
  the CTA now happens inside the copy textarea.
- **Preview mockups:** render **hashtags in BOTH** IG and LinkedIn. Add the
  hashtag block to `linkedin.tsx` after the copy (mirror `instagram.tsx`
  lines 77–79). No separate CTA element — it lives in `copy`.
- **Agent — `config.yaml`:** update the copy/write-contract guidance so the CTA
  is written as the **last line of `copy`**, and the standalone `cta` field is
  **left empty / not used** going forward (lines 146–166, the post-fields
  block, and the "BEFORE writing any copy" section lines 41–45). Be explicit:
  "Do not duplicate the CTA — put it once, as the closing line of `copy`. Leave
  `cta` empty."
- **API/schema:** `cta` stays in the zod schema
  ([`post.ts`](deploy-staging/api/src/schemas/post.ts) line 84) for back-compat
  (existing posts have it; `coalescePost` defaults it, line 152). We simply stop
  surfacing/writing it. **Optional migration:** a one-off script to append any
  non-empty legacy `cta` onto `copy` and clear `cta`, so old posts don't look
  like they "lost" their CTA. Recommended but low priority.
- **Hashtags as the single field:** the `hashtags` array stays the source of
  truth and is now reliably rendered in both previews. The calendar already has
  a hashtags editor (`CopyPane` lines 942–960) — keep it.

**Risk:** low/medium. The migration for legacy `cta` is the only data-touching
piece; everything else is render + prompt.

---

## Cross-cutting / sequencing

**Suggested order** (low-risk, high-visibility first):
1. **#7 i18n/months** + **#6 logo/favicon** — small, visible, no API.
2. **#9 CTA/hashtags** (SPA render + agent prompt) + **#2 strategy strings**.
3. **#5 suggestions** + **#3 approvals** (SPA-only UI restructures).
4. **#8 platform picker** (needs icons) + **#1 fidelity switch** (SPA + prompt).
5. **#4 asset delete** (needs/verifies an API delete route — most backend risk).

**Testing:** for each, verify in staging (`staging.marketing.gfinnov.com`)
**built in API mode** — a plain `pnpm build` falls to file mode and shows "No
clients yet" (see [`ARCHITECTURE.md`](./ARCHITECTURE.md) §"file-mode trap" and
[`AGENTS.md`](./AGENTS.md) §4). Language QA: switch ES, confirm month names and
the strategy roadmap localize.

**Agent redeploy:** changes to `config.yaml` (#1, #9) require reloading the
staging agent (`hermes-marketing-staging`) — do NOT touch
`hermes-marketing-demo` (prod). Follow the existing staging agent deploy step.

**Out of scope here:** production cutover (separate `promote-staging-to-prod`
flow), carousel changes, Postiz wiring.

## Open questions for Martin

1. **#1 fidelity transport** — OK to thread `fidelity` as an explicit
   `/chat/stream` field (clean transcript) rather than an inline token?
2. **#5 Accept** — pre-fill the chat composer (you press Enter) or true
   one-click auto-send?
3. **#3 approvals** — acceptable touch/keyboard fallback for moving cards once
   the text buttons are gone (drag-handle vs kebab menu)?
4. **#6 logo** — exact header placement ("on the side of Edit") — left of the
   client name, or replacing the client initials block?
5. **#9** — run the one-off migration to fold legacy `cta` into `copy`, or leave
   old posts as-is?
