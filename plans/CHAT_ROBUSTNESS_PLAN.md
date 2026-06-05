# Chat Robustness Layer — Implementation Plan

**Scope:** Make the "Ask Viktor" chat panel on `staging.marketing.gfinnov.com`
bulletproof in ordering and live-updating across tabs/devices/Telegram, by
replacing the fragile id-encoded ordering with a real timestamp and switching
the panel from *reload-on-settle* to a *PocketBase realtime subscription*.

**Status:** Planned. Prereqs (PB durability) are ✅ done.
**Owner:** Martin / Claude
**Last updated:** 2026-06-04

---

## 1. Why (the problem)

The chat works today, but on two fragile foundations:

1. **Ordering is held together by a trick.** `chat_messages` has **no timestamp
   column** (fields: `slug, thread, role, content, toolEvent`). To keep the
   transcript in order, the proxy mints a time-sortable id (`mkMsgId()` in
   `routes/chat.ts`) and the history endpoint does `sort:'id'`. This *works*,
   but any message written with a non-time-sortable id (a different writer, a
   future refactor, a Telegram-side insert) scrambles the transcript — this is
   the exact bug class behind the earlier "messages deleted / out of order".

2. **The panel only updates during the live SSE stream.** If the reply finishes
   after the browser dropped the connection, or a second tab / Telegram posts to
   the same thread, the other view doesn't update until a manual reload. Today's
   recovery is a 4s polling loop (`pollForReply` in `chat-sheet.tsx`).

**Goal:** correct-by-construction ordering + instant, reload-free updates across
tabs, devices, and the Telegram channel sharing the same thread.

---

## 2. Current architecture (for reference)

```
Browser (chat-sheet.tsx)
  │  send: POST /api/v1/clients/:slug/chat/stream   (SSE)
  │  history: GET /api/v1/clients/:slug/chat/messages?thread=…
  ▼
mp-staging-api (Hono, routes/chat.ts)
  │  - persists user msg (awaited) + assistant msg to chat_messages (mkMsgId)
  │  - proxies the run to the Hermes gateway, streams tokens back
  ▼
PocketBase (mp-staging-pb)  ← collections incl. chat_messages
```

- **PB client in the SPA**: `app-v2/src/lib/pocketbase.ts` — singleton,
  **unauthenticated**, `autoCancellation(false)`, base = `VITE_PB_URL`.
- **PB durability**: ✅ fixed — runs with `--dir=/pb/pb_data` on the host mount
  (`pb-run.sh`); survives restarts.
- **chat_messages PB rules**: none (API-token only) → a browser cannot read it
  yet, so realtime needs a read rule (see §5).

---

## 3. What changes — three parts

### Part A — Real `created` timestamp (foundational ordering)

- **`deploy-staging/api/src/ensureCollections.ts`** — add an autodate field to
  the `chat_messages` definition:
  ```ts
  { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
  ```
  Add an index for fast ordered reads:
  ```
  CREATE INDEX `idx_chat_thread_created` ON `chat_messages` (`slug`,`thread`,`created`)
  ```
- **`deploy-staging/api/src/routes/chat.ts`**
  - History endpoint: change `sort:'id'` → `sort:'created'` (tie-break `,id`).
  - Keep `mkMsgId()` for now (id stays unique + roughly sortable) — but ordering
    no longer *depends* on it. (Optional later: drop `mkMsgId`, let PB mint ids.)
- **Backfill** existing rows so old transcripts keep their order (see §6).

### Part B — Scoped PB read rule on `chat_messages` (security boundary)

The SPA PB client is unauthenticated, so realtime needs a **List/View rule**.
Options (pick one — see §5 for the trade-off; **B2 recommended**):

- **B1 (open read):** ListRule/ViewRule = `""` (public read). Simplest; any
  browser could read any client's chat. Acceptable for the single-tenant staging
  demo, not for multi-client.
- **B2 (filter-scoped, recommended):** ListRule/ViewRule =
  `@request.query.slug != "" && slug = @request.query.slug` so a subscriber only
  receives its own client's rows, and only when it explicitly scopes the query.
  Still public-ish (no auth) but prevents cross-client bleed and accidental
  full-table reads. **Writes stay API-only** (CreateRule/UpdateRule/DeleteRule =
  `null`) — the browser never writes chat_messages directly.

Apply via `ensureCollections.ts` (set `listRule`/`viewRule` on the collection)
so it's declarative and survives PB recreation.

### Part C — Realtime subscription in the chat panel

- **`app-v2/src/lib/pocketbase.ts`** — add a helper:
  ```ts
  export function subscribeChat(
    slug: string, thread: string,
    onCreate: (m: ChatMessageRecord) => void,
  ): Promise<() => void>  // returns an unsubscribe fn
  ```
  Uses `pb.collection('chat_messages').subscribe('*', cb, { filter:
  `slug="${slug}" && thread="${thread}"` })`. Guard with `isPocketBaseEnabled`.
- **`app-v2/src/components/chat-sheet.tsx`**
  - On panel open / thread change: open the subscription; on close/unmount:
    unsubscribe (clean up in the effect return).
  - On a `create` event for the current thread, **append** the message if its id
    isn't already present (dedupe against optimistic + streamed messages by id).
  - This **replaces `pollForReply`** as the primary recovery path: a reply that
    lands after a disconnect now arrives via the subscription instantly. Keep a
    minimal fallback (single late fetch) only if `isPocketBaseEnabled` is false.
  - Ordering of the in-memory list keys off `created` (with id tie-break).

**Prereq for Part C:** the SPA must be built with `VITE_PB_URL` pointing at a
**publicly reachable** PocketBase, and Caddy must proxy PB's realtime endpoint
(`/api/realtime`, SSE). Verify before building (see §7, step 0).

---

## 4. Files touched

| File | Change |
|---|---|
| `deploy-staging/api/src/ensureCollections.ts` | add `created` autodate + index + `listRule`/`viewRule` on `chat_messages` |
| `deploy-staging/api/src/routes/chat.ts` | history `sort:'created'`; (no change to write path) |
| `app-v2/src/lib/pocketbase.ts` | `subscribeChat()` helper + `ChatMessageRecord` type |
| `app-v2/src/components/chat-sheet.tsx` | subscribe on open, dedupe-append on event, retire `pollForReply` |
| *(migration script, one-off)* | backfill `created` for existing rows (§6) |
| *(Caddy, if needed)* | ensure `/api/realtime` + PB base reachable from browser |

---

## 5. Security note (read rule)

`chat_messages` can contain client business content. Since the SPA PB client is
unauthenticated, a realtime read rule is inherently "public-ish". **Recommend
B2** (filter-scoped) so:
- a browser only ever receives rows for the `slug` it asks for,
- writes remain **API-token-only** (no browser writes),
- the blast radius is "someone who guesses a slug can read that demo client's
  chat" — acceptable for staging-demo, revisit before any real multi-tenant use.

If stronger isolation is later required: give the dashboard a short-lived PB auth
token (per-client) and switch the rule to `@request.auth.id != "" && slug = …`.

---

## 6. Migration / backfill

1. Add the `created` field (autodate). New rows get it automatically.
2. **Backfill existing rows** so old transcripts stay ordered: set `created`
   from the `mkMsgId` time prefix (first 9 base36 chars → ms epoch), or simply
   from row insertion order. One-off script via
   `docker exec -i mp-staging-pb sqlite3 /pb/pb_data/data.db` (PB now durable).
3. Verify: `getList(sort:'created')` returns the known-good order for the active
   `dash-staging-demo` thread.

---

## 7. Rollout & testing

0. **Prereq check:** confirm `VITE_PB_URL` is set in the staging build and PB
   realtime (`/api/realtime`) is reachable from the browser (curl the SSE
   endpoint through Caddy). If not, wire Caddy first — this gates Part C.
1. Ship **Part A + B** (API + collection) first — `docker compose up -d --build
   api` restarts `ensureCollections`. Verify ordering by `created`, backfill,
   confirm history endpoint unchanged externally.
2. Ship **Part C** (SPA) via the CI workflow (`deploy-staging.yml`, which sets
   `VITE_API_BASE` **and** `VITE_PB_URL`). Never hand-build without those.
3. **Manual tests:**
   - Send a message → appears once, in order (no scramble).
   - Open the dashboard in **two tabs** → a message sent in one appears live in
     the other with no reload.
   - Post in the **Telegram** thread (same `slug`/thread) → shows up live in the
     dashboard panel.
   - Mid-reply, **kill the browser connection** → the finished reply appears via
     subscription with no reload.
   - No duplicate bubbles (optimistic + streamed + realtime dedupe by id).

---

## 8. Risks & rollback

- **Realtime not reachable** (Caddy/PB) → Part C silently no-ops; chat still
  works via SSE + `sort:'created'`. Low risk; gated by step 0.
- **Duplicate messages** if dedupe is wrong → mitigated by id-keyed dedupe set.
- **Read-rule too open** → see §5; B2 limits exposure; reversible via
  `ensureCollections.ts`.
- **Rollback:** revert `sort:'created'`→`'id'` and remove the subscription; the
  `created` column is additive and harmless. PB rule revert = set back to `null`.

---

## 9. Out of scope (companion item)

- **Image quality toggle** (Fast Nano-Banana-2 ~10s default vs High gpt-5.4
  ~3min): a separate chat-UI feature that also touches `chat-sheet.tsx` +
  `chat.ts` (pass a `fidelity` flag through the run). Martin chose a **UI toggle
  in the chat** (deterministic, default = Fast). Can be built alongside Part C
  since both edit the same component, but tracked separately from the robustness
  layer.
