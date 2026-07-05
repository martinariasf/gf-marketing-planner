# GF-56 — Per-client usage limits & billing concept (design spike)

**Date:** 2026-07-05 · **Status:** Concept for discussion · **Notion:** GF-56 (In discussion)

## Problem

Clients pay a fixed monthly price for their Viktor agent. LLM spend goes through
OpenRouter, and today the only cost brake is a **daily credit limit set manually in
the OpenRouter dashboard**. That brake is blunt:

- When it trips mid-day, the agent's responses truncate or fail and the client is
  blocked from working (the original GF-56 symptom).
- It protects total spend, not *per-client* spend — one heavy client can burn the
  shared daily budget.
- There is no data trail that maps spend to a client, so "pay more if you use more"
  cannot be billed.

## What we verified (2026-07-05)

1. **Each agent stack already has its own OpenRouter key.** Checked on the box:
   `/opt/agents/{gf-innov,biomas,staging-demo,marketing-demo}/.env` each carry a
   distinct `sk-or-v1-…` key. Per-client attribution therefore needs **no re-wiring**.
2. **OpenRouter has a key-management API** (a "Provisioning key" authorizes it):
   - `POST/GET/PATCH/DELETE /api/v1/keys` — create, list, update, delete runtime keys.
   - Per key fields: `limit`, `limit_remaining`, `limit_reset` (**daily / weekly /
     monthly** / null), `disabled`, `usage`, `usage_daily`, `usage_weekly`,
     `usage_monthly`, `include_byok_in_limit`.
   - When a key hits its limit, requests on that key are **rejected before reaching
     the provider** (no upstream cost).
   - Docs: https://openrouter.ai/docs/features/provisioning-api-keys
3. **Caveat:** keys created manually in the dashboard may not be manageable through
   the provisioning API. Plan for a one-time migration: create the four agent keys
   via the API, swap them into each stack's `.env`, restart, delete the old keys.

## Proposed model

### 1. One provisioned key per client agent, with a monthly limit

- Create each agent's runtime key via the provisioning API with
  `limit = hard_cap_eur` and `limit_reset = "monthly"`.
- **Drop the daily limit entirely** — it is the cause of mid-day lockouts.
- The hard cap is an *emergency brake*, not the allowance: set it at **2–3× the
  LLM budget implied by the client's fixed price**, so normal heavy use never
  hits it but a runaway loop cannot cost hundreds.

### 2. Two-tier limits: soft warns, hard stops

| Tier | Level (example) | Mechanism | What happens |
|---|---|---|---|
| Included allowance | e.g. €10/mo LLM spend | bookkeeping only | nothing visible |
| **Soft limit** | ~80–100% of allowance | usage poll (see 3) | client gets a polite in-language notice ("most of this month's included volume is used; further use is billed at €X per block"); Martin gets a Telegram ping |
| **Hard cap** | 2–3× allowance | OpenRouter `limit` | key rejects requests; agent returns the GF-59-style localized quota message |

The soft-limit client notice reuses the **GF-59 message-catalog pattern**
(localized non-LLM messages via `CLIENT_LANGS_JSON`); the hard-cap error message
is the same path the daily-limit 402/403 already takes today — it just needs the
clearer wording GF-59 shipped.

### 3. Usage tracking: a small monthly/daily poller, no gateway

No proxy or gateway needed — OpenRouter does the metering. A small scheduled job
(cron on the box, or a Viktor skill Martin triggers):

- **Daily:** `GET /api/v1/keys` with the provisioning key → for each client key,
  read `usage_monthly` and `limit_remaining`. If a client crossed its soft
  threshold and wasn't warned this month, send the notice (client) + ping (Martin).
  State = one tiny JSON file (`warned: {client: month}`).
- **Monthly (1st):** produce the overage report per client:
  `overage_eur = max(0, usage_monthly_prev - included_allowance)`, rounded up to
  billing blocks (e.g. €5). Output = a markdown/CSV summary Martin uses for
  invoicing.

Effort: one script + one cron entry + the notice plumbing. Fits the
50-client goal — zero human minutes per client per month except reading the
monthly report.

### 4. Billing model (commercial)

- Fixed monthly price includes **N € of LLM spend** (internal cost × margin).
- Overage billed per block (e.g. per started €5 of extra spend), read directly
  off `usage_monthly` — OpenRouter's number is the invoice's source of truth.
- Image/video generation via OpenRouter rides the same key, so it is included in
  the same metering. (Nano-Banana/Google-API image calls, if any, are outside
  this metering — check per client which path is active before promising
  all-inclusive metering.)

## Open decisions for Martin

1. Included allowance per client tier (needs a look at real `usage_monthly` for
   gf-innov and biomas over a month — the poller can collect this first,
   limits can come a month later).
2. Overage block size and price.
3. Soft-limit notice wording (Pilar review for ES/DE).
4. Whether the marketing-demo/staging keys get caps too (recommended: yes, small).

## Suggested rollout

1. **Week 1 — observe:** create the provisioning key, migrate the 4 agent keys to
   provisioned keys (no limits yet), deploy the daily poller in report-only mode.
2. **Week 2+ — decide:** pick allowances from the observed data; enable
   `limit_reset=monthly` hard caps + soft-limit notices.
3. Remove the manual daily limit from the dashboard.

---
*Spike deliverable for GF-56; no implementation in this branch. Filed by Claude
during the 2026-07-05 backlog review follow-up.*
