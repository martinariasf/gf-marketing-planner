// GF-4 collaboration layer — shared helpers for protected review links.
//
// Two trust boundaries meet here:
//   - Dashboard side  (dash/admin bearer tokens) creates/lists/revokes links and
//     moderates comments. Handled in routes/reviewLinks.ts.
//   - Public side      (no bearer; an access code) opens a link and posts
//     reviewer comments/decisions. Handled in routes/reviewPublic.ts.
//
// This module owns the security-sensitive primitives both sides rely on:
// access-code generation + hashing, the public id, the in-memory review session,
// and the post sanitizer that decides exactly which fields ever leave the API for
// an unauthenticated reviewer.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

// Unambiguous code alphabet — no 0/O/1/I/L so a code is easy to read aloud / type.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 8
export const DEFAULT_TTL_DAYS = 14

/** A human-friendly 8-char access code, e.g. "K7P2X9QF". */
export function generateAccessCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]
  }
  return out
}

/** Unguessable public id used in the review URL (/review/<publicId>). */
export function generatePublicId(): string {
  return randomBytes(16).toString('base64url')
}

/**
 * Salted hash of an access code. Salt is the link's own publicId, so the same
 * code on two links yields different hashes and the hash can't be precomputed
 * without the (random) publicId.
 */
export function hashCode(publicId: string, code: string): string {
  return createHash('sha256').update(`${publicId}:${code.toUpperCase()}`).digest('hex')
}

/** Constant-time comparison of a submitted code against a stored hash. */
export function verifyCode(publicId: string, code: string, storedHash: string): boolean {
  const candidate = hashCode(publicId, (code ?? '').trim())
  const a = Buffer.from(candidate, 'hex')
  const b = Buffer.from(storedHash ?? '', 'hex')
  if (a.length !== b.length || a.length === 0) return false
  return timingSafeEqual(a, b)
}

export function defaultExpiry(now = Date.now()): string {
  return new Date(now + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export interface ReviewLinkRecord {
  id: string
  slug: string
  publicId: string
  title?: string
  rangeStart: string
  rangeEnd: string
  /**
   * GF-42 — optional subset of month keys (YYYY-MM) within [rangeStart, rangeEnd]
   * the sharer chose to expose. Empty/absent = all months in the range (the
   * original, backward-compatible behavior). Stored in PB as a JSON field.
   */
  months?: string[]
  codeHash: string
  /**
   * GF-105 — which kind of review this link is for. 'content' (the default and
   * the only pre-GF-105 behavior) shows the finished creative; 'strategy' shows
   * a text-only plan view with every image stripped SERVER-SIDE. Absent or
   * unrecognized means 'content', so every existing link is unaffected.
   */
  view?: ReviewLinkView
  status: 'active' | 'revoked'
  expiresAt?: string
  createdBy?: string
  createdAt?: string
  revokedAt?: string
}

export type ReviewLinkView = 'content' | 'strategy'

/**
 * Normalize a stored/submitted link view into a known value. Anything that is
 * not exactly 'strategy' collapses to 'content' — the safe default, because a
 * link that fails to parse must never silently become a different kind of
 * review than the sharer intended.
 */
export function parseLinkView(value: unknown): ReviewLinkView {
  return value === 'strategy' ? 'strategy' : 'content'
}

/**
 * GF-106 — build a lookup from a link id to the view that link was created for.
 *
 * Used by the review-feedback aggregation to stamp each decision/comment with
 * the kind of link the reviewer was looking at when they left it. Anything the
 * map cannot resolve — a deleted link, a row written before links carried ids,
 * a missing linkId — collapses to 'content', which is both the pre-GF-105
 * behavior and the safe default: the row is still returned, never dropped.
 */
export function linkViewResolver(
  links: readonly { id: string; view?: ReviewLinkView }[],
): (linkId: string | undefined | null) => ReviewLinkView {
  const byId = new Map<string, ReviewLinkView>()
  for (const link of links) {
    if (link?.id) byId.set(link.id, parseLinkView(link.view))
  }
  return (linkId) => (linkId ? byId.get(linkId) ?? 'content' : 'content')
}

/** One reviewer decision on one post, stamped with the link view it came from. */
export interface FeedbackDecisionEntry {
  decision: string
  reviewerName: string
  createdAt: string
  view: ReviewLinkView
}

export interface ReviewFeedbackInputEvent {
  postId?: string
  linkId?: string
  kind: string
  reviewerName?: string
  createdAt?: string
}

/**
 * GF-106 — the pure fold behind GET /clients/:slug/review-feedback.
 *
 * Extracted from the route handler so the merge semantics are unit-testable
 * without a live PocketBase. Two rules it must keep:
 *
 *  1. Decisions are keyed on reviewer AND view. The same person may decide once
 *     on the strategy link and again on the content link for the SAME post, and
 *     the split panel has to show both. Keying on the reviewer alone would drop
 *     one of them.
 *  2. Within one (reviewer, view) pair, latest still wins. Callers must pass
 *     `events` in ascending createdAt order, so a plain overwrite keeps the
 *     newest — these PB collections have no autodate `created`, so that order
 *     comes from the text `createdAt` the app writes itself.
 *
 * Nothing is ever filtered by view: a row whose linkId does not resolve is
 * stamped 'content' by `viewOf` and still returned.
 */
export function buildReviewFeedback<C extends { postId?: string; linkId?: string }>(
  events: readonly ReviewFeedbackInputEvent[],
  comments: readonly C[],
  viewOf: (linkId: string | undefined | null) => ReviewLinkView,
): {
  byPost: Record<string, { decisions: FeedbackDecisionEntry[]; comments: (C & { view: ReviewLinkView })[] }>
  general: { comments: (C & { view: ReviewLinkView })[] }
} {
  const decisionsByPost = new Map<string, Map<string, FeedbackDecisionEntry>>()
  for (const ev of events) {
    if (!ev.postId) continue
    const reviewer = ev.reviewerName || 'Guest'
    const view = viewOf(ev.linkId)
    const perReviewer = decisionsByPost.get(ev.postId) ?? new Map<string, FeedbackDecisionEntry>()
    // Separator is U+0000 written as an ESCAPE, never a raw control byte in
    // the source (a raw one makes git treat this file as binary). It cannot
    // occur in a reviewer name, so a reviewer literally called "Ann content"
    // can never collide with reviewer "Ann" on the content view.
    perReviewer.set(`${reviewer}\u0000${view}`, {
      decision: ev.kind,
      reviewerName: reviewer,
      createdAt: ev.createdAt ?? '',
      view,
    })
    decisionsByPost.set(ev.postId, perReviewer)
  }

  const byPost: Record<
    string,
    { decisions: FeedbackDecisionEntry[]; comments: (C & { view: ReviewLinkView })[] }
  > = {}
  const bucket = (postId: string) => (byPost[postId] ??= { decisions: [], comments: [] })

  for (const [postId, perReviewer] of decisionsByPost) {
    bucket(postId).decisions = [...perReviewer.values()]
  }

  const general: { comments: (C & { view: ReviewLinkView })[] } = { comments: [] }
  for (const cm of comments) {
    const stamped = { ...cm, view: viewOf(cm.linkId) }
    if (stamped.postId) bucket(stamped.postId).comments.push(stamped)
    else general.comments.push(stamped)
  }

  return { byPost, general }
}

/**
 * Normalize a stored `months` value (which PB may hand back as a JSON array, a
 * JSON string, or undefined) into a clean, de-duplicated list of YYYY-MM keys.
 * Returns an empty array when there is no usable selection — callers treat that
 * as "all months in the range".
 */
export function parseMonthSelection(value: unknown): string[] {
  let raw: unknown = value
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    try {
      raw = JSON.parse(trimmed)
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  for (const m of raw) {
    if (typeof m === 'string' && /^\d{4}-\d{2}$/.test(m)) seen.add(m)
  }
  return [...seen].sort()
}

/**
 * Whether a post (by its YYYY-MM month key) is visible given a link's month
 * selection. An empty selection means every month in the range is visible.
 */
export function monthInSelection(monthKey: string, selection: string[]): boolean {
  if (selection.length === 0) return true
  return selection.includes(monthKey)
}

export type LinkState = 'active' | 'revoked' | 'expired'

export function linkState(link: Pick<ReviewLinkRecord, 'status' | 'expiresAt'>, now = Date.now()): LinkState {
  if (link.status === 'revoked') return 'revoked'
  if (link.expiresAt && Date.parse(link.expiresAt) <= now) return 'expired'
  return 'active'
}

// ── Public-safe post sanitizer ──────────────────────────────────────────────
// The single source of truth for what an unauthenticated reviewer may see. Only
// the fields a reviewer needs to give feedback on the creative are returned;
// anything else (internal approval actors, publishing job ids, slug-bearing
// metadata, unknown future fields) is dropped by construction.

const PUBLIC_SLIDE_FIELDS = ['image', 'caption'] as const
const PUBLIC_MEDIA_TYPES = new Set(['image', 'video'])

export interface PublicPost {
  id: string
  date: string
  /** Primary channel. Always equal to `channels[0]` when `channels` is present. */
  channel?: string
  /**
   * GF-105 — every target platform, not just the primary one. GF-20 made posts
   * multi-channel but the sanitizer only ever emitted the singular `channel`,
   * so a multi-platform post was not expressible in the public payload at all.
   */
  channels?: string[]
  format?: string
  pillar?: string
  campaign?: string
  title: string
  copy?: string
  hashtags?: string[]
  cta?: string
  image?: string
  // `image` / `url` are optional because stripVisuals() removes them for a
  // strategy link, leaving the captions (the design brief) behind.
  slides?: Array<{ image?: string; caption?: string }>
  media?: Array<{ type: 'image' | 'video'; url?: string; thumbnail?: string; caption?: string; assetId?: string }>
  /** Read-only label of the internal status, so reviewers see "approved" etc.
   *  without exposing who/when. */
  statusLabel?: string
}

export function sanitizePost(post: Record<string, unknown>): PublicPost {
  const out: PublicPost = {
    id: String(post.id ?? ''),
    date: typeof post.date === 'string' ? post.date : '',
    title: typeof post.title === 'string' ? post.title : '',
  }
  // GF-105 — carry every target platform. `channels` is the multi-channel field
  // GF-20 introduced; `channel` is the primary.
  //
  // The STORED primary always wins and is moved to the front, rather than simply
  // taking channels[0]. coalescePost() already keeps the two coherent, so today
  // they agree — but sanitizePost is a public-safe primitive that must not
  // depend on its caller having coalesced. Deriving the primary from
  // channels[0] would silently change `channel` for a CONTENT link too (the
  // sanitizer runs for both views), which is a live, out-of-scope surface.
  const channelList = Array.isArray(post.channels)
    ? post.channels.filter((ch): ch is string => typeof ch === 'string' && ch.length > 0)
    : []
  const primary = typeof post.channel === 'string' && post.channel ? post.channel : undefined
  let allChannels = channelList.length > 0 ? [...new Set(channelList)] : primary ? [primary] : []
  if (primary && allChannels[0] !== primary) {
    allChannels = [primary, ...allChannels.filter((ch) => ch !== primary)]
  }
  if (allChannels.length > 0) {
    out.channels = allChannels
    out.channel = allChannels[0]
  } else if (primary) {
    out.channel = primary
  }
  if (typeof post.format === 'string') out.format = post.format
  if (typeof post.pillar === 'string') out.pillar = post.pillar
  if (typeof post.campaign === 'string') out.campaign = post.campaign
  if (typeof post.copy === 'string') out.copy = post.copy
  if (typeof post.cta === 'string') out.cta = post.cta
  // ⚠ IMAGE-BEARING FIELD. sanitizePost is an allowlist, so nothing reaches the
  // public payload unless it is named here — but that also means stripVisuals()
  // below cannot know about a field you add here. If you add ANY new
  // image/url/thumbnail-bearing field to this function, you MUST also strip it
  // in stripVisuals(), or it will leak on a strategy link. The two move in
  // lockstep; the serialize-the-payload test in reviewLib.strategy.test.ts is
  // the backstop, not the contract.
  if (typeof post.image === 'string') out.image = post.image
  if (Array.isArray(post.hashtags)) {
    out.hashtags = post.hashtags.filter((h): h is string => typeof h === 'string')
  }
  if (Array.isArray(post.slides)) {
    out.slides = post.slides
      .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
      .filter((s) => typeof s.image === 'string')
      .map((s) => {
        const slide: { image?: string; caption?: string } = { image: s.image as string }
        if (typeof s.caption === 'string') slide.caption = s.caption
        return slide
      })
  }
  if (Array.isArray(post.media)) {
    out.media = post.media
      .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
      .filter(
        (m) =>
          typeof m.type === 'string' &&
          PUBLIC_MEDIA_TYPES.has(m.type) &&
          typeof m.url === 'string',
      )
      .map((m) => {
        const media: { type: 'image' | 'video'; url?: string; thumbnail?: string; caption?: string; assetId?: string } = {
          type: m.type as 'image' | 'video',
          url: m.url as string,
        }
        if (typeof m.thumbnail === 'string') media.thumbnail = m.thumbnail
        if (typeof m.caption === 'string') media.caption = m.caption
        if (typeof m.assetId === 'string') media.assetId = m.assetId
        return media
      })
  }
  const approval = post.approval
  if (approval && typeof approval === 'object' && 'status' in approval) {
    const status = (approval as { status?: unknown }).status
    if (typeof status === 'string') out.statusLabel = status
  } else if (typeof post.status === 'string') {
    out.statusLabel = post.status
  }
  return out
}

/**
 * GF-105 — remove every image-bearing field from an already-sanitized post,
 * leaving only the plan: pillar, format, platforms, date, copy and the captions
 * that describe what the visual will show.
 *
 * This is the enforcement point for a strategy link's "no pictures" rule, and
 * it is deliberately server-side: hiding images in CSS would still ship the
 * URLs to an unauthenticated party, which is exactly what a pre-production
 * strategy review is meant to avoid.
 *
 * Fields removed: `image`, `slides[].image`, `media[].url`, `media[].thumbnail`,
 * `media[].assetId`. Kept: `slides[].caption`, `media[].caption`, `media[].type`.
 *
 * Slides and media entries are kept (not dropped) even when they carry no
 * caption, so the strategy view can still say how many slides a carousel has.
 */
export function stripVisuals(post: PublicPost): PublicPost {
  const { image: _image, slides, media, ...rest } = post
  const out: PublicPost = { ...rest }
  if (slides) {
    out.slides = slides.map((s) => (s.caption ? { caption: s.caption } : {}))
  }
  if (media) {
    out.media = media.map((m) => (m.caption ? { type: m.type, caption: m.caption } : { type: m.type }))
  }
  return out
}

// ── In-memory review sessions ───────────────────────────────────────────────
// A reviewer who passes the code check gets a short-lived opaque token (held
// only in memory, like the dashboard's /auth/exchange tokens). Subsequent public
// actions (comment, decision, refresh) present this token instead of re-sending
// the code. Server restart invalidates sessions — the reviewer just re-enters
// the code. Never PB-backed: these are ephemeral and per-tab.

const REVIEW_SESSION_TTL_MS = 6 * 60 * 60 * 1000 // 6h

export interface ReviewSession {
  token: string
  linkId: string
  publicId: string
  slug: string
  reviewerName: string
  expiresAt: number
}

const reviewSessions = new Map<string, ReviewSession>()

export function createReviewSession(args: {
  linkId: string
  publicId: string
  slug: string
  reviewerName: string
}): ReviewSession {
  const token = `rev_${randomBytes(24).toString('base64url')}`
  const session: ReviewSession = {
    token,
    linkId: args.linkId,
    publicId: args.publicId,
    slug: args.slug,
    reviewerName: args.reviewerName,
    expiresAt: Date.now() + REVIEW_SESSION_TTL_MS,
  }
  reviewSessions.set(token, session)
  return session
}

export function getReviewSession(token: string | undefined | null): ReviewSession | null {
  if (!token) return null
  const s = reviewSessions.get(token)
  if (!s) return null
  if (s.expiresAt <= Date.now()) {
    reviewSessions.delete(token)
    return null
  }
  return s
}

// Bounded-memory GC for expired sessions on long uptimes.
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of reviewSessions) if (v.expiresAt <= now) reviewSessions.delete(k)
}, 10 * 60_000).unref()

/** Reviewer-facing brand block of the public review payload. */
export type PublicBrand = { name: string; handle: string; logoInitials: string }

/** Trimmed string, or '' for anything that is not a non-blank string. */
function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * GF-108 — resolve the brand block an external reviewer sees.
 *
 * PocketBase is the source of truth for a client's display name, exactly as it
 * is for the dashboard (`clientList()` in routes/clients.ts overlays PB records
 * onto the disk index). plan.json is a fallback for what PB carries, and the
 * only source for `handle`, which PB has no field for.
 *
 * `name` has NO slug fallback on purpose: an unresolvable name returns '', and
 * the strategy header then falls back to the link's own title (GF-106,
 * app-v2/src/routes/review/strategy-view.tsx). Printing the internal slug to an
 * external reviewer is the bug this function exists to prevent.
 */
export function resolveBrand(args: {
  slug: string
  pbClient: Record<string, unknown> | null
  planClient: Record<string, unknown> | null
}): PublicBrand {
  const { slug, pbClient, planClient } = args
  return {
    name: str(pbClient?.name) || str(planClient?.name),
    handle: str(planClient?.handle) || `@${slug}`,
    logoInitials:
      str(pbClient?.logoInitials) || str(planClient?.logoInitials) || slug.slice(0, 2).toUpperCase(),
  }
}
