---
title: GF-67 Translation Improvement — Full Webapp i18n Coverage
date: 2026-06-30
status: done
default_group: item
focus_tags: [gf-67]
items:
  - gf-67: Translation improvement - full webapp i18n coverage | priority: medium
---

## Progress (2026-06-30)

All tasks implemented and verified on branch `claude/gf-67-translation-improvement`
(worktree off `experimental`, commits `39a27a7` + `83754a7`). `tsc -b` + `vite build`
pass. Browser-verified: German calendar months ("Juli"), Spanish dates ("20 may 2026"),
full DE/ES UI chrome, **live language switch (no reload)** re-localises calendar months,
and no `[i18n]` key-drift warnings. Bonus: `InformationSourcesBoard` (never
internationalized) fully localized. Dead `PostCard` component flagged for separate
deletion (out of scope).

**Layer-5 independent review (GLM 5.2, cross-vendor):** round 1 FINDINGS → fixed
(render-time locale side effect; live-switch memo-deps lag on calendar/strategy;
unknown-sourceType guard; cache comment) → **round 2 PASS**. Two findings rejected
with evidence.

**PR:** https://github.com/martinariasf/gf-marketing-planner/pull/30 — **MERGED** to
`experimental` (merge commit `4cf6549`; resolved a changelog top-entry conflict with
the GF-59 entry, kept both). CI "Build & deploy staging" **succeeded** (run 28572916960,
built with REST API enabled); staging live (HTTP 200). **GF-67 → Done in Staging** with
release note. Remaining: production promotion (separate `promote-staging-to-prod` step).

## Simple Words

The dashboard already speaks three languages (English, German, Spanish), and most
of it switches correctly. But two things are still wrong: **dates and months are
always shown in English** no matter which language you pick, and **a handful of
texts were never added to the translation list** — most importantly the error
screen you see if a page crashes, a few pop-up messages, and a couple of small
components. This task does a full sweep of the whole webapp so that **every single
text a user can see — including months, dates, pop-ups and error pages — appears
correctly in all three languages.**

Not in scope: the Viktor *agent's* language behaviour (it sometimes replies in
English) — that is tracked separately as GF-61. This item is the dashboard/webapp
UI only.

## Current State (code-grounded)

- i18n infrastructure already exists and is healthy:
  - `app-v2/src/lib/i18n.tsx` — `LanguageProvider`, `useT()`, `Lang = 'en' | 'de' | 'es'`,
    falls back to English then to the raw key.
  - `app-v2/src/lib/i18n-dict.ts` — ~760 keys per language (~2289 lines total).
  - `app-v2/src/components/language-switcher.tsx` — the EN/DE/ES switch.
  - 27 of 29 user-facing `.tsx` files already call `useT`/`useI18n`.
- Root cause of "months in English": **locale is hardcoded** in the date/number layer:
  - `app-v2/src/lib/format.ts` — every `Intl.NumberFormat` / `Intl.DateTimeFormat`
    is built with `'en-US'` (lines 1, 6, 25, 31, 45).
  - `app-v2/src/lib/planning-range.ts:75-76` — month name/label via
    `toLocaleString('en-US', …)`.
  - `app-v2/src/routes/client/goals.tsx:31` — hardcoded English month-name array;
    `goals.tsx:57` already defines a good `LOCALE` map (`en→en-US, de→de-DE, es→es-ES`)
    plus a `todayMonthEn` English comparison at `goals.tsx:324`.
- Strings still bypassing the dictionary:
  - `app-v2/src/App.tsx:70-95` — app error boundary text + buttons, all hardcoded
    English. It is a **class component**, so it cannot call the `useT` hook directly.
  - Hardcoded toasts, e.g. `routes/client/assets.tsx:818,879`, `routes/client/calendar.tsx:341`.
  - Components not importing the i18n hook: `components/post-card.tsx`,
    `routes/client/videos.tsx` (also `channel-icon.tsx`, `gf-logo.tsx`, `pillar.tsx`
    — verify whether these contain any user-visible text or are presentational only).
  - Browser-locale (`undefined`) date formatting in `routes/review/external.tsx:73`
    and `lib/calendar-export.ts:62` — decide explicit-locale vs browser-locale.

## Tasks

### TASK-001 — Make the date/number layer locale-aware
- status: todo
- owner: human
- agent: claude
- reviewer: codex
- branch: claude/gf-67-format-locale
- area: Dashboard
- estimate: M
- depends_on: []
- tags: [gf-67, i18n, dates]
- acceptance:
  - `fmtDate`, `fmtDateShort`, `fmtDateTime`, `fmtNumber`, `fmtCompact` honour the
    active `Lang` (map `en→en-US, de→de-DE, es→es-ES`), no `'en-US'` left hardcoded.
  - `planning-range.ts` month name/label render in the active language.
  - `goals.tsx` no longer relies on a hardcoded English month-name array; the
    `todayMonthEn` comparison is made language-independent (compare by month index).
  - Months/dates render in DE and ES on calendar, planning range, goals, post dates.
- notes: `lib/format.ts` formatters are currently module-level singletons built
  with `'en-US'`; either rebuild per-call from the active lang or expose a setter
  the `LanguageProvider` updates on `setLang`. Reuse the `LOCALE` map already in
  `goals.tsx:57`. `format.ts` has no React context, so pass `lang` in or read a
  shared module-level current-locale that `i18n.tsx` keeps in sync.

### TASK-002 — Localise the app error boundary and other class/non-hook UI
- status: todo
- owner: human
- agent: claude
- reviewer: codex
- branch: claude/gf-67-error-boundary-i18n
- area: Dashboard
- estimate: S
- depends_on: []
- tags: [gf-67, i18n, errors]
- acceptance:
  - `App.tsx:70-95` error screen (heading, body, "Discard local edits & reload",
    "Just reload") appears in the selected language.
  - Any not-found / empty / fallback screens are localised.
- notes: Class component can't use `useT`. Options: read persisted lang from
  `localStorage` key `mp.lang` and look up `translations[lang]` directly, or split
  the error UI into a function child that uses the hook. Add the new keys to
  `i18n-dict.ts` in all 3 languages.

### TASK-003 — Sweep remaining hardcoded strings into the dictionary
- status: todo
- owner: human
- agent: claude
- reviewer: codex
- branch: claude/gf-67-string-sweep
- area: Dashboard
- estimate: L
- depends_on: []
- tags: [gf-67, i18n, sweep]
- acceptance:
  - Hardcoded toasts (`assets.tsx:818,879`, `calendar.tsx:341`, and any others
    found by sweeping `toast.error('`/`toast.success('` for literals) use `t(...)`.
  - `post-card.tsx` and `videos.tsx` use the i18n hook for all user-visible text;
    `channel-icon.tsx`/`gf-logo.tsx`/`pillar.tsx` confirmed text-free or fixed.
  - Page-by-page pass over all routes (calendar, approvals, strategy, goals,
    assets, performance, integration, references, learnings, suggestions,
    brand-kit, videos, external review, changelog, chat) finds no English literal
    when DE/ES is selected.
  - New keys added to `i18n-dict.ts` for **en, de, and es** (no missing-key
    fallbacks to English).
- notes: Use grep for JSX text literals and quoted strings in `toast`/`confirm`/
  `aria-label`/`placeholder`/`title=`. The dict fallback chain (`dict → enDict →
  key`) hides missing DE/ES values — so verify keys exist in all three maps, not
  just that the UI renders.

### TASK-004 — Regression guard for untranslated strings
- status: todo
- owner: human
- agent: claude
- reviewer: codex
- branch: claude/gf-67-i18n-guard
- area: Dashboard
- estimate: S
- depends_on: [TASK-003]
- tags: [gf-67, i18n, tooling]
- acceptance:
  - A repeatable check exists to catch new hardcoded user-facing text and/or keys
    missing from de/es (e.g. a dev-mode warning when `dict[key]` is absent and the
    en fallback is used, or a small script asserting key-parity across en/de/es).
- notes: Keep it lightweight; goal is to stop coverage regressions, not to build a
  full extraction pipeline.

### TASK-005 — Verification across all three languages
- status: todo
- owner: human
- agent: claude
- reviewer: codex
- branch: claude/gf-67-string-sweep
- area: Dashboard
- estimate: S
- depends_on: [TASK-001, TASK-002, TASK-003]
- tags: [gf-67, verification]
- acceptance:
  - `cd app-v2 && npx tsc -b` and `npx vite build` pass; `npx eslint` clean on
    changed files.
  - Browser preview: switch EN→DE→ES on every route and confirm no English
    leakage, correct months/dates, and localised error/empty/toast states.
  - Add a dated, user-facing entry at the top of `app-v2/src/lib/changelog.ts`
    (date = staging deploy date).
  - Move GF-67 to "Done in Staging" after merge; Layer-5 `independent-review`
    (Codex) PASS before merge to `experimental`.

## Verification Checklist (summary)

1. `cd app-v2 && npx tsc -b`
2. `cd app-v2 && npx vite build`
3. `cd app-v2 && npx eslint <changed files>`
4. Preview: EN/DE/ES pass over all routes — text, months/dates, toasts, error screen.
5. `independent-review` (Codex) → PASS.
6. Changelog entry + Notion → "Done in Staging".

## Notion Reference

- GF-67 — Translation improvement (Type: Change, Area: Dashboard, Priority: Medium,
  Estimate: L, Proposed by: Martin), status Inbox.
  https://app.notion.com/p/Translation-improvement-full-webapp-i18n-coverage-months-dates-error-pages-in-all-3-languages-38fae4b1247e81528db4c668c27305fb
- Related: GF-61 (agent language sometimes switching to English — agent side, separate).
