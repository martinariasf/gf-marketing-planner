import type { Channel } from '@/types'
import { cn } from '@/lib/utils'

// Single source of truth for social-network brand glyphs, labels and tints.
// lucide-react ships no social icons, so each network is a hand-traced path with
// fill="currentColor"; CHANNEL_COLOR drives the brand tint. Previously these maps
// were duplicated in routes/client/context.tsx and components/kpi-card.tsx — keep
// the paths byte-identical to those originals so nothing shifts visually. (GF-20)

export const CHANNEL_ORDER: Channel[] = ['linkedin', 'instagram', 'facebook', 'x', 'tiktok']

/**
 * The networks a post targets. GF-20: posts may carry a `channels` array; legacy
 * posts only have the single `channel`. Always returns at least one network,
 * de-duplicated and ordered by CHANNEL_ORDER for stable rendering.
 */
export function effectiveChannels(post: { channel: Channel; channels?: Channel[] }): Channel[] {
  const list = post.channels && post.channels.length > 0 ? post.channels : [post.channel]
  const seen = new Set(list)
  return CHANNEL_ORDER.filter((c) => seen.has(c))
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  linkedin:  'LinkedIn',
  instagram: 'Instagram',
  facebook:  'Facebook',
  x:         'X',
  tiktok:    'TikTok',
}

// Tailwind text-color class so the glyph can be tinted via className.
export const CHANNEL_COLOR: Record<Channel, string> = {
  linkedin:  'text-[#0A66C2]',
  instagram: 'text-[#E1306C]',
  facebook:  'text-[#1877F2]',
  x:         'text-foreground',
  tiktok:    'text-foreground',
}

export const CHANNEL_PATHS: Record<Channel, string> = {
  linkedin:
    'M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.8 0 0 .78 0 1.74v20.52C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.74V1.74C24 .78 23.2 0 22.22 0z',
  instagram:
    'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.12 1.38C1.35 2.68.93 3.35.63 4.14c-.3.76-.5 1.64-.56 2.91C.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.12.66.66 1.33 1.08 2.12 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.86 5.86 0 0 0 2.12-1.38 5.86 5.86 0 0 0 1.38-2.12c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.86 5.86 0 0 0-1.38-2.12A5.86 5.86 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-10.84a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z',
  facebook:
    'M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z',
  x: 'M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.46l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3L17.61 20.65z',
  tiktok:
    'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.3 0 .58.04.86.13V9.4a6.33 6.33 0 0 0-.86-.05A6.34 6.34 0 0 0 5.6 20.97a6.34 6.34 0 0 0 10.74-4.58V9.42a8.16 8.16 0 0 0 4.76 1.52V7.49a4.83 4.83 0 0 1-1.51-.8z',
}

/**
 * Brand glyph for a social network. Falls back gracefully (renders nothing) for
 * an unknown/missing channel so a malformed post can never crash a render.
 */
export function ChannelIcon({
  channel,
  className,
  tinted = true,
}: {
  channel: Channel | string | undefined
  className?: string
  /** Apply the brand colour. Set false to inherit the surrounding text colour. */
  tinted?: boolean
}) {
  const key = channel as Channel
  const path = CHANNEL_PATHS[key]
  if (!path) return null
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      role="img"
      aria-label={CHANNEL_LABEL[key]}
      className={cn('h-4 w-4 shrink-0', tinted && CHANNEL_COLOR[key], className)}
    >
      <title>{CHANNEL_LABEL[key]}</title>
      <path d={path} />
    </svg>
  )
}
