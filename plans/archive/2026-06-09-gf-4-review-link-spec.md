---
project: GF-4 Content Creation Review-Link — MVP Spec
updated: 2026-06-09
owner: martin
status: approved
source: GF-4 (Notion), TASK-001 of 2026-06-09-gf-4-collaboration-layer-technical-plan.md
decided_by: Martin (2026-06-10, via implementation clarification)
---

# Content Creation Review-Link — MVP Spec

This is the TASK-001 gate spec. It is intentionally narrow: a **protected external
review link** generated from Content Creation, **not** a full multi-user workspace
and **not** a platform login. The outside reviewer never enters the dashboard.

## 1. What can be shared (shareable unit)

The **currently visible content-calendar range** (a `startMonth`–`endMonth` window,
up to 6 months, as defined by `lib/planning-range.ts`). One review link == one frozen
month range for one client. This deliberately aligns with the GF-17 "download the
content calendar" feature, which shares the same range anchor.

The link stores the range, not a snapshot — the external page reads the live posts in
that range at view time, so copy/image fixes made in the dashboard show up for the
reviewer without re-issuing the link.

## 2. What the reviewer can do

After entering the access code, the reviewer can:

- **View** the posts in the shared range (read-only: date, channel, format, pillar,
  title, copy, hashtags, CTA, image/slides). No editing.
- **Comment** — free-text comments, optionally attached to a specific post.
- **Submit a review decision** — **Approve** or **Request changes**, with an optional
  note. (Martin's choice: "view + comment + approve".)

**Critical safety rule:** a reviewer decision is a *signal*, not an action. It is
recorded as a `review_event` + comment and surfaced to the dashboard. It does **not**
write `approvals_v2`, does **not** change `post.status`, and does **not** publish.
Internal approval authority stays entirely inside the dashboard. A dashboard user
still has to act on the reviewer's signal. This honours the plan's TASK-004 constraint
("external comments do not automatically publish or approve content").

## 3. Link rules

- **Access code:** 8-char, unambiguous uppercase alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`,
  no `0/O/1/I`). Shown to the dashboard user **once** at creation / rotation; stored only
  as a salted SHA-256 hash (`sha256(publicId + ":" + code)`), never plaintext.
- **Public id:** unguessable `randomBytes(16).base64url` — the URL is
  `/<host>/review/<publicId>`. Knowing the URL alone reveals nothing; the code is required.
- **Expiration:** default **14 days** from creation. Expired links return a safe error and
  no content. Dashboard can rotate (new code, resets clock) or revoke.
- **Revocation:** sets `status: revoked`; immediately denies open + all reviewer actions.
- **Reviewer identity:** reviewers self-identify with a **display name** on first open
  (free text, stored per comment/decision). No email, no account. Name is not verified —
  it is an attribution label only.

## 4. Data exposed vs. withheld

**Exposed on the external page (sanitized):** per-post `id, date, channel, format, pillar,
title, copy, hashtags, cta, image, slides`, plus the link `title` and range, plus the
client's public display name and handle for context.

**Never exposed:** brief / plan / goals / learnings / performance, the client list, other
clients' data, internal approval actors and notes, audit log, chat transcripts, tokens,
PocketBase ids of internal records, raw slug only where needed for image URLs.

## 5. Out of scope for this MVP

- Multiple reviewers with distinct logins / roles.
- Email or push delivery of the link or of activity (deferred; dashboard-side awareness
  only — see TASK-005).
- Sharing arbitrary single posts or cross-range selections (range is the unit).
- Reviewer editing of content.

## 6. Acceptance (maps to TASK-001)

- [x] MVP = protected external review link generated from Content Creation.
- [x] Shareable unit defined: the visible calendar range.
- [x] Reviewer capabilities defined: view + comment + approve/request-changes (as signal only).
- [x] Expiration (14d default), code rules (8-char hashed), revocation, rotation, reviewer
      self-identification (display name) defined.
- [x] Reviewed & approved before build — this document is the gate.
