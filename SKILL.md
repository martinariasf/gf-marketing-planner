---
name: gf-marketing-planner
description: Update or generate marketing plan content for the GF Innovative Solutions Marketing Planner framework. Use when adding posts, scheduling content, planning a quarter, or updating any client/brand strategy data. The agent's job is to write a single JS file (`data/plan.js`) that the HTML views render. TRIGGERS — any of: "add a post", "schedule a post", "plan content for [client]", "update the marketing plan", "new quarter plan", "add to the planner", "social content for [client]", references to `plan.js` or the marketing-planner folder. DO NOT trigger for: general copywriting unrelated to this framework, one-off social posts not going into the planner.
---

# Marketing Planner — Agent Skill

You are updating content for an HTML/JS marketing planning framework used by GF Innovative Solutions and their agency clients. The framework has two views (`trimester.html`, `monthly.html`) that read from a single data file. **You only need to edit that one data file.** Do not read or modify the HTML.

## What you write

**One file:** `marketing-planner/data/plan.js`

It must assign exactly one global:

```js
window.MARKETING_PLAN = { /* the plan object */ };
```

That's it. No imports, no exports, no other globals. Re-write the whole file each time — don't try to patch it.

## When to use this skill

| User says | What you do |
|---|---|
| "Add a post about X on date Y" | Read existing `plan.js`, append one item to `posts[]`, rewrite the file. |
| "Plan Q4 for [client]" | Generate a full plan object from scratch. Ask the user for client details first (see "Required intake" below). |
| "Schedule the August Coach Spotlight series" | Add 3–4 posts to `posts[]` spread across August dates. |
| "Update the positioning for [client]" | Edit `client.positioning`, `client.valueProp`, `client.differentiators`. |
| "Add a key date for [event]" | Append to `keyDates[]` with date, type, relevance, and brand angle. |

## Required intake for a new client

Before generating a full quarterly plan, you need:

1. **Client basics** — name, industry, social handles
2. **Positioning** — one-sentence "we are X for Y" + what makes them different
3. **Audience** — who they're targeting (1–3 segments)
4. **Channels** — which platforms (default: Instagram + LinkedIn + one experimental)
5. **Quarter** — which quarter (Q1/Q2/Q3/Q4) and year
6. **Big bet** — is there a flagship campaign, launch, or moment this quarter? If not, propose one.

If the user gives you fewer than these, **ask for them**. Don't invent client positioning out of thin air.

## Strategist voice — non-negotiable rules

This framework is positioned as a **strategist's brief**, not a posting calendar. Every piece of content should pass these tests:

**DO:**
- Write copy like a coach giving advice, not an ad
- Cite *why* you're choosing a platform, date, or angle — not just *what*
- Use qualitative language for new clients ("establish save rate baseline", "watch sentiment in comments") — never invent numeric targets
- Tie posts to either a `pillar` AND a `campaign` (both fields)
- Hook the first line of copy. The IG mockup shows only the first ~3 lines before "more"
- Match `format` to channel norms (LinkedIn = "Article post" or "Image post"; IG = "Reel", "Carousel", "Story")

**DON'T:**
- Fabricate metrics ("will get 50K reach") — for unknown clients, talk about indicators, not targets
- Use generic fitness/lifestyle/business clichés ("crushing it", "level up", "game-changer")
- Match a holiday to a client without writing a real *angle* — if you can't explain how the brand uses the date, leave it out
- Add `#fitspo` / `#grindset` / hustle-culture hashtags on wellness brands
- Use weight-loss before/after framing on fitness clients
- Put more than ~12 hashtags on an IG post or more than ~4 on a LinkedIn post
- Schedule promotional posts back-to-back — interleave with education/community/lifestyle

## Data schema

```jsonc
{
  "agency": {
    "name": "string",                  // the agency running the account
    "tagline": "string"
  },

  "client": {
    "name": "string",                  // brand name (displayed everywhere)
    "industry": "string",
    "handle": "@brand",                // shown in IG mockup header
    "logoInitials": "FV",              // 2 chars in avatar circles
    "primaryChannels": ["instagram", "linkedin", "tiktok"],

    "positioning": "One-sentence: brand for [audience] who [need].",
    "valueProp": "2–3 sentence longer version. What we promise.",

    "differentiators": ["string", ...],   // 3–5 things that make us different
    "weAre":   ["string", ...],           // 3–5 short affirmations
    "weAreNot":["string", ...],           // 3–5 things we explicitly aren't

    "targetAudience": [                   // 1–3 segments
      {
        "segment": "Primary — short name",
        "demo":    "age, location, role",
        "psycho":  "mindset, pain points, motivations",
        "where":   "which platforms they live on"
      }
    ],

    "voice": {
      "tone": ["Warm", "Direct", "Grounded"],   // 3–5 tone descriptors
      "do":   ["string", ...],                  // 3–5 specific writing rules
      "dont": ["string", ...]                   // 3–5 specific anti-patterns
    }
  },

  "quarter": {
    "label": "Q3 2026",                  // displayed verbatim
    "year": 2026,
    "theme": "Short punchy quarter theme",
    "months": [                          // EXACTLY 3, in order
      { "key": "jul", "name": "July",      "weeks": [1,2,3,4] },
      { "key": "aug", "name": "August",    "weeks": [5,6,7,8] },
      { "key": "sep", "name": "September", "weeks": [9,10,11,12] }
    ]
  },

  "positioningStatement": "The 1–2 sentence big strategic bet for this specific quarter.",

  "strategicPriorities": [               // EXACTLY 4 (renders as priority chips in hero)
    { "label": "Authority", "description": "1 sentence of what this means and why." }
  ],

  "platforms": [                         // one per active channel
    {
      "name": "Instagram",
      "channelKey": "instagram",         // must be: instagram | linkedin | tiktok | x | facebook
      "role": "Primary — discovery, community, conversion",
      "rationale": "WHY this channel — 1–2 sentences citing audience fit.",
      "cadence": "5×/week + daily Stories",
      "formatMix": [
        { "label": "Reels", "weight": "60%" },
        { "label": "Carousels", "weight": "25%" }
      ],
      "watch": ["Save rate", "Profile visits", ...]   // qualitative indicators
    }
  ],

  "keyDates": [                          // 8–15 per quarter is the sweet spot
    {
      "date": "2026-07-04",              // ISO YYYY-MM-DD
      "title": "Independence Day (US)",
      "type": "holiday",                 // holiday | observance | industry | seasonal | brand
      "relevance": "medium",             // high | medium | low
      "angle": "HOW the brand uses this date — a specific content idea, not just acknowledgment."
    }
  ],

  "pillars": [                           // 3–5 content pillars
    {
      "name": "Education",
      "weight": 35,                      // percentage, all pillars should sum to ~100
      "color": "#211D58",                // any hex — used in pillar card border + timeline
      "description": "1 sentence on what this pillar covers and why it matters."
    }
  ],

  "campaigns": [                         // 4–7 campaigns mapped to the 12 weeks
    {
      "name": "Summer Strength Challenge",
      "pillar": "Promotional",           // must match a pillars[].name
      "startWeek": 5,                    // 1–12
      "endWeek": 9,                      // 1–12
      "color": "#d62976"
    }
  ],

  "monthlyFocus": [                      // EXACTLY 3, one per month
    {
      "month": "July",                   // must match quarter.months[].name
      "theme": "Short month-level theme",
      "intent": "2 sentences on the strategic intent of this month.",
      "priorities": ["string", ...],     // 3–5 content priorities
      "keyMoments": ["string", ...],     // 2–4 key dates/events from keyDates
      "watch": "Qualitative — what indicator we're paying attention to this month."
    }
  ],

  "posts": [                             // any number; each renders as a section in monthly.html
    {
      "id": "p1",                        // unique within the array
      "date": "2026-07-03",              // ISO date
      "channel": "instagram",            // instagram | linkedin | tiktok | x | facebook
      "format": "Reel",                  // see format conventions below
      "pillar": "Education",             // must match a pillars[].name
      "campaign": "Hydration & Heat",    // must match a campaigns[].name (or null)
      "title": "Short internal title — not the caption",
      "image": "https://...jpg",         // URL — rendered inside the channel mockup
      "copy": "The actual caption. Use \\n for line breaks. First line is the hook.",
      "hashtags": ["#tag1", "#tag2"],    // include the # sign
      "cta": "What action we want — short verb phrase",
      "status": "approved"               // approved | in_review | draft
    }
  ]
}
```

### Format conventions per channel

| channel | typical `format` values |
|---|---|
| `instagram` | `Reel`, `Carousel`, `Image post`, `Story` |
| `linkedin` | `Long-form post`, `Article post`, `Image post`, `Document post` |
| `tiktok` | `Short-form video`, `Tip`, `BTS`, `Trend repurpose` |
| `x` | `Thread`, `Single post`, `Image post` |
| `facebook` | `Image post`, `Video post`, `Link post` |

## Workflows

### 1. Add a single post to an existing plan

1. Read `data/plan.js` to get the current `window.MARKETING_PLAN` object.
2. Pick a sensible `id` (e.g., increment from highest existing `p{n}`).
3. Make sure `pillar` matches an existing `pillars[].name` and `campaign` matches an existing `campaigns[].name`.
4. Write the post object with all required fields.
5. Append it to `posts[]`. Re-sort `posts[]` by `date` ascending if you want — both work; the monthly view sorts on render.
6. Rewrite the entire `data/plan.js` file. Do not produce a diff; produce the full new file.

**Checklist before saving:**
- [ ] Caption hook in the first line (no preamble)
- [ ] Line breaks rendered with `\n` inside the JS string
- [ ] Hashtags array, each starts with `#`
- [ ] `channel` is lowercase
- [ ] `image` URL is reachable (Unsplash, Cloudinary, hosted) — not a `file://` path

### 2. Build a full quarter plan from scratch

1. **Intake** — get the 6 required intake items. Ask if missing.
2. **Calendar research** — list relevant holidays, observances, industry events, and seasonal moments for the target quarter and the client's geography. Reject ones with no clear brand angle.
3. **Pillar mix** — propose 3–5 pillars with rationale and weights summing to ~100.
4. **Campaigns** — design 4–7 campaigns that anchor to specific key dates. Map them to week ranges in `startWeek`/`endWeek`.
5. **Monthly focus** — for each of the 3 months, write theme + intent + 3 priorities + key moments + what-to-watch.
6. **Seed posts** — generate 4–8 sample posts spread across the quarter, mixing pillars and channels. This is the demo content the agency will refine.
7. **Strategic priorities** — 4 qualitative priority chips. No numbers.
8. **Write the full `data/plan.js`** with `window.MARKETING_PLAN = {…};`. Don't skip optional fields — fill everything.

### 3. Reschedule or restage a campaign

1. Read `plan.js`.
2. Update the relevant `campaigns[]` entry's `startWeek`/`endWeek`.
3. Move associated `posts[].date` to fall within the new window.
4. Update `monthlyFocus[].keyMoments` and `keyDates[]` if the change shifts a launch date.
5. Rewrite the file.

## Common mistakes to avoid

| Mistake | What goes wrong | Fix |
|---|---|---|
| `pillar` or `campaign` doesn't match an entry in `pillars`/`campaigns` | Filtering breaks silently | Always check the source-of-truth arrays first |
| Numeric KPI invented for a new client | Reads as fake / breaks strategist credibility | Use "what to watch" qualitative phrasing |
| `keyDates[]` entry without `angle` | Just a calendar, no strategic value | Either write the angle or drop the date |
| `channel` capitalized ("Instagram") | Mockup CSS class doesn't match | Always lowercase |
| `weAreNot` filled with generic negatives | Reads as filler | Make them specific to this brand's *actual* anti-positioning |
| All campaigns assigned to one pillar | Skews content mix, looks lazy | Spread pillars across the 12 weeks |
| Posts dated outside the quarter | Won't appear in any month tab | Match `posts[].date` to the quarter range |
| Months mismatch — quarter.months says "July" but monthlyFocus says "Jul" | Cards won't link properly | Use the long form ("July", not "Jul") and match exactly |

## Reference example

See the current `data/plan.js` for a complete worked example: **Pulse & Pixel** agency, planning **Q3 2026** for **FitVibe Studios** (boutique fitness brand). Includes all sections filled in with strategist-quality content. Use it as the gold standard for tone, depth, and structure.

## File output template

Always start the file with this comment header so anyone opening it knows what they're looking at:

```js
/* ============================================================
   Marketing Plan Data
   ------------------------------------------------------------
   This file is regenerated by the agent. The HTML pages read
   window.MARKETING_PLAN at load time.
   ============================================================ */

window.MARKETING_PLAN = {
  // ... full plan object ...
};
```

No trailing exports, no IIFE, no module wrappers. Just the global assignment.
