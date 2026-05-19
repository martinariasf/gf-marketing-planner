# Marketing Planner — GF Innovative Solutions

A two-view HTML/JS framework for marketing agencies, built on the GF Innovative Solutions corporate identity (Corporate Blue `#211D58`, Innovation Green `#8BC07C`, Montserrat).

## Folder structure

```
marketing-planner/
├── trimester.html    Quarterly strategist brief (positioning, audience, platforms, key dates, campaigns)
├── monthly.html      Post-by-post view: copy on the left, IG/LinkedIn mockup on the right
├── SKILL.md          Instructions for the AI agent that writes content into plan.js
├── assets/
│   ├── style.css     Shared GF brand styles
│   └── auth.js       Password gate (SHA-256 hash)
└── data/
    └── plan.js       The ONLY file the AI agent should overwrite
```

Entry point: `trimester.html`.

## For the AI agent

If you're an AI agent generating content for this framework, **read [`SKILL.md`](./SKILL.md), not the HTML**. It tells you the one file to write (`data/plan.js`), the full schema, strategist voice rules, and the workflows for common tasks (add a post, plan a quarter, reschedule a campaign).

## Password gate

Both pages are gated by `assets/auth.js`.

**Default password:** `gf-marketing-2026`

After unlock, the session is remembered until the browser tab is closed (uses `sessionStorage`).

### ⚠ Security note

This is a **frontend gate**, not real security. It keeps casual snoopers and wrong-URL visitors out, but anyone with browser DevTools can bypass it and read `data/plan.js` directly. Good enough for client preview gating; **not** good enough if the plan is genuinely confidential. For real secrecy, host behind server-side auth (Netlify password protection, Cloudflare Access, `.htaccess`, etc.).

### Changing the password

1. Open DevTools console on any page.
2. Paste this, replacing the string:
   ```js
   await (async p => {
     const b = new TextEncoder().encode(p);
     const h = await crypto.subtle.digest('SHA-256', b);
     return Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,'0')).join('');
   })("YOUR NEW PASSWORD")
   ```
3. Copy the printed hash. Replace the `PASSWORD_HASH` value in `assets/auth.js`.
4. Share the new password out-of-band (Signal, password manager — not in the repo).

## How the AI agent feeds data

The agent's job is to produce a single JS file at `data/plan.js` that assigns one global:

```js
window.MARKETING_PLAN = { ...the plan object... };
```

That's it. The two HTML pages read `window.MARKETING_PLAN` on load. No build step, no server, no fetch/CORS issues — works straight from `file://`.

## Data schema

```jsonc
{
  "agency":  { "name": "string", "tagline": "string" },
  "client":  {
    "name": "string",
    "industry": "string",
    "handle": "@something",        // shown in IG mockup header
    "logoInitials": "FV",          // 2 chars shown in avatar circles
    "primaryChannels": ["instagram", "linkedin", "tiktok"]
  },
  "quarter": {
    "label": "Q3 2026",
    "year": 2026,
    "months": [                    // exactly 3 months
      { "key": "jul", "name": "July",      "weeks": [1,2,3,4] },
      { "key": "aug", "name": "August",    "weeks": [5,6,7,8] },
      { "key": "sep", "name": "September", "weeks": [9,10,11,12] }
    ]
  },
  "headline": "string",            // big H1 on the trimester hero
  "strategy": "string",            // 2–4 sentence paragraph
  "kpis": [                        // 3–4 items shown in hero
    { "label": "Reach", "value": "1.2M" }
  ],
  "pillars": [                     // content pillars, weights should sum to ~100
    {
      "name": "Education",
      "weight": 35,
      "color": "#211D58",          // any hex — used for pillar card + timeline bar
      "description": "string"
    }
  ],
  "campaigns": [                   // shown as bars on the 12-week timeline
    {
      "name": "Summer Strength Challenge",
      "pillar": "Promotional",
      "startWeek": 5,              // 1..12
      "endWeek": 9,                // 1..12
      "color": "#d62976"
    }
  ],
  "monthlyGoals": [                // exactly 3 — one per month
    {
      "month": "July",
      "goal": "string",
      "kpi":  "string",
      "postCount": 14,
      "focus": "1–2 sentence description"
    }
  ],
  "posts": [                       // any number; shown in monthly view
    {
      "id": "p1",
      "date": "2026-07-03",        // ISO date
      "channel": "instagram",      // instagram | linkedin | tiktok | x | facebook
      "format": "Reel",            // Reel | Carousel | Image post | Article post | Story | etc.
      "pillar": "Education",
      "campaign": "Hydration Habits",
      "title": "The 3-Bottle Rule",
      "image": "https://...jpg",   // URL — rendered inside the channel mockup
      "copy": "Caption text. \\n Use \\n for line breaks.",
      "hashtags": ["#tag1", "#tag2"],
      "cta": "Save & share",
      "status": "approved"         // approved | in_review | draft
    }
  ]
}
```

## Channel mockups

- **`instagram`, `tiktok`, `x`, `facebook`** → iPhone-style phone frame with IG-style post (header + square image + actions + caption).
- **`linkedin`** → LinkedIn feed card mockup (avatar + name + text + 1.91:1 image + reaction bar).

Add new channel mockups by editing `renderMockup()` in `monthly.html`.
