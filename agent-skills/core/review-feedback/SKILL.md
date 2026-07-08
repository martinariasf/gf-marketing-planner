---
name: review-feedback
description: Read and reply to external collaboration-link feedback for the client via the dashboard API. Use ONLY when a human explicitly asks in chat to check, summarize, or answer reviewer feedback (e.g. "check the new feedback on the July posts", "reply to the reviewer on p012"). Manual trigger only — never wake on new comments by yourself.
trigger:
  - telegram: "(check|read|process|reply.*to|answer).*(feedback|review|reviewer|comment)"
---

# review-feedback skill — Viktor

The external **collaboration link** (GF-4) lets a client reviewer approve posts
and leave comments without logging into the platform. This skill is how Viktor
reads those comments and replies to them **when a human asks** — it is the
agent-side counterpart of the dashboard's external-feedback panel.

GF-66 opened the four review endpoints below to the `agent` role, so your
existing `API_TOKEN` (agent scope, confined to `$CLIENT_SLUG`) can call them. A
cross-client call is rejected with 403 — that is expected.

## When this runs

- **On demand only.** A human writes something like "Viktor, check the new
  feedback on X" or "reply to the reviewer's comment on p012" in the dashboard
  chat (or Telegram).
- **No automatic trigger.** Do NOT poll for new comments and do NOT reply on
  your own initiative. v1 is strictly human-initiated (GF-66 decision, Martin,
  2026-07-05).

## Environment

- `API_BASE` — dashboard API base, e.g. `https://marketing.gfinnov.com/api/v1`
- `API_TOKEN` — bearer token, role `agent`, scoped to this client
- `CLIENT_SLUG` — this client's slug

All calls carry `Authorization: Bearer $API_TOKEN`.

## Reading feedback

1. **Find the review links** (each shared batch is one link; you need its `id`
   to reply):
   ```bash
   curl -s -H "Authorization: Bearer $API_TOKEN" \
     "$API_BASE/clients/$CLIENT_SLUG/review-links"
   ```
   → `{ "items": [ { "id", "title", "status", "commentCount", ... } ] }`

2. **Read aggregated feedback** across all posts (decisions + comments, grouped
   by post, plus general comments):
   ```bash
   curl -s -H "Authorization: Bearer $API_TOKEN" \
     "$API_BASE/clients/$CLIENT_SLUG/review-feedback"
   ```
   → `{ "byPost": { "<postId>": { "decisions": [...], "comments": [...] } },
        "general": { "comments": [...] } }`

   Use this to summarize: which posts the reviewer approved / requested changes
   on, and what each comment says. `general.comments` (comments with no
   `postId`) apply to the whole batch.

3. **Read one link's raw thread** (all comments, both reviewer and team) when you
   need the exact wording or the comment order:
   ```bash
   curl -s -H "Authorization: Bearer $API_TOKEN" \
     "$API_BASE/clients/$CLIENT_SLUG/review-links/<linkId>/comments"
   ```
   → `{ "items": [ { "id", "body", "postId", "source", "reviewerName", "createdAt" } ] }`
   `source: "reviewer"` = the external client; `source: "dashboard"` = the team
   (including your own replies).

## Replying

Post a reply into a link's thread. Omit `postId` for a general reply, or set it
to answer about one shared post:

```bash
curl -s -X POST -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  "$API_BASE/clients/$CLIENT_SLUG/review-links/<linkId>/comments" \
  -d '{ "body": "Thanks — updated the hook on this post as requested.", "postId": "p012" }'
```

→ `201` with the created comment. It is stored `source: "dashboard"` and shows
in the external review link attributed to the team, so the reviewer sees it in
the same thread.

## Discipline

- Reply only with what the human told you to say (or a faithful paraphrase they
  approved). Do not invent commitments about posts you have not changed.
- If asked to "handle" feedback that implies editing a post, do the post edit
  through the normal write contract FIRST (see the `approvals` / draft skills),
  then reply describing what changed.
- One reply per point. Do not spam the thread.
- If a link is `revoked` or `expired`, tell the human — do not try to reply on a
  dead link.

## What this skill does NOT do

- Wake on new comments. → human-initiated only.
- Approve/reject posts. → `approvals` skill.
- Create or rotate review links. → dashboard only (not an agent capability).
