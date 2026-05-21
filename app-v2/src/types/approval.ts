export type ApprovalAction = 'approve' | 'reject' | 'block' | 'unblock'

export interface ApprovalLogEntry {
  ts: string
  action: ApprovalAction
  postId: string
  actor: string
  via: string
  note?: string
  reason?: string
}

export function parseApprovalLog(raw: string): ApprovalLogEntry[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map(parseApprovalLine)
    .filter((x): x is ApprovalLogEntry => x !== null)
}

function parseApprovalLine(line: string): ApprovalLogEntry | null {
  const match = line.match(
    /^(\S+)\s+(approve|reject|block|unblock)\s+(\S+)\s+(\S+)\s+(.*)$/,
  )
  if (!match) return null
  const [, ts, action, postId, actor, rest] = match

  const entry: ApprovalLogEntry = {
    ts,
    action: action as ApprovalAction,
    postId,
    actor,
    via: 'unknown',
  }

  // rest is space-separated key=value or key="quoted value" pairs
  const kvRegex = /(\w+)=(?:"([^"]*)"|(\S+))/g
  let m: RegExpExecArray | null
  while ((m = kvRegex.exec(rest))) {
    const key = m[1]
    const value = m[2] ?? m[3]
    if (key === 'via') entry.via = value
    else if (key === 'note') entry.note = value
    else if (key === 'reason') entry.reason = value
  }

  return entry
}
