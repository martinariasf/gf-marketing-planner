// RFC 7807 problem+json helper.

import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export interface Problem {
  type?: string
  title: string
  status: ContentfulStatusCode
  detail?: string
  instance?: string
  [k: string]: unknown
}

export function problem(c: Context, p: Problem) {
  c.header('Content-Type', 'application/problem+json')
  return c.json({ type: 'about:blank', ...p }, p.status)
}
