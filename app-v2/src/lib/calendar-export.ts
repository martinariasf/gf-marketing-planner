// GF-17 — export the visible content calendar as PDF or Word.
//
// Deliberately client-side and dependency-free:
//   - PDF  : render a clean print stylesheet into a hidden iframe and invoke the
//            browser's print dialog ("Save as PDF"). Works everywhere, no libs.
//   - Word : emit a Word-compatible HTML document (application/msword) and
//            download it. Word opens it as a normal editable document.
//
// Both serialize exactly the posts the caller passes in — i.e. the currently
// visible calendar range (month/quarter) — including per-post date, channel,
// format, pillar, title and copy, grouped by month.

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

/** The shared document body — same markup for PDF and Word. */
function buildBody(input: CalendarExportInput): string {
  const groups = groupByMonth(input)
  const totalPosts = groups.reduce((n, g) => n + g.posts.length, 0)
  const L = input.labels

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
  td.body .pcopy { font-size: 12px; line-height: 1.45; white-space: normal; }
  td.body .tags { font-size: 11px; color: #14426b; margin-top: 4px; }
  td.body .cta { font-size: 11px; font-weight: 600; margin-top: 4px; }
  p.empty { font-size: 12px; color: #94a3b8; font-style: italic; }
`

function fullHtml(input: CalendarExportInput, forWord: boolean): string {
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
  return `<!DOCTYPE html>${ns}${head}<body>${buildBody(input)}</body></html>`
}

function safeName(input: CalendarExportInput, ext: string): string {
  const base = `${input.clientName}-content-calendar-${input.range.startMonth}_${input.range.endMonth}`
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
  return `${base}.${ext}`
}

/** Print-to-PDF via a transient hidden iframe (no popup window to be blocked). */
export function exportCalendarPdf(input: CalendarExportInput): void {
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
  doc.write(fullHtml(input, false))
  doc.close()

  const cleanup = () => {
    // Give the print dialog time to read the frame before removing it.
    setTimeout(() => iframe.parentNode && iframe.parentNode.removeChild(iframe), 1000)
  }
  const win = iframe.contentWindow!
  win.onafterprint = cleanup
  // Wait a tick so layout/images settle before printing.
  setTimeout(() => {
    win.focus()
    win.print()
    // Fallback cleanup in case onafterprint never fires (some browsers).
    setTimeout(cleanup, 60_000)
  }, 250)
}

/** Download a Word-openable .doc document. */
export function exportCalendarWord(input: CalendarExportInput): void {
  const html = fullHtml(input, true)
  const blob = new Blob(['﻿', html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeName(input, 'doc')
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
