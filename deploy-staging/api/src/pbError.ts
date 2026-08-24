// GF-110 — translate a PocketBase SDK error into something a human can act on.
//
// The SDK's ClientResponseError.message is always the same useless sentence
// ("Failed to create record."); the part that says WHICH field and WHY lives in
// `response.data`, keyed by field name:
//
//   { summary: { code: 'validation_max_text_constraint',
//                message: 'Must be no more than 5000 character(s).' } }
//
// The unhandled-error handler used to report only `.message` with a blanket 500,
// so a plain validation failure reached the dashboard as an unactionable
// "Failed to create record" — which is exactly how GF-110 stayed unexplained.

import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** A PB field-level validation entry. */
interface FieldError {
  code?: unknown
  message?: unknown
}

export interface PbErrorSummary {
  /** PB's own HTTP status, passed through so a 403/404 does not become a 400. */
  status: ContentfulStatusCode
  title: string
  detail: string
  /** Field name -> reason, for callers that want the structured form. */
  fields: Record<string, string>
}

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  429: 'Too Many Requests',
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** Recognise a PocketBase ClientResponseError by shape rather than by
 *  `instanceof` — the SDK class is not exported from every entry point, and a
 *  structural check keeps this testable without constructing a real one. */
export function asPbError(err: unknown): PbErrorSummary | null {
  if (!isRecord(err)) return null
  const status = err.status
  const response = err.response
  if (typeof status !== 'number' || status < 400 || status > 599) return null
  if (!isRecord(response)) return null

  const data = isRecord(response.data) ? response.data : {}
  const fields: Record<string, string> = {}
  for (const [name, raw] of Object.entries(data)) {
    if (!isRecord(raw)) continue
    const fe = raw as FieldError
    const message = typeof fe.message === 'string' ? fe.message : null
    if (message) fields[name] = message
  }

  const baseMessage =
    typeof response.message === 'string' && response.message
      ? response.message
      : typeof err.message === 'string'
        ? err.message
        : 'PocketBase request failed'

  // "summary: Must be no more than 5000 character(s)." beats the bare sentence.
  const fieldPart = Object.entries(fields)
    .map(([name, message]) => `${name}: ${message}`)
    .join('; ')

  // A 5xx from PB is our problem, not the caller's — report it as a 500 so
  // clients do not retry a request that was never malformed.
  const outStatus: ContentfulStatusCode = status < 500 ? (status as ContentfulStatusCode) : 500
  return {
    status: outStatus,
    title: TITLES[outStatus] ?? (outStatus < 500 ? 'Bad Request' : 'Internal Server Error'),
    // Deliberately excludes err.url: it carries the internal PB hostname/port.
    detail: fieldPart ? `${baseMessage} (${fieldPart})` : baseMessage,
    fields,
  }
}
