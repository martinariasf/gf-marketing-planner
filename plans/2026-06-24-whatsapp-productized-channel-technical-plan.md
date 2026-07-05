---
project: WhatsApp as Productized Per-Client Channel (GF-46)
updated: 2026-06-24
owner: Martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: false
focus_tasks: [TASK-002, TASK-003, TASK-006]
items:
  - gf-46: WhatsApp as productized per-client channel | priority: high
  - gf-54: Add Pilar to talk by whatsapp | priority: medium
---

# Plan

## Simple Words

- Today Viktor talks over Telegram + the web dashboard. Clients like AgenciaAGRO
  live in **WhatsApp**, so we want WhatsApp to be a first-class, per-client
  channel any new bot can ship with.
- WhatsApp **already works on the staging-demo agent** via the Baileys bridge
  (self-chat, only Martin, verified + baked into the image). That proves the
  agent side; it is **not** a scalable production channel.
- For the real fleet (goal: ~50 client agents) we move to the **official
  WhatsApp Business Cloud API**: Meta hosts the session (nothing to re-pair or
  get banned), one number per agent under one GF Business portfolio, and adding
  WhatsApp to a new client becomes "per-`.env` credentials + one Caddy webhook
  route" — the same shape as cloning an agent today.
- **Two supported modes** come out of this: (a) **Baileys self-chat** as a quick
  internal/demo option (what staging uses), and (b) **Cloud API** as the
  production, client-facing, scalable option.
- **Decisions locked with Martin (2026-06-24):** Cloud API is the standard; **GF
  provisions numbers centrally** (Twilio-as-number / prepaid — not client-owned);
  **reactive-only** (Viktor replies, never initiates); audience is the client's
  **internal team via a per-client allow-list** (not public end-customers).
- **Explicitly OUT of scope:** proactive/outbound messaging + Meta message
  templates (not needed for reactive use, and not implemented in the Hermes Cloud
  adapter); public/end-customer inbound; WhatsApp group chats (Cloud API v1 is
  DM-only); client-owned numbers as the default path.

## Decisions and API Contracts

### TASK-001: Transport + scope decisions (LOCKED 2026-06-24)
status: done
owner: martin
agent: human
reviewer: claude
branch: none
area: decisions
estimate: S
depends_on: []
tags: [notion, gf-46, whatsapp, decision]
acceptance:
- Transport: Cloud API is THE standard for productized per-client WhatsApp;
  Baileys self-chat stays only as a quick internal/demo option (staging).
  Twilio-as-transport rejected (no Hermes adapter).
- Numbers: GF provisions numbers centrally (Twilio-as-number "3a" or prepaid,
  under one GF Meta Business portfolio) — client-owned numbers are NOT the default.
- Outbound: reactive only (reply within the 24h window). Proactive/template
  messaging is OUT of scope — no Meta template or adapter work in this plan.
- Audience: client's internal team via a per-client allow-list
  (WHATSAPP_CLOUD_ALLOWED_USERS). Public/end-customer inbound is OUT of scope.
notes:
- Source: GF-46 in Notion; decisions confirmed with Martin 2026-06-24.
- Refines GF-46's original "Baileys bridge" wording toward Cloud API.
- Reactive-only + internal-team allow-list keeps volume low and removes the two
  biggest scope risks (message templates, public-inbound compliance).

## Base Image and Infrastructure

### TASK-002: Rebuild hermes-agent:base with the Cloud API platform
status: in_progress  # STAGING DONE 2026-07-04: hermes-agent:base-v2026.7.1 built (separate tag, prod base untouched); staging-demo rebuilt on it + smoke-tested (Telegram, Baileys re-link, api_server SMOKE-OK). Fleet/prod rollout still open. PR #43.
owner: martin
agent: human
reviewer: claude
branch: none
area: deployment
estimate: M
depends_on: [TASK-001]
tags: [notion, gf-46, whatsapp, base-image, hermes]
acceptance:
- New `hermes-agent:base` on the Hetzner box contains `gateway/platforms/whatsapp_cloud.py`.
- An agent built from it lists the `whatsapp_cloud` platform / accepts `WHATSAPP_CLOUD_*` env.
- The Baileys `whatsapp.py` path is unaffected (staging-demo still works).
notes:
- Evidence: current staging image ships only `whatsapp.py` (verified this
  session at `/opt/hermes/gateway/platforms/`); `whatsapp_cloud.py` exists in
  current upstream NousResearch/hermes-agent but not in the May-19 base.
- Ops: `cd /opt/agents/_upstream && git pull && docker build -t hermes-agent:base .`
  then rebuild each stack (per deploy-hermes-company-agent update recipe).
- Risk: base bump may shift other platform behavior — smoke-test Telegram +
  api_server on one agent before fleet rollout.

### TASK-003: One-time Meta Business setup (portfolio, token, App Review)
status: todo
owner: martin
agent: human
reviewer: human
branch: none
area: deployment
estimate: M
depends_on: [TASK-001]
tags: [notion, gf-46, whatsapp, meta, cloud-api]
acceptance:
- GF Meta Business portfolio + WABA created; a System-User **permanent** token
  (never-expiring) with whatsapp_business_messaging/management scopes exists.
- App Secret + a generated Verify Token are stored in the box-only secret store.
- App Review passed so the recipient list is not capped at 5 test numbers.
notes:
- Credentials needed per number: Phone Number ID (NOT the phone number),
  permanent access token, App Secret, Verify Token.
- One portfolio holds many numbers (~20-25 per WABA; multiple WABAs) — this is
  the mechanism that scales to ~50 agents.

## Per-Agent Cloud API Contract

### TASK-004: Add the WHATSAPP_CLOUD_* env + compose contract to the agent template
status: in_progress  # STAGING DONE 2026-07-04: WHATSAPP_CLOUD_* block live in staging .env (placeholders + generated verify token, DM_POLICY=allowlist, GROUP_POLICY=disabled), whatsapp_cloud toolset in config.yaml. NOTE: this build has NO WHATSAPP_CLOUD_ALLOWED_USERS env — it's WHATSAPP_CLOUD_ALLOW_FROM. Prod template (deploy-prod) still open. PR #43.
owner: martin
agent: codex
reviewer: claude
branch: codex/gf-46-whatsapp-cloud-env
area: deployment
estimate: M
depends_on: [TASK-002]
tags: [notion, gf-46, whatsapp, cloud-api, template]
acceptance:
- Agent `.env.example` documents WHATSAPP_CLOUD_PHONE_NUMBER_ID,
  WHATSAPP_CLOUD_ACCESS_TOKEN, WHATSAPP_CLOUD_APP_SECRET,
  WHATSAPP_CLOUD_VERIFY_TOKEN, WHATSAPP_CLOUD_ALLOWED_USERS,
  WHATSAPP_CLOUD_ALLOW_ALL_USERS=false.
- The agent `docker-compose.yml` exposes the webhook port (default 8090) on the
  shared docker network (no host publish).
- `platform_toolsets.whatsapp: [hermes-telegram]` present so WhatsApp gets the
  full tool set (mirrors what we added on staging).
notes:
- Code evidence: `deploy-prod/gf-innov-agent/docker-compose.yml` and
  `.env.example`; staging counterpart `deploy-staging/staging-demo-agent/config.yaml`
  (toolset added this session).
- Access control: `WHATSAPP_CLOUD_ALLOWED_USERS` is the per-client allow-list
  (GF-46 acceptance). International numbers, digits only, no `+`.

### TASK-005: Per-agent WhatsApp webhook routing in the production Caddy
status: in_progress  # STAGING DONE 2026-07-04: staging.marketing.gfinnov.com/whatsapp/webhook -> hermes-marketing-staging:8090 in box Caddy + repo deploy/Caddyfile (PR #43). Verified: GET handshake echoes challenge, wrong token 403. Prod per-agent routes still open.
owner: martin
agent: codex
reviewer: claude
branch: codex/gf-46-whatsapp-webhook
area: deployment
estimate: M
depends_on: [TASK-004]
tags: [notion, gf-46, whatsapp, caddy, webhook]
acceptance:
- A templated Caddy route maps `whatsapp-<slug>.gfinnov.com` (or a per-agent
  path) to `hermes-<slug>:8090/whatsapp/webhook` over the shared network, TLS
  terminated by the existing prod Caddy.
- Meta webhook GET verification (verify-token echo) succeeds for a test agent;
  the `messages` field subscription delivers inbound messages.
notes:
- Code evidence: `deploy-prod/Caddyfile.prod`, `deploy/Caddyfile`
  (marketing-planner-caddy terminates TLS for the whole box).
- Unlike Baileys (outbound-only), Cloud API REQUIRES this inbound HTTPS webhook.

## Number Provisioning and Onboarding

### TASK-006: Central number provisioning (GF-owned, Twilio-as-number "3a")
status: todo
owner: martin
agent: human
reviewer: claude
branch: none
area: deployment
estimate: M
depends_on: [TASK-003]
tags: [notion, gf-46, whatsapp, numbers, twilio]
acceptance:
- A GF-owned provider account (Twilio recommended) can mint inbound-capable
  numbers on demand; each is verified DIRECTLY onto Meta Cloud API ("3a") and
  attached to the GF portfolio/WABA.
- Repeatable per-number runbook: buy number -> receive OTP (voice/SMS) ->
  register the Phone Number ID on Meta -> record creds for the agent `.env`.
  Prepaid SIM documented as a manual fallback.
- VoIP caveat noted: number must accept an inbound SMS/voice OTP, not behind an
  IVR; verify each number links before promising go-live.
notes:
- Decision (TASK-001): GF provisions centrally; client-owned numbers are NOT the
  default. One number per agent, all under one GF Meta Business portfolio.
- Each number needs ONE OTP at setup, then Meta hosts it — no ongoing SIM/plan.
- Twilio here is ONLY a number source verified onto Meta ("3a"); messages still
  flow through Meta Cloud API, not Twilio's WhatsApp product.

### TASK-007: Wire WhatsApp into the deploy-hermes-company-agent onboarding
status: todo
owner: martin
agent: human
reviewer: claude
branch: none
area: docs
estimate: M
depends_on: [TASK-004, TASK-005, TASK-006]
tags: [notion, gf-46, whatsapp, onboarding, skill]
acceptance:
- `deploy-hermes-company-agent` documents both paths: Baileys self-chat (quick)
  and Cloud API (production), including the per-client allow-list step.
- A new client agent can be stood up WITH WhatsApp by following the skill end to
  end (no tribal knowledge).
notes:
- Cross-reference the `add-whatsapp-to-hermes-agent` skill (created this session)
  for the mechanics; this task makes WhatsApp a first-class option in the
  company-onboarding flow.

### TASK-008: Generalize the Baileys durability fix into the company template
status: todo
owner: martin
agent: human
reviewer: claude
branch: none
area: deployment
estimate: S
depends_on: [TASK-001]
tags: [notion, gf-46, whatsapp, baileys, template]
acceptance:
- The per-company Dockerfile template (Drive `hermes-stack/` + box template) bakes
  the pinned Baileys build so a rebuild cannot silently break the self-chat path.
notes:
- Already done + verified for staging-demo this session (Dockerfile pins
  baileys 7.0.0-rc13 + build-time import check). Port that block into the shared
  template so other agents using the Baileys/self-chat option inherit it.

## Pilot and Verification

### TASK-009: Production pilot — one real client number on Cloud API
status: todo
owner: martin
agent: human
reviewer: claude
branch: none
area: deployment
estimate: L
depends_on: [TASK-004, TASK-005, TASK-006]
tags: [notion, gf-46, whatsapp, pilot, agenciaagro]
acceptance:
- One client agent (e.g. AgenciaAGRO) runs in PRODUCTION with WhatsApp as its
  primary channel: inbound user message -> Viktor reply, outbound send works.
- The per-client allow-list is enforced (only listed numbers get answered).
notes:
- Source: GF-46 originates from the AgenciaAGRO evaluation (Gustavo Pena, CTO).
- This pilot is the concrete proof of the three GF-46 acceptance criteria.

### TASK-010: Verify GF-46 acceptance criteria
status: todo
owner: martin
agent: human
reviewer: claude
branch: none
area: verification
estimate: S
depends_on: [TASK-009]
tags: [notion, gf-46, whatsapp, verification]
acceptance:
- A new client agent CAN be deployed with WhatsApp as primary channel. (crit 1)
- Allow-list of who can message the bot is configurable per client. (crit 2)
- Runs in production, not just staging-demo. (crit 3)
notes:
- On pass, move GF-46 to "Done in Staging"/"Done in Main" per the actual rollout.

### TASK-011: Add Pilar as an allowed WhatsApp user (GF-54)
status: todo
owner: martin
agent: human
reviewer: claude
branch: none
area: agent
estimate: S
depends_on: [TASK-009]
tags: [notion, gf-54, whatsapp, allowlist]
acceptance:
- Pilar's number is on the allow-list of the relevant agent and she can message
  the bot on WhatsApp.
notes:
- Source: GF-54 in Notion (Medium). Becomes a trivial allow-list edit once a
  shared WhatsApp channel exists — depends on the productized channel (GF-46).
