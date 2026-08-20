---
name: linkedin-network-activation
description: Audit an individual's LinkedIn profile and design a personal-brand + warm-network activation strategy to convert their existing connections into agenda/citas/leads for GF (the platform and Viktor). Use when someone (Pilar, Martin, an ally) wants to capitalize their own network — NOT cold outreach (see prospect-list-building) and NOT GF founder-voice posts (see post-drafting).
---

# LinkedIn Network Activation (personal brand → warm leads)

Turn a person's warm LinkedIn network into booked conversations for GF. The person is the credible face; GF/Viktor/the platform is what they adopt and show off. This is **build-in-public**, not selling.

## When to use
- A person shares their LinkedIn profile (often as a screenshot PDF) and asks how to use their network to find prospects/clients for GF or the platform.
- The audience is warm (existing 1st/2nd-degree connections in a relevant rubro), not scraped cold leads.
- Trigger phrases: "estrategia para mi red", "capitalizar mis contactos", "conseguir citas/prospectos con mi perfil".

## Step 0 — Read the profile (screenshot PDFs are image-only)
LinkedIn "screencapture" PDFs usually have NO text layer (`get_text()` returns empty). Render each page to PNG and read visually:
```
/opt/hermes/.venv/bin/python -c "import fitz; d=fitz.open('FILE.pdf'); [d[i].get_pixmap(dpi=130).save(f'/tmp/li_{i+1}.png') for i in range(d.page_count)]"
```
Then vision_analyze each PNG. If pymupdf missing: `uv pip install pymupdf` (env at /opt/hermes/.venv). Capture: headline, About, experience, activity recency + impressions, recommendations, skills.

## Step 1 — Cross-reference the GF brief FIRST
Before proposing anything, GET the brief (`/clients/<slug>/brief`) and read `business`, `voice`, `positioning`. The strategy must speak GF's commercial language and respect voice do/don'ts and boundaries (never publish pricing, client names, unshipped work). See copywriting + post-drafting skills for voice rules.

## Step 2 — Diagnose (be honest about bottlenecks)
Score the profile on the levers that actually block bookings:
- **Activity recency** — dormant profile (last post months ago, low impressions) = bottleneck #1; reactivation is step one.
- **Headline** — generic titles ("Creative Business Strategist") don't filter or hook. Rewrite to what/for-whom/result.
- **Social proof** — zero recommendations hurts consultative selling; queue 3-4 asks.
- **CTA** — "let's talk" with no concrete next step (link/agenda/keyword) leaks intent.
- **Narrative fit** — flag where their existing story ALREADY aligns with the offer (e.g. "automation that frees time" = the product); don't force a new message, amplify the true one.

## Step 3 — Pick the positioning angle (ask the user, recommend the softer one)
- **A) Independent adopter** (RECOMMENDED to start): "estratega que adoptó la herramienta" — more credible, less salesy, they're the living proof.
- **B) Open partner/ambassador** of GF — stronger tie but reads as vendor sooner.
Always surface this as a single decision before writing copy; it changes the tone of everything.

## Step 4 — Content engine (4 pillars, ~3 posts/week)
1. **Detrás de escena** — real screenshots of their workflow with the platform/Viktor (highest conversion with marketers). Real screenshots, never AI stock.
2. **Antes/después** — "esto me llevaba X horas, ahora Y", concrete numbers.
3. **Opinión de estratega** — no-hype takes on IA + marketing.
4. **Invitación suave** — ~1 in 5 posts with a direct CTA to talk/try.

### Reactivation arc (Pilar's original preferred shape, validated 2026-07 — SUPERSEDED 2026-08, see format-variety rule below)
The arc concept below produced posts that were each fine but all identical in skeleton, which Pilar rejected as an obvious AI tell. Keep the gradual reveal of the platform and the reflective register, but each post in the arc MUST use a different format (question, anecdote, conversation, list, letter).
When reactivating a dormant profile, don't ship 3–4 independent posts. Build ONE progressive arc with a single throughline (Pilar's is **"adelantarse"** — getting ahead of AI instead of fearing it). Each post is reflective and first-person, and the platform/tool is introduced GRADUALLY as *context of her own story*, never as a product being shown off:
- **Post 0 — pure reflection.** The emotional hook (e.g. "the AI anxiety we all felt / this leaves me jobless?"). NO tool, no platform. Just an honest take and the thesis (adelantarse = the only answer that returns control).
- **Post 1 — she moved.** Reveals she built something ("me armé un sistema propio, un asistente con mi voz y un tablero") but framed as *the process of moving before being ready*, not a feature list.
- **Post 2 — the system in context.** Before/after of a real workday; the assistant/tablero appear doing work, but the payoff is her *criterio* (what she decided NOT to delegate), not the tool.
- **Post 3 — soft invitation.** Only here does the door open ("escribime quiero verlo"), still framed as "how I decided to work", not a pitch.

Pilar's explicit steer: "no quisiera sonar tanto a venta o a mostrar, quiero algo más inteligente y creativo" + "poco a poco incluirte a ti y a la plataforma, como contar en contexto". Treat this as the default register for her personal LinkedIn: reflective > promotional, platform as narrative context > platform as subject. Voice is rioplatense first-person, honest, zero hype, no em dashes (see copywriting).

**2026-08 reset (supersedes fixed-arc drafting):** after the 4 arc posts published, Pilar killed the entire LinkedIn draft/review queue (9 posts deleted) because every post reused the same title+hook+arc+lesson structure and the feed read as obvious AI. Hard rules for her LinkedIn now: NEVER repeat a format/structure twice in a row (rotate: real conversation snippet, open philosophical question, mini-rant, commented news, specific anecdote with real details, real photo + short caption, short video, reshare/comment on someone else's post); 2 posts/week; lengths vary (some 3-line posts, some without a tidy moral, some ending mid-thought or on a question); audience = her marketer/agency network + PyMEs (new commercial direction: AI absorbs repetitive digital marketing tasks, then campaign activation, then digital sales with her human accompaniment); her ownable thesis = let AI take the repetitive digital work so humans can double down on 1:1, artesanal, tangible marketing; voice = neutral LatAm with rioplatense tics (che, dale), she is deep/philosophical. Real photos/screenshots > branded graphics on her personal profile. She sends meeting transcripts + voice notes as voice-calibration and anecdote raw material: wait for those before final copy.

### Format variety is an anti-AI requirement (hard rule, Pilar 2026-08)
The first reactivation arc shipped posts that were individually clean but structurally identical: short punchy title, reflective first-person anecdote, mid-post twist, tidy closing lesson, same length, same rhythm. Pilar's verdict: "si hacemos todo lo mismo, enseguida la gente se va a dar cuenta de que es inteligencia artificial." A repeated skeleton across the corpus is the loudest AI tell, louder than any banned word. Rules for her personal LinkedIn:
- NEVER ship two posts with the same skeleton. Rotate formats: open question to the network, mini-rant, a real conversation retold, letter-style post, short list, photo + one-liner, contrarian take.
- Vary length and rhythm on purpose. A human writes differently on a Tuesday than on a Saturday.
- Do not end every post with a tidy moral. Sometimes end mid-thought, on a question, or on the uncomfortable part.
- Anchor every post in concrete real details (a client who said X, a specific day, a real number). That is the one thing AI cannot invent for her.
- Language: Spanish (rioplatense). Audience: marketers / agency people (~70% of her network). Register: close, human. The GF brief's English founder-voice rules do NOT govern this channel.
- Before drafting any batch, list the skeletons of the last few published posts and prove the new ones are different.
- Voice calibration: ask her for real writing samples (old posts, mails, transcribed voice notes) and match her actual rhythm, muletillas, and register before drafting. Once a sample arrives, mine it into `references/pilar-voice-calibration.md` and read that file before every draft.

### Transcript → content workflow (Pilar's consultoría sessions, validated 2026-08)
When she sends a meeting/session transcript (PDF) as source material: extract text with pymupdf (or pdftotext) into /tmp, read ALL of it (can be 1,500+ lines), then mine THREE things before drafting: (1) verbatim voice markers (her muletillas, boundary phrases, closers), (2) her ownable one-liners = philosophy she actually said, quoted, not generic marketing wisdom, (3) a concrete anecdote bank with real numbers/people/events. Append findings to `references/pilar-voice-calibration.md`. Then draft 2 posts in DIFFERENT rotation formats with deliberately different lengths, pair each with a real photo from her camera roll when she provides one, deliver both drafts IN CHAT side by side, and close by asking whether to push them to the dashboard as `drafting` or keep polishing in chat first.

## Step 5 — Convert network → citas (the commercial motor)
- **Warm outreach por tandas**: filter connections by rubro, send 1:1 NON-pitch DMs ("estoy probando un sistema con IA para producir contenido, ¿te muestro?").
- **Engagers → DM**: whoever comments/reacts gets a follow-up DM. Content warms, DM books.
- **Measurable goal**: reactivate → 3 posts/wk × 4 wks → target N conversations → M demos. Tie to dates.

## Deliverable order (unblock everything first)
Profile fixes (headline + About rewrite with real CTA) → first 3 reactivation posts for review → contact list to work in parallel. Deliver drafts IN CHAT for review (user preference), not only in folders.

## Pitfalls
- Don't "post about the platform" — that reads as vendor. The person shows their own use; the tool is incidental.
- A person's warm network (e.g. LATAM/España agencies) can be a NEW segment/carril for GF beyond the brief's primary ICP (German SMEs). Note it as its own lane, don't shoehorn into the primary segment.
- Respect all GF boundaries (no pricing, no client names, no unshipped work) even in personal-brand posts.
- Corpus-level check: a batch of posts that each pass the within-text anti-AI rules can still scream "AI" if they all share one structure. Check skeleton variety across posts, not just style within each post (2026-08 lesson).

## Session references
- `references/pilar-arias-profile-audit.md` — Pilar's full profile audit + strategy (2026-07 first run; 2026-08 reset with the corpus-level AI-tell diagnosis, the deleted drafts, and the calibration questions sent).
- `references/pilar-voice-calibration.md` — verbatim voice markers, ownable one-liners, and anecdote bank mined from her real consultoría transcript with Manuela Duque (2026-08). Read BEFORE drafting her copy; append new transcript findings here each time she shares one.
