# STAGING_V3_PLAN — Marketing Planner staging → V3

**Branch:** `experimental` only (same rule as V2 — `main` / `hermes-marketing-demo` untouched).
**Author session:** 2026-06-02. Supersedes nothing in [STAGING_V2_PLAN.md](STAGING_V2_PLAN.md); this is the next layer on top of the shipped V2 stack.

This document covers three workstreams agreed with Martin:

1. **Part 1 — API hardening** so a malformed agent write can never break the webapp again (the "June's posts" white-screen).
2. **Part 2 — Agent publishing knowledge** so the staging Viktor knows exactly how to publish against the hardened contract.
3. **Part 3 — V3 feature plan**: a gap analysis of every point in `Viktor_Platform_Optimizaciones_2026.md` against the live code, plus a phased plan for what's missing.

> Scope decision (2026-06-02): **Parts 1 & 2 are implemented this session** (repo commit on `experimental` + live box hot-patch). **Part 3 / V3 features are planned only** — captured in this file, built in follow-up sessions. PP1/PP2 (Pipeline) and AS1/AS2 (Suggestions⇄Approvals unification) are explicitly **deferred** out of V3 at Martin's request.

---

## Part 1 — API hardening + crash-proof rendering

### Root cause of the June crash

`apiLoadPosts()` returns whatever the API sends straight into React. The `Post` type
([app-v2/src/types/post.ts](app-v2/src/types/post.ts)) *promises* `status`, `approval`, `date`,
`hashtags`, `copy`, but nothing enforced that. When the agent created/patched a post missing one
of those, these unguarded accesses threw and blanked the whole page:

- `calendar.tsx:78` — `p.date.localeCompare(...)` (sort) → throws on missing `date`
- `calendar.tsx:457` — `post.status.replace('_',' ')` → throws on missing `status`
- `calendar.tsx:460` — `post.approval.version` → throws on missing `approval`
- `approvals.tsx:55 / 249 / 261` — same three fields, same failure
- `performance.tsx` — `metrics[sortBy]` math assumes complete metric rows

(The Assets-tab unknown-`source` crash and the approvals-log unknown-`action` crash were already
fixed in V2 via `sourceMeta()` fallback and `FALLBACK_ICON` — we follow that same defensive
pattern here.)

### Design — three layers of defense

**Layer A — API write validation (reject, HTTP 422).**
New `deploy-staging/api/src/schemas/post.ts` (+ `suggestion.ts`, `approval.ts`, `branding.ts`)
using the already-installed `zod@3.23.8`.

- `POST /clients/:slug/posts` (create): validate full body — `status` ∈ the 8-value enum,
  `date` ISO-parseable (`z.string().datetime()` or a date guard), `channel` ∈ enum,
  `hashtags` `string[]`, `cta`/`copy`/`title` strings, `image` an optional string.
  Unknown top-level keys rejected (`.strict()`).
- `PATCH /clients/:slug/posts/:id`: partial schema (`.partial()`), but every **present** field
  must be the right type. Unknown keys rejected.
- `PATCH /suggestions/:id`: `status` ∈ `open|accepted|dismissed`, `priority` number, `reason` string.
- `POST /approvals`: already checks `decision` ∈ set — port to zod + keep the 4-value enum.
- `PATCH /branding`: shape-check colors/typography/logos/toneKeywords.

On failure → `problem(c, { title:'Unprocessable Entity', status:422, detail:<which field + why>,
errors:[...] })` using the existing [problem.ts](deploy-staging/api/src/problem.ts) helper.
The `detail` is written to be **agent-readable** ("field `date` must be an ISO date like
2026-06-15; got `next week`") so the agent can self-correct (see Part 2).

**Layer B — API read coalescing.**
`buildPost()` in [viktorOwned.ts](deploy-staging/api/src/routes/viktorOwned.ts) returns a
**guaranteed-complete** `Post` shape. A `coalescePost()` helper fills safe defaults
(`status:'idea'`, default `approval{status,version:1,approvedBy:null,approvedAt:null,blockerReason:null}`,
`publishing{}`, `hashtags:[]`, `date` → fallback to created-ts or empty-guarded). This repairs
**already-stored** junk rows on the way out — not just future writes — so legacy bad data can't
crash the dashboard either.

**Layer C — SPA normalization + defensive access.**
A single `normalizePost(raw)` choke point in [api-client.ts](app-v2/src/lib/api-client.ts)
(`apiLoadPosts` maps through it), mirrored for file mode in `client-data.ts`. Plus belt-and-suspenders
guards on the handful of raw accesses in `calendar.tsx` / `approvals.tsx` (`post.status ?? 'idea'`,
`post.approval?.version ?? 1`, date guards in the sort comparators).

### Acceptance

- `POST`/`PATCH` a post with a bad `date`/`status`/unknown field → `422` + readable `detail`, nothing stored.
- A pre-existing partial post row → renders (coalesced), no white screen.
- Typecheck clean (`npm run typecheck` in api; `pnpm typecheck`/build in app-v2).
- Deployed: repo commit on `experimental` + box `docker compose up -d --build api` + SPA rebuild.

---

## Part 2 — Agent publishing knowledge

The agent's brain is `config.yaml agent.system_prompt` on the box at
`/opt/agents/staging-demo/` (NOT in the repo; see [staging-chat-pipeline-fixes] memory). Telegram
and the in-app chat both inherit it (V2 `api_server` fallback patch).

### Changes

1. **Rewrite the publish section of the box `config.yaml` system prompt** to match the hardened contract:
   - Exact required post fields + types and the **8 valid `status` values** and **4 valid approval `decision` values**.
   - "`image` must be the **URL returned by the asset step**, never a bare path or a guess."
   - The publish flow: generate image → copy into `/opt/marketing-planner/client/assets/` → append manifest row → `PATCH /posts/:id {image:<url>}` → set approval via `POST /approvals` (so the audit log fires).
   - **Error-recovery rule:** "If a write returns **422**, read the `detail`, fix that one field, and retry. NEVER invent or rename fields to make an error go away."
   - Always write via the API (never edit disk JSON directly) so the dashboard + audit stay in sync.
   - Back up the existing config first (`config.yaml.bak.pre-v3-publish-*`), restart `hermes-marketing-staging`.

2. **Mirror the contract into the repo** as the single source of truth:
   - New `deploy/viktor-skills/publishing.md` — the canonical publish runbook for the agent.
   - Refresh `deploy-staging/api/README.md` with the post schema + status/decision enums + 422 behavior.
   - Tighten the `/v1/docs` (zod-openapi) descriptions so the field rules show in the interactive docs.

3. **Re-verify end-to-end on the box:** create → patch image → approve a staging post; confirm it
   renders in the calendar and the audit row exists.

---

## Part 3 — V3 gap analysis (Viktor_Platform_Optimizaciones_2026.md)

Audited against live code on `experimental` (2026-06-02). Legend: ✅ done · 🟡 partial · ❌ missing · ⏸ deferred.

| # | Point | Status | Evidence / what's missing |
|---|-------|--------|---------------------------|
| **G1** | Sync bidireccional Víktor↔Plataforma | 🟡 | In-app chat *is* the Hermes agent (shared brain + history via `chat_messages`/`conversation_history`). **Missing:** push-notify Víktor on platform change; visible "enviado a Víktor · hace 2 min" sync log; true embedded Telegram widget (current is a custom SSE proxy, not Telegram). |
| **G2** | Interfaz bilingüe ES/EN | ✅ | `LanguageSwitcher` (layout.tsx:267) + `lib/i18n` + `i18n-dict`, persisted. Exceeds spec (EN/DE/ES). |
| **G3** | Diseño visual más rico (íconos/color) | 🟡 | Nav icons + pillar colors + some accent borders exist. **Missing:** systematic per-section accent palette (Business=blue, Audience=green, Voice=violet…), consistent hover/micro-anim across all cards. |
| **G4** | Edición inline global | 🟡 | Strong on Context (`Editable*`), Goals targets, Calendar copy; global edit-mode + edit-store + EditBar. **Missing:** Strategy page is fully read-only; per-block ✏️-on-hover not universal. |
| **G5** | Brand Identity Kit + Referencias en menú | 🟡 | Branding lives inside Context; Inspiration board inside Assets. **Missing:** dedicated sidebar items "Brand Identity Kit" + "Referencias". |
| **CC1** | Canales de publicación (clickable) | ❌ | No "canales activos" block with selectable LinkedIn/IG/FB/X icons + clickable profile links in Company Context. (`plan.platforms` exists read-only in Strategy, not as channel shortcuts.) |
| **CC2** | "What success looks like" → Objetivos | 🟡 | Goals has KPIs + editable targets + monthly chart + weekly focus. **Missing:** "Objetivos del trimestre" with **due dates** + simple **progress bars** + explicit objetivo→KPI links. |
| **GV1** | Indicador HOY en Monthly Reach | ❌ | `goals.tsx` BarChart has no "TODAY" reference line; header has no "Junio 2026 · Semana 1". |
| **GV2** | Filtros de fecha dinámicos | ❌ | No date-range / week selector / period comparison in Goals or Performance. |
| **GV3** | Acceso directo a canales desde KPIs | ❌ | `KpiCard` has no "→ Ver LinkedIn" deep links. |
| **GV4** | Weekly Focus marketing-first | 🟡 | `goals.weekly` shows week + kpi badge + focus text. **Missing:** explicit ¿canal?/¿qué decimos?/¿a quién? structure; numeric KPI target per week; inline edit; auto-send to Víktor at week start. |
| **ST1** | Edición + revisión con Víktor (Strategy) | ❌ | `strategy.tsx` is 100% read-only — no ✏️ inline edit, no "💬 Revisar con Víktor", no last-modified date per block. |
| **ST2** | Colores por tipo estratégico | 🟡 | Pillars/positioning have some color. **Missing:** systematic color+icon coding per strategic content type. (BAJA) |
| **AS1** | Unificar Sugerencias+Approvals → "Pendientes" | ⏸ | **Deferred** (Martin). Currently separate pages. |
| **AS2** | Chat embebido desde Sugerencias | ⏸ | **Deferred** (Martin). `mp:open-chat` prefill mechanism exists (calendar uses it); Suggestions has copy/paste + staging accept/dismiss but no "Discutir con Víktor" button. |
| **CAL1** | Vista trimestral del calendario | ❌ | `calendar.tsx` is month-tabs + single-post carousel. No 3-month overview, no month grid, no week/month/quarter toggle. |
| **CAL2** | Edición directa copy + imágenes | 🟡 | Copy/title/hashtags/CTA editable inline (`CopyPane`); status badge shown; "change picture" goes through Víktor chat. **Missing:** direct user image **upload** on a post (without Víktor). |
| **PP1** | Botones visibles en Pipeline | ⏸ | **Deferred** — Pipeline page intentionally removed (commit 12a3e76). |
| **PP2** | Espacio para ideas del usuario | ⏸ | **Deferred** — depends on Pipeline. |
| **VL1** | Estructura de carpetas Visual Library | 🟡 | Assets has manifest grid + filters + Inspiration board (drag-drop). **Missing:** the 4-folder taxonomy (Brand Kit / Referencias / Diseños de Víktor / Mis uploads) + tags + search. |
| **PF1** | Dashboard KPIs personalizable | ❌ | Performance is a fixed layout (top performers, weekly reach, per-post table w/ sort tabs). No KPI picker, no combine-two-KPIs, no date filter, no GA. |
| **LE1** | Filtros fecha/confianza Learnings | 🟡 | Confidence filter exists (`learnings.tsx` tabs). **Missing:** period selector; "marcar como aplicado". (BAJA) |
| **LE2** | Ciclo hipótesis→resultado→aprendizaje | 🟡 | Learnings show whatHappened / lesson / behaviorChange. **Missing:** explicit Hipótesis→Qué pasó→Aprendizaje→Cambio framing; "nueva hipótesis generada" field; Víktor auto-proposing learnings from Performance. |

### New capability — CAR1 · Carousel posts (agent-generated, multi-slide) `Prioridad: ALTA`

Today a post carries a single `image`. Carousels (Instagram/LinkedIn multi-slide posts,
2–10 images swiped left/right) are the most-requested missing content type. This is a
cross-cutting capability: agent + API + dashboard preview. Designed here; built in Phase C.

**Data model (backward-compatible — does not break the Part 1 hardened contract).**
A post becomes a carousel when it has a `slides` array; `image` stays as the **cover**
(= `slides[0].image`) so every existing thumbnail / calendar / performance / mockup path
that reads `post.image` keeps working untouched.

```ts
interface Slide { image: string; caption?: string }   // image = full asset URL; caption = optional per-slide note / on-image text brief
interface Post {
  // …existing fields…
  image?: string        // cover = slides[0].image (kept for thumbnails)
  slides?: Slide[]      // present with length > 1 ⇒ carousel
  format: string        // set to "carousel" when slides are used
}
```
Carousel detection in the UI: `post.slides && post.slides.length > 1`.

**API impact.** Extend the hardened post schema (`schemas/post.ts`): add
`slides: z.array(z.object({ image: z.string(), caption: z.string().optional() }).strict()).max(10).optional()`
(IG's 10-slide cap). `coalescePost()` / `normalizePost()`: if `slides` present, ensure it's an
array of `{image,caption}` and default the cover `image` to `slides[0].image` when missing; if
absent, leave single-image behavior. **No new endpoint needed** — slides are set via the normal
`PATCH /posts/:id`. (Without this schema change a carousel PATCH would 422 under Part 1 — that's
the one required hook.)

**Agent impact (config.yaml system_prompt + publishing.md).** New "Carousel-Workflow":
1. **Ask first** (never guess): how many slides (2–10)? channel (IG / LinkedIn)? aspect ratio
   (1:1 square or 4:5 portrait)? one consistent visual style? topic/goal of the carousel?
2. **Propose a slide-by-slide outline** before generating: slide 1 = hook, slides 2…n‑1 =
   content beats, slide n = CTA. Get confirmation.
3. **Warn on cost/time** — N images × the image-gen call (premium model ≈ 3 min each; see
   [[staging-chat-pipeline-fixes]] for the fast-model option). Generate slide 1 first as a
   preview if the user wants a check before committing to all N.
4. **Generate → assets → PATCH**: for each slide, image-gen → copy into
   `/opt/marketing-planner/client/assets/` → append a manifest entry (same flow as a single
   image) → build the `slides[]` array in order → `PATCH /posts/:id` with
   `{ format:"carousel", slides:[…], image:<slides[0].url> }` → `GET` to confirm.
5. **Telegram:** send the slides as an album so the user sees the set in chat too.
   The whole post shares one caption (`copy`); per-slide `caption` is metadata/design-brief,
   not a second body.

**Dashboard preview ("previewed on the side").** The calendar right-pane is already the side
preview (Picture / Preview toggle + lightbox). Extend it for carousels (read-only in V3):
- `PicturePane` → a slide viewer: cover + left/right arrows + dots + an "i / N" counter, with a
  small thumbnail filmstrip of all slides below. Single-image posts render exactly as today.
- `ChannelMockup` (instagram/linkedin) → render carousel dots / the platform's multi-image
  affordance so the social preview matches reality.
- Lightbox → swipe through all slides at full size.
- Assets tab already lists each slide image individually (they're normal manifest entries),
  grouped by `usedInPosts`.

**Open (sensible defaults chosen; revisit when building):** (a) per-slide on-image text is
produced by image-gen from the slide brief, not overlaid by the dashboard; (b) V3 is
**preview-only** — reordering/deleting slides from the dashboard is a later increment; (c) default
aspect ratio 4:5 (best IG/LinkedIn feed real-estate) unless the user says square.

### V3 phasing (build order for follow-up sessions)

**Phase C — ALTA (highest value, build first):**
- **GV1** — "TODAY" reference line + "Mes · Semana N" header on Monthly Reach *(small, self-contained)*.
- **CC1** — "Canales activos" block in Company Context with selectable network icons + clickable profile links; feed selection into Weekly Focus/Calendar context.
- **CAL2** — direct user image **upload** on a post (reuse the Inspiration/branding upload endpoint + `PATCH /posts/:id {image}`).
- **CAR1** — carousel posts (agent generates 2–10 slides; `slides[]` on the post; swipeable side preview in the calendar). One required API hook (add `slides` to the post schema) + agent Carousel-Workflow + preview UI. See the dedicated section above.
- **CAL1** — calendar week/month/quarter toggle + quarterly overview grid.
- **GV4** — Weekly Focus restructured to channel/message/audience + numeric KPI, editable inline, auto-pushed to Víktor weekly.
- **ST1** — make Strategy blocks inline-editable + "Revisar con Víktor" + last-modified.
- **G1** — push-notify Víktor on platform change + visible sync log ("enviado a Víktor · hace N min").

**Phase D — MEDIA (plan, build later):** G3 (accent system), G5 (Brand Kit + Referencias menu items), CC2 (objetivos w/ due dates + progress bars), GV2 (date filters), GV3 (channel deep-links from KPIs), VL1 (Visual Library folders + tags), PF1 (customizable KPI dashboard + GA), LE2 (hypothesis cycle + Víktor-proposed learnings).

**Phase E — BAJA / deferred:** ST2 (strategy color coding), LE1 (learnings date filter + "applied"); **deferred entirely:** PP1, PP2, AS1, AS2.

### Cross-cutting note

Many ALTA items (G4 completion, GV4, ST1, CC1) ride on the same primitives already proven in V2:
the `edit-store` + `Editable*` components for inline edit, `mp:open-chat` for context-loaded chat,
and the hardened write API from Part 1. V3 is mostly *applying these patterns to the pages that
don't have them yet* rather than new infrastructure — the big exceptions are CAL1 (new calendar
views), PF1 (KPI builder + GA), and G1 (Telegram push).
