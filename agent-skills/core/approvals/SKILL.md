---
name: approvals
description: Process literal approval commands from Telegram. Triggers on messages starting with `approve`, `reject`, `revise`, `block`, or `unblock` followed by one or more post IDs (e.g. `approve p041 p042`). Flips post status, appends to approvals.log, queues approved posts to Postiz, and pushes a commit.
trigger: "^(approve|reject|revise|block|unblock)\\s+(p\\d+)(\\s+p\\d+)*\\s*$"
---

# approvals skill — Viktor

This is the **agent-side** counterpart to the dashboard's Approvals view. The client's approvers write literal commands on Telegram; Viktor applies them to the JSON files on disk; the dashboard reads those files and reflects the new state.


## Where this runs

- Runs on the per-client Hermes agent box (`/opt/agents/<slug>/`).
- Working directory: `/opt/marketing-planner/clients/<slug>/` — the shared filesystem the Caddy container also reads from.
- Git: the repo is checked out so commits push to `martinariasf/gf-marketing-planner` automatically.

## Input grammar

```
approve  p041                        # single
approve  p041 p042 p043              # batch
reject   p041 reason="hook is weak"  # with reason (quoted)
revise   p041 note="punchier opening"
block    p041 reason="awaiting consent"
unblock  p041
```

Whitespace tolerant. Quoted strings preserve spaces. Anything outside this grammar → don't trigger the skill, fall back to general chat.

## What to do per command

### `approve <id> [...]`

For each `<id>`:
1. Read `posts/<id>.json`.
2. If `approval.status` is already `approved`, `scheduled`, or `published` → reply `<id> already approved (status: <current>)` and skip.
3. Else:
   - `post.status = "approved"`
   - `post.approval.status = "approved"`
   - `post.approval.approvedBy = <sender>` (Telegram username, no `@`)
   - `post.approval.approvedAt = <now ISO UTC>`
   - `post.approval.blockerReason = null`
4. Write the file back, preserving every other field byte-for-byte.
5. Append one line to `approvals.log`:
   ```
   2026-05-20T17:32:00Z  approve  p041  <Name>  via=telegram
   ```
6. Queue Postiz only after the post is approved in the Marketing-Planner
   dashboard. Never schedule chat-only copy, a draft, or an unapproved post.
   Call the Postiz API/tool with the approved post's channel, scheduled date,
   copy, image, and hashtags. Store the returned job id in
   `post.publishing.postizJobId`. Set `post.status = "scheduled"` and write the
   file again.
7. Reply on Telegram with one line per id: `✅ p041 approved, scheduled in Postiz (job pz_xxx)`.

### `reject <id> reason="..."`

1. `post.status = "rejected"`, `post.approval.status = "rejected"`, `post.approval.blockerReason = <reason>`.
2. Append to `approvals.log` with `action=reject` and `reason="..."`.
3. Reply `❌ p041 rejected: <reason>`.

### `revise <id> note="..."`

1. `post.status = "needs_revision"`, `post.approval.status = "needs_revision"`, `post.approval.blockerReason = <note>`.
2. Append to log with `action=block` and `reason=<note>`.
3. Reply `↩️ p041 sent back for revision: <note>`. Optionally re-draft and bump `approval.version` automatically.

### `block <id> reason="..."` / `unblock <id>`

Same shape as revise/approve but only modifies `blockerReason` and `approval.status` without scheduling.

## Commit pattern

One commit per Telegram message, even for a batch. Stage everything that was modified:

```bash
cd /opt/marketing-planner
git add clients/<slug>/posts/p041.json \
        clients/<slug>/posts/p042.json \
        clients/<slug>/approvals.log
git commit -m "viktor(<slug>): approve p041 p042 (<name> via telegram)"
git push
```

If `git push` fails (rate-limited, conflict, etc.) — **do not retry destructively**. Reply on Telegram with the error and leave the working tree as is for human cleanup; a human reviews daily.

## Dashboard API quirk — approvals POST does not flip post status

On the Marketing-Planner dashboard API, `POST /clients/<slug>/approvals` with
`{"postId","decision","note"}` returns `{"ok":true,...}` and records the decision in the audit
log, but it does **NOT** change the post's `status` field. The post stays in its previous status
(e.g. `drafting`) even though the approval was logged. To actually move a post to `in_review`
(or any status), follow the approvals POST with a direct
`PATCH /clients/<slug>/posts/{id}` with `{"status":"in_review"}` and then re-read the post to
confirm it persisted. If a status change "doesn't stick," this is the cause — the audit POST and
the status PATCH are two separate writes.

## Idempotence + safety

- An `approve` on an already-approved post is a no-op (return existing state). Never double-schedule in Postiz.
- Postiz publishing must always originate from an approved dashboard post. If
  there is no approved post id, stop and ask the user to approve/create the post
  in the dashboard first.
- An action on a missing post id → reply `⚠️ <id> not found` and continue with the remaining ids in the batch.
- An action on a post the sender doesn't have permission for → reply `⚠️ <sender> cannot approve for <slug>; <owner> must do it.` (Permissions list lives in `brief.json` under `boundaries`; for now: anyone in the `viktorNeedsApprovalFor` allowlist can approve. The allowlist comes from the client brief.)
- Never auto-approve. Never bypass the literal grammar.

## Postiz integration (shape, not final)

```
POST {POSTIZ_BASE}/api/posts
{
  "channels": ["<channel-id-for-instagram>"],
  "scheduledAt": "<post.date>T13:00:00Z",
  "content": "<post.copy>\n\n<hashtags>",
  "media": [{ "url": "<post.image>" }]
}
→ 200 { "jobId": "pz_xxx" }
```

API base + channel-id-per-platform live in environment vars on the agent (`POSTIZ_BASE`, `POSTIZ_TOKEN`, `POSTIZ_CHANNEL_INSTAGRAM`, etc.). Confirm the actual schema during Phase 3 when we wire the real client up.

## What this skill does NOT do

- Draft posts. That's a separate `draft` skill.
- Generate images. That's `nano-banana-image`.
- Pull metrics. That's `sync-postiz-analytics`.
- Send the weekly summary. That's `weekly-summary`.

Keep this skill small and laser-focused. It is the single most safety-critical part of Viktor — a buggy approval skill can leak unapproved content to the public.

## Open questions for installation

- [ ] Confirm Hermes scheduler exists for the post-publish webhook (`publishedAt` + `publicUrl` need to flow back into the post file once Postiz publishes).
- [ ] Confirm Postiz API shape against a real Postiz instance (the contract above is a best guess).
- [ ] Decide: do we want a per-client allowlist in `brief.json`, or a global per-Hermes-agent allowlist? Per-client is more flexible; per-agent is harder to misconfigure.
