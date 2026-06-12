// GF-17 — export the visible content calendar as PDF or Word.
//
// Deliberately client-side and dependency-free:
//   - PDF  : render a clean print stylesheet into a hidden iframe and invoke the
//            browser's print dialog ("Save as PDF"). Works everywhere, no libs.
//   - Word : emit a Word-compatible MHTML document (.doc) and download it.
//            Word opens it as a normal editable document.
//
// Both serialize exactly the posts the caller passes in — i.e. the currently
// visible calendar range (month/quarter) — including per-post date, channel,
// format, pillar, title, copy AND the post pictures (cover image; carousels
// add a strip of all slides). Images are fetched and embedded so the document
// is self-contained: data URIs for the PDF print frame, base64 MIME parts
// (MHTML) for Word — Word does not reliably render linked or data: images.
// A picture that cannot be fetched simply falls back to the text-only row.

import type { Post } from '@/types'
import { monthsInRange, monthKeyFromIso, type CalendarRangeConfig } from '@/lib/planning-range'

export interface CalendarExportInput {
  clientName: string
  range: CalendarRangeConfig
  posts: Post[]
  /** Localized labels so the export matches the dashboard language. */
  labels: {
    title: string // e.g. "Content calendar"
    rangeLabel: string // e.g. "Jun 2026 – Aug 2026"
    date: string
    channel: string
    format: string
    pillar: string
    post: string
    copy: string
    noPosts: string
    generatedOn: string
  }
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Group the posts by the months of the range, in range order. */
function groupByMonth(input: CalendarExportInput) {
  const months = monthsInRange(input.range)
  return months.map((m) => ({
    label: m.label,
    name: m.name,
    posts: input.posts
      .filter((p) => monthKeyFromIso(p.date) === m.key)
      .sort((a, b) => a.date.localeCompare(b.date)),
  }))
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ── Image embedding ───────────────────────────────────────────────────────────

interface EmbeddedImage {
  /** Absolute URL — doubles as the MHT Content-Location. */
  url: string
  contentType: string
  base64: string
}

function absolute(url: string): string {
  try {
    return new URL(url, window.location.href).href
  } catch {
    return url
  }
}

/** Cover + (for carousels) every slide. */
function postImageUrls(p: Post): string[] {
  const urls: string[] = []
  const cover = p.image || p.slides?.[0]?.image
  if (cover) urls.push(cover)
  if (p.slides && p.slides.length > 1) for (const s of p.slides) urls.push(s.image)
  return urls
}

/**
 * Fetch every unique post image and base64-encode it. Failures are skipped —
 * the affected post just exports without its picture.
 */
async function fetchImages(input: CalendarExportInput): Promise<Map<string, EmbeddedImage>> {
  const unique = [...new Set(input.posts.flatMap(postImageUrls).filter(Boolean).map(absolute))]
  const out = new Map<string, EmbeddedImage>()
  await Promise.all(
    unique.map(async (url) => {
      try {
        const res = await fetch(url, { credentials: 'same-origin' })
        if (!res.ok) return
        const blob = await res.blob()
        const contentType = blob.type || 'image/png'
        if (!contentType.startsWith('image/')) return
        const base64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader()
          r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
          r.onerror = () => reject(new Error('read failed'))
          r.readAsDataURL(blob)
        })
        if (base64) out.set(url, { url, contentType, base64 })
      } catch {
        /* skip — post exports text-only */
      }
    }),
  )
  return out
}

/** How an <img src> should be written for the chosen output format. */
type ImageSrcMode = 'data-uri' | 'content-location'

function imgSrc(img: EmbeddedImage, mode: ImageSrcMode): string {
  return mode === 'data-uri' ? `data:${img.contentType};base64,${img.base64}` : img.url
}

// ── Document body ─────────────────────────────────────────────────────────────

/** The shared document body — same markup for PDF and Word. */
function buildBody(
  input: CalendarExportInput,
  images: Map<string, EmbeddedImage>,
  mode: ImageSrcMode,
): string {
  const groups = groupByMonth(input)
  const totalPosts = groups.reduce((n, g) => n + g.posts.length, 0)
  const L = input.labels

  const pictureHtml = (p: Post): string => {
    const cover = p.image || p.slides?.[0]?.image
    const coverImg = cover ? images.get(absolute(cover)) : undefined
    const slideImgs =
      p.slides && p.slides.length > 1
        ? p.slides.map((s) => images.get(absolute(s.image))).filter((x): x is EmbeddedImage => !!x)
        : []
    if (!coverImg && slideImgs.length === 0) return ''
    const coverPart = coverImg
      ? `<div class="pimg"><img src="${imgSrc(coverImg, mode)}" width="260" alt=""/></div>`
      : ''
    // For carousels show every slide as a thumbnail (the cover is slide 1, so
    // skip it in the strip when it embedded fine).
    const strip =
      slideImgs.length > 1
        ? `<div class="slides">${slideImgs
            .slice(coverImg ? 1 : 0)
            .map((s) => `<img src="${imgSrc(s, mode)}" height="72" alt=""/>`)
            .join('')}</div>`
        : ''
    return coverPart + strip
  }

  const sections = groups
    .map((g) => {
      if (g.posts.length === 0) {
        return `<h2>${esc(g.label)}</h2><p class="empty">${esc(L.noPosts)}</p>`
      }
      const rows = g.posts
        .map(
          (p) => `
          <tr>
            <td class="meta">
              <div class="d">${esc(fmtDate(p.date))}</div>
              <div class="t">${esc(p.channel)} · ${esc(p.format)}</div>
              ${p.pillar ? `<div class="p">${esc(p.pillar)}</div>` : ''}
            </td>
            <td class="body">
              <div class="ptitle">${esc(p.title)}</div>
              ${pictureHtml(p)}
              ${p.copy ? `<div class="pcopy">${esc(p.copy).replace(/\n/g, '<br/>')}</div>` : ''}
              ${
                p.hashtags && p.hashtags.length
                  ? `<div class="tags">${p.hashtags.map((h) => esc(h)).join(' ')}</div>`
                  : ''
              }
              ${p.cta ? `<div class="cta">${esc(p.cta)}</div>` : ''}
            </td>
          </tr>`,
        )
        .join('')
      return `<h2>${esc(g.label)}</h2>
        <table class="posts">
          <thead><tr><th class="meta">${esc(L.date)} · ${esc(L.channel)} · ${esc(L.format)} · ${esc(
            L.pillar,
          )}</th><th class="body">${esc(L.post)} · ${esc(L.copy)}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`
    })
    .join('')

  return `
    <div class="doc">
      <header class="dochead">
        <h1>${esc(input.clientName)} — ${esc(L.title)}</h1>
        <p class="sub">${esc(L.rangeLabel)} · ${totalPosts} ${esc(L.post.toLowerCase())} · ${esc(
          L.generatedOn,
        )} ${esc(fmtDate(new Date().toISOString()))}</p>
      </header>
      ${sections}
    </div>`
}

const STYLES = `
  * { box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; color: #1c2733; margin: 24px; }
  .doc { max-width: 920px; margin: 0 auto; }
  .dochead h1 { font-size: 22px; color: #14426b; margin: 0 0 4px; }
  .dochead .sub { color: #5a6b7b; font-size: 12px; margin: 0 0 18px; }
  h2 { font-size: 15px; color: #14426b; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; margin: 22px 0 8px; }
  table.posts { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  table.posts th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #5a6b7b; border-bottom: 1px solid #cbd5e1; padding: 4px 8px; }
  table.posts td { vertical-align: top; padding: 8px; border-bottom: 1px solid #eef2f6; page-break-inside: avoid; }
  td.meta { width: 30%; font-size: 11px; color: #5a6b7b; }
  td.meta .d { font-weight: 700; color: #1c2733; }
  td.meta .p { margin-top: 3px; color: #14426b; }
  td.body .ptitle { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
  td.body .pimg { margin: 4px 0 6px; }
  td.body .pimg img { max-width: 260px; height: auto; border: 1px solid #e2e8f0; }
  td.body .slides { margin: 2px 0 6px; }
  td.body .slides img { height: 72px; width: auto; margin: 0 4px 4px 0; border: 1px solid #e2e8f0; }
  td.body .pcopy { font-size: 12px; line-height: 1.45; white-space: normal; }
  td.body .tags { font-size: 11px; color: #14426b; margin-top: 4px; }
  td.body .cta { font-size: 11px; font-weight: 600; margin-top: 4px; }
  p.empty { font-size: 12px; color: #94a3b8; font-style: italic; }
`

function fullHtml(
  input: CalendarExportInput,
  images: Map<string, EmbeddedImage>,
  forWord: boolean,
): string {
  const head = forWord
    ? `<head><meta charset="utf-8"><title>${esc(input.clientName)} — ${esc(
        input.labels.title,
      )}</title><style>${STYLES}</style></head>`
    : `<head><meta charset="utf-8"><title>${esc(input.clientName)} — ${esc(
        input.labels.title,
      )}</title><style>${STYLES} @page { margin: 16mm; }</style></head>`
  const ns = forWord
    ? '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'
    : '<html>'
  const body = buildBody(input, images, forWord ? 'content-location' : 'data-uri')
  return `<!DOCTYPE html>${ns}${head}<body>${body}</body></html>`
}

// ── MHTML (Word) ─────────────────────────────────────────────────────────────

const MHT_BOUNDARY = '----=_NextPart_GF17_CalendarExport'

function wrap76(s: string): string {
  const lines: string[] = []
  for (let i = 0; i < s.length; i += 76) lines.push(s.slice(i, i + 76))
  return lines.join('\r\n')
}

/**
 * Word renders embedded images only from multipart documents: the HTML part
 * references each image by URL and a sibling MIME part carries the bytes with
 * a matching Content-Location.
 */
function buildMht(html: string, images: EmbeddedImage[]): string {
  const parts = [
    `MIME-Version: 1.0`,
    `Content-Type: multipart/related; type="text/html"; boundary="${MHT_BOUNDARY}"`,
    ``,
    `--${MHT_BOUNDARY}`,
    `Content-Type: text/html; charset="utf-8"`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    html,
  ]
  for (const img of images) {
    parts.push(
      ``,
      `--${MHT_BOUNDARY}`,
      `Content-Type: ${img.contentType}`,
      `Content-Transfer-Encoding: base64`,
      `Content-Location: ${img.url}`,
      ``,
      wrap76(img.base64),
    )
  }
  parts.push(``, `--${MHT_BOUNDARY}--`, ``)
  return parts.join('\r\n')
}

function safeName(input: CalendarExportInput, ext: string): string {
  const base = `${input.clientName}-content-calendar-${input.range.startMonth}_${input.range.endMonth}`
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
  return `${base}.${ext}`
}

// ── Entry points ─────────────────────────────────────────────────────────────

/** Print-to-PDF via a transient hidden iframe (no popup window to be blocked). */
export async function exportCalendarPdf(input: CalendarExportInput): Promise<void> {
  const images = await fetchImages(input)

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) {
    document.body.removeChild(iframe)
    throw new Error('Print frame unavailable')
  }
  doc.open()
  doc.write(fullHtml(input, images, false))
  doc.close()

  const cleanup = () => {
    // Give the print dialog time to read the frame before removing it.
    setTimeout(() => iframe.parentNode && iframe.parentNode.removeChild(iframe), 1000)
  }
  const win = iframe.contentWindow!
  win.onafterprint = cleanup

  // Data URIs decode locally, but still wait until every <img> has settled
  // (capped at 3s) so the print snapshot includes them.
  const settled = Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve()
            img.onerror = () => resolve()
          }),
    ),
  )
  await Promise.race([settled, new Promise((r) => setTimeout(r, 3000))])

  setTimeout(() => {
    win.focus()
    win.print()
    // Fallback cleanup in case onafterprint never fires (some browsers).
    setTimeout(cleanup, 60_000)
  }, 250)
}

/** Download a Word-openable .doc document (MHTML with embedded images). */
export async function exportCalendarWord(input: CalendarExportInput): Promise<void> {
  const images = await fetchImages(input)
  const html = fullHtml(input, images, true)
  const mht = buildMht(html, [...images.values()])
  const blob = new Blob([mht], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeName(input, 'doc')
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
