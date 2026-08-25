---
project: GF-116 Viktor never reads uploaded Information Sources
updated: 2026-08-25
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
focus_tasks: [TASK-000, TASK-001, TASK-002, TASK-003, TASK-004, TASK-005]
items:
  - gf-116: "Bug: Viktor never reads uploaded Information Sources | priority: high"
---

# Plan

## Simple Words

A user drops a document into Assets > Information Sources so the AI will use it.
The upload works and the record stores fine (GF-110 fixed the 5000-character cap
that used to break it). Viktor then never reads it, because nobody ever told him
the endpoint exists.

His endpoint list lives in one block of the agent config. That block names brief,
plan, posts, approvals, suggestions and assets/manifest — and stops. Nothing under
`agent-skills/` mentions information sources either. Asked to quote from an
uploaded file, Viktor searched exactly the list he had been given, found nothing,
and said so. The bug is in what he was told, not in how he behaved.

This plan puts the endpoint in both agent configs, makes loading approved sources
part of the pre-flight for copywriting and post-drafting (next to the existing
"read the brief first" rule), and corrects the API docs, which currently describe
information-sources as a place an agent POSTs to and never as a place it READs
what a human uploaded.

Not included: any change to client slugs. See TASK-000 — the slug hypothesis in
the original Notion write-up was withdrawn by its own correction section, and the
repo evidence supports the correction.

## Evidence

### The endpoint exists and returns the document text

`deploy-staging/api/src/routes/planningConfig.ts:177`

```ts
planningConfig.get('/clients/:slug/information-sources', requireScope(), async (c) => {
  const slug = c.req.param('slug')
  const approvedOnly = c.req.query('approved') === 'true'
  const items = await withPb((pb) =>
    pb.collection('information_sources').getFullList({
      filter: approvedOnly ? `slug="${slug}" && approved=true` : `slug="${slug}"`,
```

The uploaded file's text is extracted into `summary` on the record
(`planningConfig.ts:290`), so this one GET returns the document body.

### The agent was never told about it

Both configs carry an identical, incomplete endpoint list:

| File | Lines | Contents |
|---|---|---|
| `deploy-prod/gf-innov-agent/config.yaml` | 185-193 | brief, plan, posts, posts/p001, approvals, suggestions, assets/manifest |
| `deploy-staging/staging-demo-agent/config.yaml` | 192-200 | identical |

`grep -rn "information.sources" agent-skills/` returns zero hits across all 38
files under `agent-skills/`.

Viktor also mapped "Assets tab" onto `assets/manifest` — a different store
(images/logos on disk) that never holds information sources.

### The API docs describe the endpoint as write-only

- `deploy-staging/api/src/server.ts:70` — "**Source material for post
  generation:** POST factual grounding to …". Only POST.
- `deploy-staging/api/src/routes/integration.ts:118` — "POST here to feed the
  planner factual grounding."
- `deploy-staging/api/src/routes/integration.ts:129-133` — `instructions` tells
  an ingesting agent how to add a source, never how to read one.
- `deploy-staging/api/src/openapi-docs.ts:468` — the upload route still documents
  "Created un-approved; approve it afterwards", which GF-110 made false
  (`planningConfig.ts:296-302` now sets `approved: true` on arrival).

An agent that ingested the one-click Integration payload would configure itself
to write sources and never to read them.

## Investigation

### TASK-000: Resolve Fault 2 (the slug question) before touching anything slug-shaped
status: done
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-116-information-sources
area: investigation
estimate: S
depends_on: []
tags: [gf-116, slugs, staging]
acceptance:
- A written finding on whether the staging agent's `CLIENT_SLUG` is wrong, backed by code references.
- No slug mapping is changed unless the finding demonstrates a defect.

**Finding: the slug mapping is not defective. Do not change it.**

1. **A wrong slug would have been a 403, not an empty list.**
   `deploy-staging/api/src/auth.ts:180-183` — a single-client token asking for a
   different slug is refused:

   ```ts
   if (principal.slug !== requested) {
     return forbidden(`Token scoped to "${principal.slug}", refused access to "${requested}"`)
   }
   ```

   Viktor got HTTP 200 with `items: []`. So the token is scoped to `staging-demo`,
   the query really ran against `slug="staging-demo"`, and the record is genuinely
   not under that slug.

2. **`staging-demo` is a real staging workspace.** `AGENTS.md:292-294` lists
   `/staging-demo/context`, `/staging-demo/integration` and `/staging-demo/calendar`
   as the staging browser smoke targets, and `AGENTS.md:278` names `staging-demo`
   as the workspace to use for reversible write tests.

3. **Its absence from `clients/index.json` proves nothing**, exactly as the Notion
   correction says. `deploy-staging/api/src/routes/clients.ts:53-66` merges the
   disk index with the PocketBase `clients` collection:

   ```ts
   for (const record of diskRecords) bySlug.set(record.slug, record)
   for (const record of pbRecords) bySlug.set(record.slug, { ... })
   ```

   `staging-demo` is a PB-created client; `gf-internal` and `fitvibe-demo` are the
   disk-seeded ones (`.github/workflows/deploy-staging.yml:100-115` rsyncs only
   `clients/index.json` and `clients/gf-internal/`). Staging hosts all three.

4. **The decisive structural fact.** `deploy-staging/api/src/env.ts:158`:

   ```ts
   export function resolveHermesAgent(slug: string): HermesAgent {
     const override = env.hermesAgents[slug]
     if (override) return { baseUrl: override.baseUrl, apiKey: override.apiKey || env.hermesApiKey }
     return { baseUrl: env.hermesBaseUrl, apiKey: env.hermesApiKey }
   }
   ```

   With no `HERMES_AGENTS` override configured in
   `deploy-staging/docker-compose.yml`, **every** staging workspace's chat is
   relayed to the same `hermes-marketing-staging` container, and that container's
   prompt hardcodes `CLIENT_SLUG = staging-demo`
   (`deploy-staging/staging-demo-agent/config.yaml:184`). Staging Viktor therefore
   reads `staging-demo` regardless of which workspace the dashboard is showing.

**Conclusion.** Nothing is misconfigured. The fixture was uploaded while a
workspace other than `staging-demo` was open — most plausibly `gf-internal`, the
GF workspace — and the dashboard wrote it under that slug
(`planningConfig.ts:249`, `const slug = c.req.param('slug')`). Martin was asked
which workspace was open and did not answer, so this remains the stated
assumption rather than a confirmed fact. It does not change any task below:
the acceptance test simply has to upload into `staging-demo`.

**Real defect found on the side, in scope for TASK-005:** a GET for a slug no
client owns returns `200 {"items":[]}`, identical to a real empty workspace. That
is precisely why this read as "no data" instead of "wrong workspace".

**Design gap logged, NOT fixed here:** one staging agent serving three staging
workspaces means chatting from `gf-internal` on staging talks to an agent
configured for `staging-demo`. That is the single-staging-agent design, it
predates GF-116, and changing it is a separate item.

## Agent Implementation

### TASK-001: Put the endpoint in both agent configs
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-116-information-sources
area: agent
estimate: S
depends_on: [TASK-000]
tags: [gf-116, config, prod, staging]
acceptance:
- `GET /clients/$CLIENT_SLUG/information-sources?approved=true` appears in the "Important endpoints" block of BOTH `deploy-prod/gf-innov-agent/config.yaml` and `deploy-staging/staging-demo-agent/config.yaml`.
- The description says it is source material a human uploaded for the agent to use — not a place to POST.
- The two blocks stay byte-identical apart from the documented staging/prod substitutions, so the porting rule at `deploy-prod/gf-innov-agent/config.yaml:4-6` still holds.
- Both files still parse as YAML.
notes:
- Insert after the `assets/manifest` line so the read endpoints stay grouped.
- Also disambiguate `assets/manifest` in the same block: Viktor mapped "the Assets tab" onto it. The manifest is images/logos; information sources are documents.

### TASK-002: Make loading approved sources part of drafting pre-flight
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-116-information-sources
area: agent-skills
estimate: S
depends_on: [TASK-000]
tags: [gf-116, skills]
acceptance:
- `agent-skills/core/copywriting/SKILL.md` STEP 0 adds the information-sources read alongside the existing brief/plan reads at line 17-18.
- `agent-skills/core/post-drafting/SKILL.md` "Inputs to read first" adds the same.
- The "READ BEFORE YOU ACT" block in BOTH config.yaml files gains a sources bullet next to the existing copy bullet, so the rule holds even before a skill is loaded.
- Phrasing is as strong as the brief rule it sits next to ("non-negotiable" / "you MUST already know").
- A human-uploaded source is described as authoritative over the model's own knowledge for facts about the client.
notes:
- The config-level rule matters independently: `platform_toolsets.api_server` did not include `skills` until the (uncommitted, unrelated) 2026-08-04 change, and dashboard chat can run on the system prompt alone.
- Keep it one GET, cached per conversation, matching the existing "read it once early, then reuse it" instruction — no per-turn re-fetch.

## API Implementation

### TASK-003: Reword the read side into the API docs
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-116-information-sources
area: api
estimate: S
depends_on: []
tags: [gf-116, docs, openapi]
acceptance:
- `deploy-staging/api/src/server.ts:70` describes both directions: read what a human uploaded, and post your own grounding.
- `deploy-staging/api/src/routes/integration.ts` `agentConnection.endpoints` gains a read entry pointing at `?approved=true`, and `instructions` tells an ingesting agent to read sources before drafting.
- `deploy-staging/api/src/openapi-docs.ts` GET summary/description name the human-upload case; the stale "Created un-approved; approve it afterwards" line on the upload route is corrected to match GF-110's auto-approve.
- `npx tsc --noEmit` passes in `deploy-staging/api`.
notes:
- The Integration payload is what an external agent self-configures from. A read entry there is the difference between a third-party agent that uses uploaded sources and one that does not.

### TASK-004: Decide the unapproved-source question
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-116-information-sources
area: decision
estimate: S
depends_on: []
tags: [gf-116, decision]
acceptance:
- A recorded decision on whether the agent may see unapproved sources.

**Decision: no. The agent reads `?approved=true` only, and that is already correct.**

`approved` is the human's only lever for stopping the AI using a draft, a
superseded document, or a file dropped in the wrong workspace. Handing the agent
unapproved rows removes the lever and gains nothing, because GF-110 already made
uploads auto-approve on arrival (`planningConfig.ts:296-302`) — the friction that
motivated the question is gone. A source sitting unapproved today is one created
through the JSON route with `approved: false`, i.e. deliberately withheld.

No code change. The `?approved=true` in TASK-001 makes the contract explicit
where it was previously implicit.

### TASK-005: Make reachability visible instead of inferable
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-116-information-sources
area: frontend+api
estimate: S
depends_on: [TASK-004]
tags: [gf-116, ui, copy]
acceptance:
- The Assets tab badge tells the user whether the AI can read the source, not just which workflow state it is in. Copy-only change in `app-v2/src/lib/i18n-dict.ts`; all three languages updated.
- `GET /clients/{slug}/information-sources` for a slug no client owns returns a 404 problem+json naming the unknown client, instead of `200 {"items":[]}`.
- A real client with no sources still returns `200 {"items":[]}`.
- `npx tsc -b` and `npx eslint` pass in `app-v2`; `npx tsc --noEmit` passes in `deploy-staging/api`.
notes:
- "Approved" reads as a workflow state. "Viktor is using this" states the fact the user actually came to check, and is what the Assets tab promises.
- Copy-only on the SPA side, so the UI design-approval policy's copy-fix exclusion applies — no screenshot gate.
- **Shipped as a `warning` on the 200, not a 404.** A 404 would turn "this client has no source material yet" into an error for any live slug that has no row in either the CI-seeded `clients/index.json` or the hand-made PB `clients` collection — and nothing in this repo creates such a row. Failing an agent's read closed is a worse outcome than an ambiguous empty list, so the diagnostic is additive and can never deny service.
- Independent review (GLM 5.2) accepted this but corrected one step of the reasoning: a slug *serving* data would return non-empty items and never reach the warning path at all. The risk is therefore narrower than first written — it is the empty-but-legitimate client that a 404 would misreport, not a populated one. The conclusion is unchanged.
- `clientExists` returns `false` only when BOTH the disk index and PocketBase answered. One source failing yields `null` and the caller stays silent, so an outage cannot manufacture a "wrong workspace" message.

## Verification

### TASK-006: Live verification on staging (blocked on redeploy)
status: blocked
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-116-information-sources
area: verification
estimate: S
depends_on: [TASK-001, TASK-002, TASK-003, TASK-005]
tags: [gf-116, staging]
acceptance:
- A document uploaded through the Assets tab **in the `staging-demo` workspace** is returned by the agent's own GET call.
- Asked a question whose answer is only in that document, Viktor answers from it WITHOUT being told the endpoint.
- Viktor loads approved sources as part of drafting, not only when asked about a file directly.
notes:
- Config and skill changes are inert until the Hermes container is redeployed on Hetzner. Merging to `experimental` deploys the API and SPA; it does NOT restart the agent.
- Martin runs this. The exact steps are in the branch summary.
- GF-116 stays open in Notion until this passes, even after the merge.

## Notes and Follow-ups

- **GF-115 criterion 3** (do accents survive an uploaded document) is unblocked
  the moment Viktor can read a source at all. Re-test it with the same fixture.
- **GF-110** is unaffected; its database fix stands on its own.
- **One staging agent for three staging workspaces** (TASK-000, point 4) is a
  real design gap and deserves its own backlog item. Not this branch.
- **Uncommitted foreign edits in the main working tree** touch both config.yaml
  files (a plugin `allow_tool_override` key and `skills` in
  `platform_toolsets.api_server`). They are unrelated to GF-116, are not on this
  branch, and were left alone. They will need committing separately or they will
  be lost.
