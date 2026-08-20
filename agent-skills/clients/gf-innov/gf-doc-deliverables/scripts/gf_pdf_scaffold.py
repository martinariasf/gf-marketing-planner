# -*- coding: utf-8 -*-
"""GF branded PDF scaffold (reportlab) - one-pagers, invitations, presentations.

Reproduce with modifications: keep the palette + helpers, replace CONTENIDO.

Setup (once):
  uv venv /opt/data/gf_docs/.venv -q
  VIRTUAL_ENV=/opt/data/gf_docs/.venv uv pip install reportlab pymupdf -q
Run:
  /opt/data/gf_docs/.venv/bin/python3 gf_pdf_scaffold.py
QA (always, before MEDIA delivery) - render pages to PNG and vision-check:
  import fitz
  for i, page in enumerate(fitz.open(OUT)):
      page.get_pixmap(dpi=110).save(f"/opt/data/gf_docs/page_{i+1}.png")
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

# --- GF palette (brief branding.colors) ---
CHARCOAL = HexColor('#1a1a1a')
GREEN = HexColor('#22c55e')
SLATE = HexColor('#64748b')
SLATE_LIGHT = HexColor('#94a3b8')
LIGHT_BG = HexColor('#f1f5f9')
WHITE = HexColor('#ffffff')

W, H = A4  # 595 x 842 pt
M = 54     # margin in pt


def wrap(text, font, size, max_width):
    """Greedy word wrap; returns list of lines that fit max_width."""
    words = text.split()
    lines, cur = [], ''
    for wd in words:
        t = (cur + ' ' + wd).strip()
        if stringWidth(t, font, size) <= max_width:
            cur = t
        else:
            lines.append(cur)
            cur = wd
    if cur:
        lines.append(cur)
    return lines


def para(c, x, y, text, font='Helvetica', size=11, color=CHARCOAL,
         leading=None, max_width=None):
    """Draw wrapped paragraph; returns the y below the last line."""
    leading = leading or size + 5
    max_width = max_width or (W - 2 * M)
    c.setFont(font, size)
    c.setFillColor(color)
    for line in wrap(text, font, size, max_width):
        c.drawString(x, y, line)
        y -= leading
    return y


def header_band(c, kicker, title_lines, subtitle):
    """Charcoal band: green kicker, big white title, slate subtitle below band.
    Returns the y where body content can start."""
    band_h = 78 + 30 * len(title_lines)
    c.setFillColor(CHARCOAL)
    c.rect(0, H - band_h, W, band_h, stroke=0, fill=1)
    c.setFillColor(GREEN)
    c.setFont('Helvetica-Bold', 11)
    c.drawString(M, H - 40, kicker.upper())
    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 26)
    y = H - 72
    for line in title_lines:
        c.drawString(M, y, line)
        y -= 30
    c.setFillColor(SLATE_LIGHT)
    c.setFont('Helvetica', 11.5)
    c.drawString(M, H - band_h - 18, subtitle)
    return H - band_h - 44


def green_rule(c, y, width=240, lw=3):
    c.setStrokeColor(GREEN)
    c.setLineWidth(lw)
    c.line(M, y, M + width, y)
    return y - 24


def _box(c, y, title, lines, fill, title_color, body_color, box_h=None):
    leading = 19
    box_h = box_h or (46 + leading * len(lines))
    c.setFillColor(fill)
    c.roundRect(M, y - box_h, W - 2 * M, box_h, 8, stroke=0, fill=1)
    c.setFillColor(title_color)
    c.setFont('Helvetica-Bold', 11)
    c.drawString(M + 18, y - 26, title.upper())
    c.setFillColor(body_color)
    c.setFont('Helvetica', 11)
    ly = y - 50
    for line in lines:
        c.drawString(M + 18, ly, line)
        ly -= leading
    return y - box_h - 24


def light_box(c, y, title, lines, box_h=None):
    """Slate-light info box, green mini-title, charcoal body."""
    return _box(c, y, title, lines, LIGHT_BG, GREEN, CHARCOAL, box_h)


def dark_box(c, y, title, lines, box_h=None):
    """Charcoal callout box, green mini-title, white body. For the one idea
    that must land."""
    return _box(c, y, title, lines, CHARCOAL, GREEN, WHITE, box_h)


def section_title(c, y, kicker, title):
    """For continuation pages: green kicker + charcoal title + green rule."""
    c.setFillColor(GREEN)
    c.setFont('Helvetica-Bold', 11)
    c.drawString(M, y, kicker.upper())
    c.setFillColor(CHARCOAL)
    c.setFont('Helvetica-Bold', 20)
    c.drawString(M, y - 28, title)
    return green_rule(c, y - 40, width=200, lw=2)


def footer(c, line1, line2):
    c.setFillColor(SLATE_LIGHT)
    c.setFont('Helvetica', 9.5)
    c.drawString(M, 60, line1)
    c.drawString(M, 45, line2)


# ==================== CONTENIDO (replace per deliverable) ====================
OUT = '/opt/data/gf_docs/GF_PDF_Scaffold_Demo.pdf'
c = canvas.Canvas(OUT, pagesize=A4)
c.setTitle('GF documento')
c.setAuthor('GF Innovative Solutions')

y = header_band(c, 'Kicker verde',
                ['Titular grande en blanco', 'segunda linea'],
                'Subtitulo slate bajo la banda  ·  metadata')
y = green_rule(c, y)
y = para(c, M, y, 'Texto de cuerpo con wrap automatico. Voz de marca: frases '
                  'de largo variado, sin em dash, sin buzzwords.')
y -= 10
y = light_box(c, y, 'Caja clara', ['•  punto uno', '•  punto dos'])
y = dark_box(c, y, 'La idea que debe aterrizar', ['Texto blanco sobre charcoal.'])
footer(c, 'Contacto: Martin Arias  ·  martinariasfornara@gmail.com  ·  gfinnov.com',
       'GF Innovative Solutions')

c.showPage()  # new page: use section_title(c, H - 60, ...) and keep drawing
c.save()
print('SAVED', OUT)
