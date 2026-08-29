import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAgentInput } from './chat.js'
import type { Lang } from '../agentMessages.js'

// GF-122b. `buildAgentInput()` appends a synthetic attachments block to the
// SAME `input` string as the user's typed message. Every agent's system
// prompt opens with a LANGUAGE RULE keyed on "the language of the latest user
// message", so an English block trailing a short Spanish message is a
// conflicting signal that can flip the reply's language part-way through
// (observed on Black Venture Farm 2026-08-26 on the one turn of that
// conversation that carried attachments).
//
// The split this file pins down:
//   - PROSE is localized (that is where the English words are).
//   - STRUCTURAL MARKERS stay English in every language, because the agents'
//     own system prompts ("CHAT ATTACHMENTS (GF-68)" in config.yaml) key off
//     those literal strings to route images into `reference_images`.

const IMAGE = [{ id: 'att_1', kind: 'image' as const, filename: 'foto.png' }]
const DOC = [{ id: 'att_2', kind: 'document' as const, filename: 'brief.txt', text: 'hola' }]
const LANGS: Lang[] = ['es', 'de', 'en']

// English prose that must NOT reach a non-English client. Tool identifiers
// and the structural markers are deliberately absent from this list.
// Updated when GF-120 rewrote this prose (it now also tells the agent it may
// use the attachment URL directly as a post `image`, not only as an
// image_generate reference). The list tracks the CURRENT English wording —
// its job is to catch English leaking into a non-English block, so it has to
// follow the English copy whenever that copy changes.
const ENGLISH_PROSE = [
  'This is already a public URL',
  'set this URL directly as the post',
  'Do not run image_generate for it',
  'do not search the assets manifest',
  '(4 characters)',
]

test('es: the attachment prose is Spanish and carries no English prose', () => {
  const out = buildAgentInput('post 4: carrusel con estas fotos', 'black-venture-farm', IMAGE, 'es')
  assert.match(out, /^post 4: carrusel con estas fotos\n\n/)
  assert.match(out, /Esta ya es una URL publica/)
  assert.match(out, /pon la URL directamente en el campo `image`/)
  for (const phrase of ENGLISH_PROSE) {
    assert.ok(!out.includes(phrase), `Spanish block still contains English prose: ${phrase}`)
  }
})

test('de: the attachment prose is German and carries no English prose', () => {
  const out = buildAgentInput('Schau dir die Bilder an', 'demo', IMAGE, 'de')
  assert.match(out, /Dies ist bereits eine oeffentliche URL/)
  assert.match(out, /trage die URL direkt in das Feld `image`/)
  for (const phrase of ENGLISH_PROSE) {
    assert.ok(!out.includes(phrase), `German block still contains English prose: ${phrase}`)
  }
})

// The agents' system prompts key off these literal strings. Localizing them
// here without editing every agent config in lockstep would break the
// reference_images path for exactly the clients this change is for.
test('the structural markers the agent prompts key off stay English in every language', () => {
  for (const lang of LANGS) {
    const img = buildAgentInput('x', 'demo', IMAGE, lang)
    assert.match(img, /^x\n\n--- ATTACHMENTS ---\n1\. IMAGE: https?:\/\//, `markers moved for lang=${lang}`)
    const doc = buildAgentInput('x', 'demo', DOC, lang)
    assert.match(doc, /--- ATTACHMENTS ---/, `header moved for lang=${lang}`)
    assert.match(doc, /1\. DOCUMENT: brief\.txt/, `DOCUMENT label moved for lang=${lang}`)
    assert.match(doc, /<<<\nhola\n>>>/, `delimiters or text mangled for lang=${lang}`)
  }
})

// Regression guard: the assembled English block, byte for byte. The prose was
// rewritten by GF-120 (BVF's agent could not tell that an attached image may
// be used as a post `image` directly, so it hunted the assets manifest for a
// file that was never there); this pins the post-GF-120 wording.
test('en: the assembled English block is exactly the expected string', () => {
  const out = buildAgentInput('look at this', 'demo', IMAGE, 'en')
  const url = out.split('IMAGE: ')[1].split('\n')[0]
  assert.equal(
    out,
    [
      'look at this',
      '',
      '--- ATTACHMENTS ---',
      `1. IMAGE: ${url}`,
      "   This is already a public URL. GF-120: if the user wants THIS exact image used as-is (a post cover or a carousel slide) — not a new AI-generated image — set this URL directly as the post's `image` (or `slides[].image`) field. Do not run image_generate for it and do not search the assets manifest for it; it does not need to be copied into /assets/files/ first. Only pass this URL into image_generate's `reference_images` when you are instead generating a NEW image that should match or incorporate this one.",
    ].join('\n'),
  )
})

// GF-120 + GF-122b together: the direct-image instruction is the whole point
// of the GF-120 fix, so it must survive in EVERY language — an es/de client
// that only got the old reference_images-only hint would still hit the
// original bug.
test('every language tells the agent it may use the URL as the post image', () => {
  for (const lang of LANGS) {
    const out = buildAgentInput('x', 'demo', IMAGE, lang)
    assert.match(out, /`image`/, `direct-image guidance missing for lang=${lang}`)
    assert.match(out, /slides\[\]\.image/, `slides guidance missing for lang=${lang}`)
  }
})

test('document entries localize the character-count unit only', () => {
  assert.match(buildAgentInput('', 'demo', DOC, 'es'), /1\. DOCUMENT: brief\.txt \(4 caracteres\)/)
  assert.match(buildAgentInput('', 'demo', DOC, 'de'), /1\. DOCUMENT: brief\.txt \(4 Zeichen\)/)
  assert.match(buildAgentInput('', 'demo', DOC, 'en'), /1\. DOCUMENT: brief\.txt \(4 characters\)/)
})

// The agent has no `imagen_generar` tool. Translating the identifiers would
// name a tool that does not exist, so they stay English inside the prose.
test('tool and parameter identifiers stay in English in every language', () => {
  for (const lang of LANGS) {
    const out = buildAgentInput('x', 'demo', IMAGE, lang)
    assert.match(out, /reference_images/, `reference_images translated away for lang=${lang}`)
    assert.match(out, /image_generate/, `image_generate translated away for lang=${lang}`)
  }
})

test('no attachments: the message passes through untouched in every language', () => {
  for (const lang of LANGS) {
    assert.equal(buildAgentInput('solo texto', 'demo', [], lang), 'solo texto')
  }
})

// Defensive: env parsing normalizes to a Lang, but if an unexpected value
// ever reaches here the block must still render rather than emit "undefined".
test('an unrecognized language falls back to the English prose', () => {
  const out = buildAgentInput('x', 'demo', IMAGE, 'fr' as Lang)
  assert.match(out, /This is already a public URL/)
  assert.ok(!out.includes('undefined'), 'fallback produced "undefined" in the block')
})
