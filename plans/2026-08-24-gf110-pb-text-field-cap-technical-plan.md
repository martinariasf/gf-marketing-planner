---
project: GF-110 PocketBase text-field 5000-char cap
updated: 2026-08-24
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
focus_tasks: [TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006]
items:
  - gf-110: "Bug: Viktor cannot read Markdown (.md) files | priority: high"
---

# Plan

## Simple Words

Uploading a Markdown file in the Assets tab fails with "Failed to create record".
It has nothing to do with Markdown. Six database fields were declared with the
wrong option name, so PocketBase ignored the intended size limit and applied its
default of 5000 characters. Any uploaded file, chat message, document, or review
comment longer than about two pages is rejected by the database.

This plan corrects the six field declarations, makes the startup routine actually
apply the correction to the databases that already exist (today it only ever adds
brand-new fields, so a corrected declaration would change nothing), makes the API
report which field failed instead of a blank 500, and makes an uploaded source
usable by Viktor immediately instead of needing a second approve click.

Not included: chasing whether the same cap on `chat_messages.content` is what is
behind GF-96 / GF-56 "response truncated". The observation is recorded below but
is deliberately out of scope for this branch.

## Evidence

Prod API log for the failing upload:

```
[api] unhandled ClientResponseError 400: Failed to create record.
  url: 'http://mp-prod-pb:8090/api/collections/information_sources/records',
  response: { data: { summary: [Object] }, message: 'Failed to create record.', status: 400 }
```

Length probe against staging PocketBase:

```
4999 OK
5000 OK
5001 FAIL {"summary":{"code":"validation_max_text_constraint",
           "message":"Must be no more than 5000 character(s).","params":{"max":5000}}}
```

Live field options read from prod PocketBase (all six confirmed `max=0`, so the
5000 default applies):

| Collection.field | Intended in code | Effective cap |
|---|---|---|
| `chat_messages.content` | 5 MB | 5000 |
| `chat_attachments.text` | 200 KB | 5000 |
| `information_sources.summary` | 1 MB | 5000 |
| `information_sources.prompt` | 1 MB | 5000 |
| `review_comments.body` | 20 KB | 5000 |
| `integration_secrets.postizApiKeyEnc` | 5 KB | 5000 (no practical effect) |

Cause: `deploy-staging/api/src/ensureCollections.ts` declares these as
`{ type: 'text', maxSize: N }`. `maxSize` is a valid option for PocketBase's
`json` / `editor` / `file` types but **not** for `text`, which uses `max`. The
unknown key is dropped silently, `max` stays `0`, and PocketBase falls back to
its 5000-character default.

## Backend Implementation

### TASK-001: Correct the six text-field declarations and make the mistake unrepresentable
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-110-pb-text-field-cap
area: api
estimate: S
depends_on: []
tags: [gf-110, pocketbase, schema]
acceptance:
- The six fields listed in the evidence table are declared with `max`, not `maxSize`.
- `FieldSpec` in `deploy-staging/api/src/ensureCollections.ts` is typed so that a `text` field cannot accept `maxSize` — the old shape fails `npx tsc --noEmit` rather than compiling and silently misbehaving.
- `npx tsc --noEmit` passes in `deploy-staging/api`.
notes:
- Source: GF-110 in Notion.
- Code evidence: `deploy-staging/api/src/ensureCollections.ts` lines 70, 182, 267, 283, 284, 336 carry `type: 'text'` with `maxSize`.
- The type-level guard is the point of this task. Correcting six literals without it just waits for the seventh.
- `json` fields keep `maxSize` — that is the correct option for them. Only the `text` variant is constrained.

### TASK-002: Reconcile field options on collections that already exist
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-110-pb-text-field-cap
area: api
estimate: M
depends_on: [TASK-001]
tags: [gf-110, pocketbase, schema, migration]
acceptance:
- On boot against a database whose `information_sources.summary` has `max: 0`, `ensureCollections` raises it to the declared `max` and logs the change.
- A record with a >5000-character `summary` can be created after boot; before the change it is rejected.
- Reconciliation only ever RAISES a `max` on a `text` field — an existing `max` greater than or equal to the declared one is left untouched, so the pass can never shrink a limit under live data.
- Fields whose options already match produce no write and no log line (the pass stays idempotent across restarts).
- Existing rows are untouched: row count and a sampled record's `summary` are identical before and after.
notes:
- Code evidence: `ensureCollections()` currently computes `missingFields` and patches only those; a field that already exists is never revisited, so TASK-001 alone changes nothing on staging or prod.
- Scope the reconcile narrowly to `max` on `text` fields. A general "make live schema match spec" pass is a much larger blast radius and is not needed here.
- PocketBase field updates must send the full field array with existing field `id`s preserved, or PB treats renamed/idless entries as new columns. Patch the objects returned by `collections.getOne`, do not rebuild them from the spec.
- Changing `max` on a text field is validation-only in PocketBase; it does not rewrite the SQLite column.

### TASK-003: Surface PocketBase validation failures as 4xx with the failing field
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-110-pb-text-field-cap
area: api
estimate: S
depends_on: []
tags: [gf-110, errors, dx]
acceptance:
- A PocketBase 400 during the information-source upload returns HTTP 400 (not 500) with a detail naming the field and reason, e.g. `summary: Must be no more than 5000 character(s).`
- The dashboard toast shows that detail instead of a bare "Failed to create record".
- Non-PocketBase errors keep their current 500 behaviour.
- Secrets and internal URLs are not echoed into the response body.
notes:
- Code evidence: `deploy-staging/api/src/server.ts:150` `app.onError` puts `err.message` into `detail`; PocketBase's `ClientResponseError.response.data` — which holds the per-field reason — is discarded. That is exactly why the reported symptom was an unactionable message.
- This task has standalone value: it is the difference between the next schema mismatch taking twenty minutes or taking an afternoon.
- Map PocketBase `status` through rather than assuming 400, so a PB 403/404 does not become a 400.

### TASK-004: Auto-approve information sources created by file upload
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-110-pb-text-field-cap
area: api
estimate: XS
depends_on: []
tags: [gf-110, agent-context]
acceptance:
- `POST /clients/:slug/information-sources/upload` creates the record with `approved: true` and `approvedAt` set to the creation timestamp.
- The uploaded source is returned by `GET /clients/:slug/information-sources?approved=true` — the agent-facing read — with no further clicks.
- The JSON create route (`POST /information-sources`) keeps honouring the caller's `approved` flag; only the upload path changes.
- The audit entry for the upload records that it was auto-approved.
notes:
- Decision by Martin, 2026-08-24: dropping a file in the Assets tab is already a deliberate act, so a second approve click is pure friction.
- Code evidence: `deploy-staging/api/src/routes/planningConfig.ts` upload handler sets `approved: false, approvedAt: ''`; the agent-facing list filters `approved=true`, so today every upload is invisible to Viktor until someone clicks approve.
- This is a behaviour change on an existing endpoint — call it out explicitly in the changelog entry.

## Verification

### TASK-005: Unit tests for the reconcile pass and the error mapping
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-110-pb-text-field-cap
area: api
estimate: M
depends_on: [TASK-002, TASK-003]
tags: [gf-110, tests]
acceptance:
- A test asserts the reconcile pass raises `max: 0` to the declared max for a text field, using a faked collections client (no live PocketBase).
- A test asserts the pass leaves an already-correct field alone (no update call issued).
- A test asserts the pass never lowers an existing larger `max`.
- A test asserts a PocketBase `ClientResponseError` shaped like the real one maps to a 4xx problem whose detail names the field.
- `npm test` passes in `deploy-staging/api`.
notes:
- Code evidence: the API uses Node's built-in runner via tsx (`"test": "tsx --test ... src/**/*.test.ts"`), and `assetsManifest.ts` shows the house pattern — keep the reconcile logic a pure exported function with the PB client injected so it unit-tests without a database.
- Extracting that pure function is part of TASK-002's design, not extra work here.

### TASK-006: Verify on staging with a real oversized Markdown file
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-110-pb-text-field-cap
area: verification
estimate: S
depends_on: [TASK-001, TASK-002, TASK-003, TASK-004]
tags: [gf-110, staging]
acceptance:
- After the staging deploy, `mp-staging-api` logs show the reconcile pass raising the six fields, and a re-read of the live schema shows the new `max` values.
- A Markdown file well over 5000 characters uploaded through the staging Assets tab is accepted, and its full text round-trips unchanged through `GET /information-sources` (byte-for-byte, including accents — see GF-89).
- The uploaded source appears with `approved: true` and is returned by the `?approved=true` read.
- Viktor on staging can quote a sentence from the uploaded file that appears only past the 5000-character mark, proving the whole text reached him.
- A second restart of the API produces no further schema writes (idempotence confirmed on live data).
- Test records created during verification are deleted afterwards.
notes:
- Reproduction baseline already captured on 2026-08-24: prod logs show four 500s on `/information-sources/upload`, and a staging length probe fails at 5001 characters.
- The last acceptance line is the one that actually closes GF-110 as Martin reported it. Schema numbers changing is necessary but not sufficient.

## Notes and Follow-ups

- `chat_messages.content` capped at 5000 characters is a plausible cause of
  GF-96 / GF-56 ("response truncated"): a long assistant reply would fail to
  persist. Martin scoped that investigation OUT of this branch on 2026-08-24.
  Raising the cap here may resolve it as a side effect; confirm separately
  before closing those items rather than assuming.
- `chat_attachments.text` capped at 5000 characters means GF-68 document uploads
  break on anything longer than roughly two pages. Same fix, same branch, but it
  is worth a targeted re-test of GF-68 after this ships.
- `integration_secrets.postizApiKeyEnc` is corrected for consistency only; an
  encrypted Postiz key is far below 5000 characters, so no behaviour changes.
- Production is affected identically. This branch ships to staging first; the
  prod promotion is a separate, explicit step.
