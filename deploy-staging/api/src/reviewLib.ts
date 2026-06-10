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
  codeHash: string
  status: 'active' | 'revoked'
  expiresAt?: string
  createdBy?: string
  createdAt?: string
  revokedAt?: string
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

export interface PublicPost {
  id: string
  date: string
  channel?: string
  format?: string
  pillar?: string
  campaign?: string
  title: string
  copy?: string
  hashtags?: string[]
  cta?: string
  image?: string
  slides?: Array<{ image: string; caption?: string }>
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
  if (typeof post.channel === 'string') out.channel = post.channel
  if (typeof post.format === 'string') out.format = post.format
  if (typeof post.pillar === 'string') out.pillar = post.pillar
  if (typeof post.campaign === 'string') out.campaign = post.campaign
  if (typeof post.copy === 'string') out.copy = post.copy
  if (typeof post.cta === 'string') out.cta = post.cta
  if (typeof post.image === 'string') out.image = post.image
  if (Array.isArray(post.hashtags)) {
    out.hashtags = post.hashtags.filter((h): h is string => typeof h === 'string')
  }
  if (Array.isArray(post.slides)) {
    out.slides = post.slides
      .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
      .filter((s) => typeof s.image === 'string')
      .map((s) => {
        const slide: { image: string; caption?: string } = { image: s.image as string }
        if (typeof s.caption === 'string') slide.caption = s.caption
        return slide
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
