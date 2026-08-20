---
name: gf-doc-deliverables
description: Producing on-brand .docx (or PDF) DOCUMENT deliverables for GF — strategy docs, value-proposition / offer proposals, one-pagers, internal reports that Pilar and Martin review and edit. Use whenever the ask is a downloadable formatted document (not a social post, not a dashboard post). Covers the GF visual identity applied to python-docx, a ready-to-run generator scaffold, the venv install recipe, and delivery via MEDIA in chat.
tags: [gf, docx, deliverable, strategy, proposal, report]
---

# GF document deliverables (.docx on-brand)

For GF Innovative Solutions / Viktor. Use when Pilar or Martin ask for a
**formatted document** they can open, review and edit: estrategia, propuesta de
valor / oferta, one-pager, informe interno. This is NOT social copy (see
`copywriting`) and NOT a dashboard post.

## Pitfalls learned (read first)

- **No `pip` on this box, and `/opt/hermes/.venv` is now read-only** — installing
  into it fails with Permission denied. Create a project venv once under the
  writable output dir and run every generator with it:
  ```bash
  uv venv /opt/data/gf_docs/.venv -q
  VIRTUAL_ENV=/opt/data/gf_docs/.venv uv pip install python-docx reportlab pymupdf -q
  /opt/data/gf_docs/.venv/bin/python3 -c "import docx, reportlab, fitz; print('OK')"
  ```
- **For PDFs, the reportlab origin is BOTTOM-LEFT.** Every layout error I made
  this session (elements landing off-page, floats-as-y crashes) came from
  treating y as top-down. Compute y from the top: `y = H - <distance from top>`,
  and pass ints (or round floats) to drawString.
- **Cannot write under `/opt/hermes`** (read-only for the agent). Write generator
  scripts and output under `/opt/data/gf_docs/` (create it, it's writable).
- **Drive is read-only** for the service account (`viktor-gf@ki-sync`, 403 on
  write). Deliver the finished file in chat with `MEDIA:/abs/path.docx`. Don't
  promise Drive upload until Martín enables a Shared Drive.
- **Source material lives in past sessions, not on disk.** Uploaded PDFs in
  `/opt/data/cache/documents/` get purged over time. If the user references a
  document they sent earlier (e.g. "Pains and Gains", "charla con el experto"),
  recover its literal text with `session_search` (role_filter='tool' to find the
  PDF-extraction tool output) instead of asking them to re-send.
- **Read the brand voice before writing a single line.** Load the `copywriting`
  skill rules: no em dashes / spaced-hyphen pauses, no "not X but Y", no banned
  buzzwords, vary sentence length. A document is long-form copy and the same
  hard rules apply.

## GF visual identity for documents

Palette (from the brief `branding.colors`):
- Charcoal `#1a1a1a` — body text, dark callout boxes
- Green Bright `#22c55e` — kickers, H2 headings, accent rules, ONE keyword
- Slate `#64748b` / Slate Light `#94a3b8` — subtitles, footers
- White `#ffffff` — text inside dark callouts

Layout conventions that read as GF:
- Cover: green uppercase kicker → big charcoal title → slate subtitle → thick
  green horizontal rule → tiny slate-light metadata line.
- H1 sections: bold charcoal + thin green underline rule.
- H2 subsections: bold green.
- Dark charcoal callout boxes (single-cell shaded table) for the one or two
  ideas that must land — green mini-title + white body.
- Numbered lists where there's a sequence; bold lead-in phrase + normal text.

## Workflow

1. Recover / confirm source material and the user's confirmed decisions
   (audience, offer, price floors, milestone, language) via `session_search`.
2. Read the brief (`GET /clients/$CLIENT_SLUG/brief`) for tone + palette + logos.
3. Ensure deps are installed in the project venv (recipe above).
4. Pick the format:
   - **Editable draft (.docx, default)** — copy `scripts/gf_docx_scaffold.py`
     into `/opt/data/gf_docs/`, fill the CONTENIDO section, run it with
     `/opt/data/gf_docs/.venv/bin/python3`.
   - **Send-ready polished PDF** (mail adjuntos, one-pagers, invitations the
     client forwards as-is) — copy `scripts/gf_pdf_scaffold.py` instead and
     build with reportlab.
5. **PDF QA loop (always, before delivery):** render every page to PNG with
   pymupdf (`fitz`) at ~110 dpi, vision-check each page for cut-offs,
   overlaps and off-page elements, fix, re-render. Text is NOT wrapped
   automatically in reportlab — use the scaffold's `wrap()`/`para()` helpers
   or you will ship single-line overflows.
6. Deliver in chat: `MEDIA:/opt/data/gf_docs/<file>` + a short bulleted
   summary of what's inside, and ask for green-light before the next document
   in a multi-doc series.

## Reusable scaffolds

`scripts/gf_docx_scaffold.py` — a known-good python-docx generator with the full
GF helper set (cover, h1/h2, para, bullet, numbered, dark callout, green rules).
Reproduce it with modifications: keep the helpers, replace the CONTENIDO block.

`scripts/gf_pdf_scaffold.py` — reportlab equivalent for send-ready PDFs:
header band, green rule, wrapped paragraphs, light/dark boxes, section titles
for continuation pages, footer. Same rule: keep helpers, replace CONTENIDO.
Run its built-in pymupdf QA snippet before delivering.
