# GF Instagram content strategy (Pilar, established July 2026)

GF's social focus shifted to **Instagram-only** for this period (LinkedIn deprioritized). Confirm channel focus each planning cycle, but default to Instagram.

## Mission: position, don't sell
Instagram is a positioning + education channel. GF wants to be seen as the people who help others *use AI well*. It is NOT a lead-gen / sales channel.
- No workshop pushes, no "DM me for the architecture", no commercial CTAs.
- If a draft reads salesy → rewrite it educational.
- CTAs should be low-commitment and value-first ("save this", "which one will you try first?").

## Recurring editorial theme Pilar likes
> Close the gap between what people **think** AI does and what it **really** does.
The gap runs both ways: overhyped as "magic" (disappointment), and underused for the boring valuable stuff (missed opportunity). Educational, demystifying, practical.

## Caption vs image division of labour
- **Caption** = the education. The full teaching, the substance, the value lives here.
- **Image** = hook + a couple of highlights only. Never a wall of text on the graphic. Must be legible on mobile (large headline, generous margins).

## Tools allowlist (HARD)
Only recommend tools GF actually uses: **Claude / ChatGPT, Perplexity, N8N**.
**NEVER Make or Zapier** — Martin flagged this as a significant error. Verify GF-usage before naming any tool.

## Formats
Mix it up — don't default to single image:
- single image (one bold hook headline + green accent)
- carousel (e.g. "what you THINK vs what it REALLY does" slide pairs; 4–5 slides; slide 1 = hook, last slide = takeaway)
- reel / short video

## Angles: fresh & disruptive, no repetition
Check recent published posts; do not re-run prior angles (June ran "Viktor introduces himself", "one prompt three results", "do you really need AI for that", "3 free tools"). Push non-obvious takes. Examples that landed well:
- "AI doesn't lie — it guesses, confidently" (treat output as draft, ask what would make it wrong)
- "You're using AI backwards" (use it for the messy middle, not the finished thing)
- "Stop hunting for the perfect prompt" (context > magic words)
- "3 things you should NOT trust AI with (yet)" (honest limits build credibility)

## Design system that worked (8-post July set)
- Vertical 4:5, 1080×1350.
- Solid dark charcoal background (#1a1a1a), bright green accent (#22c55e), white headline.
- Official GF logo small in top-left corner — fetched from real asset library, passed as `reference_images` to the generator so the mark isn't invented.
- Lots of negative space, thin green dividers, no robots / no glowing brains / no AI-stock clutter.
- After generating, vision-check: logo is the CORRECT variant for the background (see logo rule below), spelling correct, nothing cropped, legible at mobile size.

## Logo variant by background (HARD — Pilar, July 2026)
The GF logo has two variants and the choice is dictated by the background, not by preference:
- **Dark / dark-blue backgrounds → WHITE + light-green variant** (white GF monogram, white "INNOVATIVE SOLUTIONS" wordmark, green wifi icon). The navy logo does NOT contrast on dark — using it on charcoal is a defect Pilar will reject.
- **Light backgrounds → navy(blue) + green variant.**
Since the proven design system uses a dark charcoal background, these covers MUST carry the white+green logo. Pilar sent the official white-on-dark reference (also in `brief.json` branding.logos as variant "White"); pass that exact file as `reference_images` so the generator reproduces it faithfully. The brief's public asset host may not resolve from the tool env — fetch logo assets via the internal `$API_BASE` host instead.

## Language
All marketing output (copy, titles, CTAs, hashtags) in **English**, even though Pilar converses in Spanish. Status updates and chat to Pilar in plain Spanish.
