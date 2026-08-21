// Friendly, localized copy for the agent's NON-LLM messages.
//
// Why this exists: when a run never reaches the model (the LLM call itself
// failed — e.g. OpenRouter daily quota exhausted) or ends without a final
// reply, the dashboard chat used to surface the RAW provider error in English
// (e.g. "402 ... daily limit exceeded"). The model never sees that text, so the
// agent's own LANGUAGE RULE can't translate it, and Hermes' built-in i18n
// deliberately excludes error tracebacks. So the relay (chat.ts) must produce
// these strings itself — that is what this module is for (GF-59 / GF-61).
//
// `classify()` maps a raw provider/Hermes error into a stable MessageKey;
// `message()` renders that key in the client's language. The classifier
// patterns mirror Hermes' own agent/error_classifier.py so the dashboard and a
// future Telegram gateway hook bucket the same error the same way.

export type Lang = 'es' | 'de' | 'en'

export const SUPPORTED_LANGS: readonly Lang[] = ['es', 'de', 'en'] as const

/** Normalize an arbitrary language hint to a supported Lang (default 'en'). */
export function normalizeLang(value: string | null | undefined): Lang {
  const key = (value ?? '').trim().toLowerCase()
  if (key === 'es' || key.startsWith('es-') || key === 'spanish' || key === 'español' || key === 'espanol') return 'es'
  if (key === 'de' || key.startsWith('de-') || key === 'german' || key === 'deutsch') return 'de'
  return 'en'
}

export type MessageKey =
  | 'quota_exhausted' // billing / credits / daily limit — won't recover until reset/top-up
  | 'rate_limited' // transient throttle — retry shortly
  | 'timed_out' // run exceeded our hard timeout before a final reply
  | 'run_failed' // generic unrecoverable failure (safe default)
  | 'no_final_text' // run completed but the agent sent no final text
  | 'completed_with_writes' // completed, dashboard updated, but no final text
  | 'stream_ended' // event stream ended after tool activity, before a reply
  | 'output_truncated' // response hit the model's output-length limit mid-reply (GF-100)

// Pattern → key. Order matters: quota/billing is checked before generic rate
// limits because some 402s read as both. Lower-cased haystack is matched.
//
// [GF-100 Layer-5 round-2] These used to be plain substrings matched via
// `.includes()` — worse than the Python side's regex, because `.includes()`
// has *no* word-boundary option at all. That let unrelated words swallow a
// pattern as a substring: 'quota' matched inside "quotation", 'billing'
// matched inside "Billington", 'key limit' matched inside "monkey limit" /
// "turkey limit", 'payment required' matched inside "overpayment required".
// Converted to \b-bounded regexes so this classifier makes the same call as
// the Telegram-side one in
// deploy-prod/gf-innov-agent/patches/patch_localized_errors.py
// (_GF_QUOTA_ERROR_PATTERN) — same provider error must not read one way on
// the dashboard and another way on Telegram (GF-100 acceptance criterion 4).
// Keep the two lists in sync if either changes.
const QUOTA_PATTERNS: RegExp[] = [
  /\b402\b/,
  /\bpayment\s+required\b/,
  /\binsufficient\s+credits?\b/, // matches "insufficient credit(s)"
  /\binsufficient_quota\b/,
  /\binsufficient\s+balances?\b/,
  /\bdaily\s+limit\b/,
  /\bexceeded\s+your\s+current\s+quota\b/,
  /\bcredits?\s+have\s+been\s+exhausted\b/,
  /\bbilling\b/,
  /\bquota\b/, // any "quota exceeded/reached" → daily-limit copy (GF-59 intent).
  // [GF-100 Layer-5 round-3] `\bquota\b` does NOT match "quota_exceeded" —
  // `\b` never fires between two \w chars, and `_` is \w. Verified 2026-08-07
  // via read-only SSH that this underscore form is a real provider string:
  // /opt/hermes/agent/auxiliary_client.py's `_is_payment_error` keyword list
  // includes the literal "quota_exceeded" substring (next to "quota
  // exceeded") to catch Vertex AI/Bedrock daily-quota error text. No
  // near-miss risk: both boundaries land on non-\w chars.
  /\bquota_exceeded\b/,
  // OpenRouter's 403 "Key limit exceeded" (GF-100) is billing, not auth — see
  // agent/error_classifier.py on the box, which buckets it as FailoverReason.billing
  // for the same reason. Deliberately NOT a bare '403': that would swallow
  // unrelated auth failures that also carry a 403 status.
  /\bkey\s+limit\b/,
  // Checked before RATE_LIMIT, so a quota-flavoured error gets the "come back
  // tomorrow" message rather than the transient "try again shortly" one.
]

const RATE_LIMIT_PATTERNS = [
  '429',
  'rate limit',
  'rate_limit',
  'too many requests',
  'resource_exhausted',
  'throttled',
]

/**
 * Classify a raw provider/Hermes error string into a stable MessageKey.
 * Unrecognized input returns 'run_failed' so the caller always has safe copy.
 */
export function classify(rawError: string | null | undefined): MessageKey {
  const hay = (rawError ?? '').toLowerCase()
  if (!hay.trim()) return 'run_failed'
  if (QUOTA_PATTERNS.some((p) => p.test(hay))) return 'quota_exhausted'
  if (RATE_LIMIT_PATTERNS.some((p) => hay.includes(p))) return 'rate_limited'
  return 'run_failed'
}

// Localized copy. Plain language, no tool names / codes / tracebacks.
const CATALOG: Record<MessageKey, Record<Lang, string>> = {
  quota_exhausted: {
    es: 'Has alcanzado el límite de uso de hoy. Los créditos se renuevan a medianoche — ¡hablamos mañana!',
    de: 'Du hast das heutige Nutzungslimit erreicht. Das Guthaben wird um Mitternacht zurückgesetzt — bis morgen!',
    en: "You've reached today's usage limit. Credits renew at midnight — talk tomorrow!",
  },
  rate_limited: {
    es: 'Estoy recibiendo muchas peticiones a la vez. Espera un momento y vuelve a intentarlo.',
    de: 'Es kommen gerade zu viele Anfragen gleichzeitig. Bitte einen Moment warten und erneut versuchen.',
    en: "I'm getting a lot of requests at once. Give it a moment and try again.",
  },
  timed_out: {
    es: 'Esto tardó más de lo esperado y no llegué a responder. Revisa el panel por si quedó algo a medias.',
    de: 'Das hat länger gedauert als erwartet, daher kam keine Antwort. Schau im Dashboard, ob etwas angefangen wurde.',
    en: 'This took longer than expected, so I didn’t get to reply. Check the dashboard for anything left in progress.',
  },
  run_failed: {
    es: 'Algo salió mal y no pude terminar. Vuelve a intentarlo en un momento.',
    de: 'Etwas ist schiefgelaufen und ich konnte es nicht abschließen. Bitte versuche es gleich noch einmal.',
    en: "Something went wrong and I couldn't finish. Please try again in a moment.",
  },
  no_final_text: {
    es: 'Terminé, pero no llegué a escribir una respuesta. Si no ves el cambio, recarga el panel.',
    de: 'Ich bin fertig, habe aber keine Antwort geschrieben. Falls du die Änderung nicht siehst, lade das Dashboard neu.',
    en: 'I finished, but didn’t send a written reply. If you don’t see the change, refresh the dashboard.',
  },
  completed_with_writes: {
    es: 'Listo: actualicé el panel, aunque no llegué a escribir una respuesta. Recárgalo para ver los cambios.',
    de: 'Erledigt: Ich habe das Dashboard aktualisiert, aber keine Antwort geschrieben. Lade es neu, um die Änderungen zu sehen.',
    en: 'Done — I updated the dashboard but didn’t write a reply. Refresh it to see the changes.',
  },
  stream_ended: {
    es: 'Estuve trabajando en tu pedido, pero se cortó la conexión antes de responder. Si no ves el cambio, recarga el panel.',
    de: 'Ich habe an deiner Anfrage gearbeitet, aber die Verbindung brach vor der Antwort ab. Falls du die Änderung nicht siehst, lade das Dashboard neu.',
    en: 'I was working on your request, but the connection dropped before I replied. If you don’t see the change, refresh the dashboard.',
  },
  output_truncated: {
    es: 'La respuesta se hizo demasiado larga y no pude terminarla. Pídemelo por partes más pequeñas.',
    de: 'Die Antwort wurde zu lang und ich konnte sie nicht fertigstellen. Bitte frag mich in kleineren Teilen.',
    en: 'The response got too long and I couldn’t finish it. Try asking me in smaller parts.',
  },
}

/** Render a MessageKey in the given language (falls back to English). */
export function message(key: MessageKey, lang: Lang): string {
  const row = CATALOG[key]
  return row[lang] ?? row.en
}

/** Convenience: classify a raw error and render it in one call. */
export function friendlyError(rawError: string | null | undefined, lang: Lang): string {
  return message(classify(rawError), lang)
}
