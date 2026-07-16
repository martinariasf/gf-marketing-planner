---
project: GF-73 agent status PATCH records approval decision
updated: 2026-07-08
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
branch: claude/gf-73-agent-status-approvals
code_reviewed: false
focus_tasks: [TASK-001, TASK-002, TASK-003]
items:
  - gf-73: Reload button not working (regression) — real bug is approval-overlay precedence | priority: high
---

# Plan

## Root cause (verified live on staging 2026-07-08)

The reload button and the whole fetch chain work: an agent-token
`PATCH /clients/staging-demo/posts/p001 {status:"in_review"}` was immediately
visible on `GET /posts` and `GET /posts/:id` (no client or server caching).
The bug is display precedence:

- `app-v2/src/lib/post-status.ts` `laneFor()` prefers `approval.status` over
  `status`.
- `deploy-staging/api/src/posts.ts` `buildPost()` stamps `approval.status`
  from the latest `approvals_v2` row whenever any approval history exists.
- The dashboard's status selector writes an `approvals_v2` row
  (`POST /clients/:slug/approvals`), but the agent's status change goes
  through `PATCH /clients/:slug/posts/:id`, which only writes a
  `posts_patches` overlay — never an approvals row.

So for any post with approval history, an agent status change never moves the
visible lane, no matter how often the calendar is reloaded. Fix (Martin's
option 1): when a PATCH sets `status` to one of `APPROVAL_DECISIONS`, the API
also records the same `approvals_v2` decision row the dashboard writes.

## Tasks

### TASK-001 — Pure helper + unit tests (TDD)

New `deploy-staging/api/src/approvalFromPatch.ts` exporting
`approvalDecisionForPatch(current: { status?: unknown; approval?: { status?: unknown } }, finalStatus: unknown): ApprovalDecision | null`:

- returns `finalStatus` when it is one of `APPROVAL_DECISIONS` **and** it
  differs from the current displayed lane (`approval?.status ?? status`);
- returns `null` for non-workflow statuses (`published`, `deleted`,
  undefined, junk), and when the decision equals the current lane (no noisy
  duplicate rows for idempotent PATCHes).

Tests first in `deploy-staging/api/src/approvalFromPatch.test.ts` (node:test,
same style as `agentMessages.test.ts`): workflow key with differing lane →
decision; equal lane → null; `published`/`deleted`/absent → null; approval
history absent (lane falls back to `status`) → compared against `status`.

Verify: `npm test` in `deploy-staging/api` — new file fails before impl,
passes after.

### TASK-002 — Wire into the PATCH handler

`deploy-staging/api/src/routes/viktorOwned.ts`, PATCH `/clients/:slug/posts/:id`
(after `persistSchedulingPatch(...)`, line ~289): compute
`const decision = approvalDecisionForPatch(current, finalPatch.status)` and,
when non-null, create the same row shape `POST /approvals` writes
(`{slug, postId, decision, note: '', actor, ts}`) into `approvals_v2`, plus an
`audit(principal, { action: 'approval.decide', ... })` entry mirroring the
approvals route. Scheduling stays untouched: the PATCH handler already drove
`applyStatusToSchedule` before this point, and `finalPatch.status` is the
post-scheduling value, so `scheduled` is only recorded when the provider job
succeeded.

Verify: `npx tsc --noEmit` in `deploy-staging/api` clean; `npm test` green.

### TASK-003 — Staging verification (write path)

After merge + CI deploy: with the staging agent token, `PATCH` a
`staging-demo` post that has an approvals row (p001, approval=approved) to
`{status:"in_review"}`; `GET /posts/:id` must now return
`approval.status === "in_review"` (lane moves). Then PATCH-decision it back to
`approved` and confirm. GET `/approvals` shows both agent rows with the agent
actor. No orphan test data (approvals are append-only history; the final
state must equal the starting state).

## Non-goals

- No frontend change: `laneFor` precedence is correct for the dashboard and
  shared with the kanban — changing it would regress GF-23.
- No change to Viktor's plugin/skills: the API-side fix covers every agent.
- No backfill of past mismatched patches.
