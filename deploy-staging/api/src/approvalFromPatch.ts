// GF-73 — agent status PATCHes must move the visible lane. The dashboard's
// displayed lane prefers approval.status (laneFor in app-v2/post-status.ts),
// and buildPost stamps approval.status from the latest approvals_v2 row. The
// dashboard's own status selector writes such a row (POST /approvals), but an
// agent PATCH only wrote a posts_patches overlay — so for any post with
// approval history, the agent's change was invisible no matter how often the
// calendar was reloaded. This maps a PATCHed status onto the approval decision
// the PATCH handler must additionally record.

import { APPROVAL_DECISIONS } from './schemas/post.js'

export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number]

const DECISION_SET: ReadonlySet<string> = new Set(APPROVAL_DECISIONS)

/**
 * The approvals_v2 decision a status PATCH implies, or null when nothing must
 * be recorded: the status is not a settable workflow key (published/deleted/
 * junk), or it already equals the post's displayed lane (idempotent PATCH —
 * a duplicate row would only add noise to the approvals history).
 */
export function approvalDecisionForPatch(
  current: { status?: unknown; approval?: { status?: unknown } },
  finalStatus: unknown,
): ApprovalDecision | null {
  if (typeof finalStatus !== 'string' || !DECISION_SET.has(finalStatus)) return null
  // Mirror laneFor's precedence: the approval overlay wins over raw status.
  const approvalStatus = current.approval?.status
  const lane = typeof approvalStatus === 'string' ? approvalStatus : current.status
  if (lane === finalStatus) return null
  return finalStatus as ApprovalDecision
}
