// Audit log writes.
//
// Every state-changing API call appends one row to the `audit` PB collection.
// This is staging's replacement for the per-turn git-commit pattern Viktor uses
// in production: a tamper-evident trail of who changed what, when.

import { withPb } from './pb.js'
import type { TokenPrincipal } from './auth.js'

export interface AuditEntry {
  /** Action verb, e.g. "brief.update", "approval.create", "post.patch". */
  action: string
  /** Client slug the change applied to. */
  slug: string
  /** Optional resource id (e.g. post id). */
  resourceId?: string
  /** JSON snapshot of the value before the change. */
  before?: unknown
  /** JSON snapshot of the value after the change. */
  after?: unknown
  /** Free-form note (e.g. reject reason). */
  note?: string
}

export async function audit(principal: TokenPrincipal, entry: AuditEntry): Promise<void> {
  try {
    await withPb((pb) =>
      pb.collection('audit').create({
        actor: principal.label ?? principal.token.slice(0, 12),
        role: principal.role,
        action: entry.action,
        slug: entry.slug,
        resourceId: entry.resourceId ?? '',
        before: entry.before ?? null,
        after: entry.after ?? null,
        note: entry.note ?? '',
      }),
    )
  } catch (err) {
    // Audit failures must not break the request. Surface them in logs so we
    // notice, but the user's action still succeeds.
    console.error('[audit] write failed', { entry, err })
  }
}
