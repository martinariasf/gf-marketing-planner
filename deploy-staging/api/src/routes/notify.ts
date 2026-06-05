// Notify-Viktor endpoint.
//
// POST /clients/:slug/notify-viktor records a "viktor.notify" audit event when
// the dashboard user saves platform changes. The dashboard's sync indicator
// reads these events back via GET /clients/:slug/audit?action=viktor.notify so
// users can see "Sent to Víktor · 2 min ago".
//
// Actual Telegram delivery is a later agent-side piece — this route only
// records the intent as an audit row so the UI has something to display.

import { OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'
import { requireAuth, requireScope, requireRole, type AppEnv } from '../auth.js'
import { audit } from '../audit.js'
import { problem } from '../problem.js'

export const notifyRoute = new OpenAPIHono<AppEnv>()
notifyRoute.use('*', requireAuth)

const NotifyBody = z.object({
  summary: z.string().min(1).max(500),
  kind: z.string().optional(),
})

notifyRoute.post(
  '/clients/:slug/notify-viktor',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')

    let body: { summary: string; kind?: string }
    try {
      const raw = await c.req.json()
      const parsed = NotifyBody.safeParse(raw)
      if (!parsed.success) {
        return problem(c, {
          title: 'Unprocessable Entity',
          status: 422,
          detail: parsed.error.issues.map((i) => i.message).join('; '),
        })
      }
      body = parsed.data
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }

    const { summary, kind } = body
    const ts = new Date().toISOString()

    await audit(c.get('principal'), {
      action: 'viktor.notify',
      slug,
      note: summary,
      after: { kind: kind ?? 'change' },
    })

    return c.json({ ok: true, ts })
  },
)
