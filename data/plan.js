/* ============================================================
   Marketing Plan Data
   ------------------------------------------------------------
   This is the ONLY file the AI agent needs to overwrite.
   The HTML pages read window.MARKETING_PLAN at load time.
   Schema documented in README.md
   ============================================================ */

window.MARKETING_PLAN = {
  "agency": {
    "name": "Pulse & Pixel",
    "tagline": "Social-first growth for wellness brands"
  },

  /* -------- WHO THE CLIENT IS -------- */
  "client": {
    "name": "FitVibe Studios",
    "industry": "Boutique fitness & wellness",
    "handle": "@fitvibestudios",
    "logoInitials": "FV",
    "primaryChannels": ["instagram", "linkedin", "tiktok"],

    "positioning": "Coach-led strength training that fits real life — for people who tried the gym alone and quit.",
    "valueProp": "Small-group strength classes with a real coach, a real cohort, and a real finish line. No solo treadmill loneliness, no fitness-influencer pressure.",

    "differentiators": [
      "Coach-led, not self-serve",
      "Cohort-based, not anonymous",
      "Finite goals (4-week blocks), not vague \"wellness\"",
      "Strength-first, not chasing trends"
    ],

    "weAre": [
      "Welcoming to beginners",
      "Honest about effort",
      "Science-backed in our claims",
      "Community-driven"
    ],
    "weAreNot": [
      "A bro gym",
      "A weight-loss program",
      "Influencer-driven",
      "Cheap or transactional"
    ],

    "targetAudience": [
      {
        "segment": "Primary — Return-to-fitness adults",
        "demo": "30–45, urban, white-collar, 60% women",
        "psycho": "Tried Peloton/CrossFit/solo gym and bounced. Cares about strength + longevity, not aesthetics. Time-poor.",
        "where": "Instagram (primary), LinkedIn (work-time browsing)"
      },
      {
        "segment": "Secondary — Corporate wellness leads",
        "demo": "HR / People Ops, 35–55, mid-market companies",
        "psycho": "Looking for wellness benefits that employees actually use. Burned by gym-discount partnerships.",
        "where": "LinkedIn"
      },
      {
        "segment": "Tertiary — Young urban explorers",
        "demo": "22–30, fitness-curious",
        "psycho": "Discovering boutique fitness for the first time. Influenced by short-form video.",
        "where": "TikTok, Instagram Reels"
      }
    ],

    "voice": {
      "tone": ["Warm", "Direct", "Grounded", "Coach, not salesperson"],
      "do": [
        "Speak like a coach giving advice over coffee",
        "Use \"we\" and \"you\" — never \"our valued members\"",
        "Cite research when making a claim",
        "Celebrate small wins (a first push-up, a full night's sleep)"
      ],
      "dont": [
        "Use weight-loss-before-after framing",
        "Make medical claims",
        "Use #fitspo / #grindset / hustle-culture language",
        "Promise transformations in less than 4 weeks"
      ]
    }
  },

  /* -------- THE QUARTER AT A GLANCE -------- */
  "quarter": {
    "label": "Q3 2026",
    "year": 2026,
    "theme": "Summer Strength: Build, Burn, Belong",
    "months": [
      { "key": "jul", "name": "July",      "weeks": [1, 2, 3, 4] },
      { "key": "aug", "name": "August",    "weeks": [5, 6, 7, 8] },
      { "key": "sep", "name": "September", "weeks": [9, 10, 11, 12] }
    ]
  },

  "positioningStatement": "Q3 is about turning summer's motivational dip into our biggest brand moment of the year — anchored by the Summer Strength Challenge in August.",

  "strategicPriorities": [
    { "label": "Authority",     "description": "Establish FitVibe as the credible voice on strength + recovery — not another wellness influencer." },
    { "label": "Launch",        "description": "Make the Summer Strength Challenge the centerpiece. Build to it in July, sell it in August." },
    { "label": "Community",     "description": "Surface member stories — let users see themselves in the brand. UGC > studio shots." },
    { "label": "B2B pipeline",  "description": "Open the corporate wellness channel on LinkedIn. Quiet first, ramp in September." }
  ],

  /* -------- PLATFORM STRATEGY -------- */
  "platforms": [
    {
      "name": "Instagram",
      "channelKey": "instagram",
      "role": "Primary — discovery, community, conversion",
      "rationale": "Highest overlap with our 30–45 return-to-fitness target. Save-driven educational content performs. Reels surface to lookalikes; Carousels drive saves and shares.",
      "cadence": "5×/week + daily Stories",
      "formatMix": [
        { "label": "Reels",     "weight": "60%" },
        { "label": "Carousels", "weight": "25%" },
        { "label": "Static",    "weight": "15%" },
        { "label": "Stories",   "weight": "daily" }
      ],
      "watch": ["Save rate", "Profile visits", "DM inbound", "Reel completion %"]
    },
    {
      "name": "LinkedIn",
      "channelKey": "linkedin",
      "role": "Secondary — B2B corporate wellness pipeline + founder voice",
      "rationale": "HR and People Ops decision-makers live here during work hours. Founder thought leadership opens cold-outbound doors. Lower volume, higher contract value.",
      "cadence": "2×/week",
      "formatMix": [
        { "label": "Long-form text",  "weight": "60%" },
        { "label": "Image posts",     "weight": "30%" },
        { "label": "Document posts",  "weight": "10%" }
      ],
      "watch": ["Inbound DMs from HR titles", "Impressions among target job titles", "Profile visits from corporate domains"]
    },
    {
      "name": "TikTok",
      "channelKey": "tiktok",
      "role": "Experimental — younger demo, format-market fit test",
      "rationale": "Cheap reach into the 22–30 cohort. We treat Q3 as a learning quarter: if creator-style content lands, scale in Q4. If not, redeploy budget to IG.",
      "cadence": "3×/week",
      "formatMix": [
        { "label": "Coach tips (15–30s)", "weight": "50%" },
        { "label": "Behind-the-scenes",   "weight": "30%" },
        { "label": "Trend repurposes",    "weight": "20%" }
      ],
      "watch": ["Avg watch time", "Follow rate per view", "Comment sentiment", "Cross-platform attribution to IG"]
    }
  ],

  /* -------- KEY DATES IN THE QUARTER -------- */
  "keyDates": [
    {
      "date": "2026-07-04",
      "title": "Independence Day (US)",
      "type": "holiday",
      "relevance": "medium",
      "angle": "\"Freedom\" framing — break from the chair, get outside. Bodyweight outdoor circuit Reel."
    },
    {
      "date": "2026-07-15",
      "title": "IDEA World Fitness Convention",
      "type": "industry",
      "relevance": "medium",
      "angle": "Coach Lena attending — behind-the-scenes Stories + LinkedIn post on what's actually new in the industry."
    },
    {
      "date": "2026-07-20",
      "title": "Mid-summer motivation slump",
      "type": "seasonal",
      "relevance": "high",
      "angle": "Strongest content moment of July. \"You're not lazy, you're hot\" — empathetic educational post on training in heat."
    },
    {
      "date": "2026-08-01",
      "title": "Summer Strength Challenge launch",
      "type": "brand",
      "relevance": "high",
      "angle": "Owned moment. Coordinated push across IG + LinkedIn + TikTok same day. Founder LinkedIn post + IG Reel + TikTok teaser."
    },
    {
      "date": "2026-08-08",
      "title": "International Day of Friendship (lagging)",
      "type": "observance",
      "relevance": "low",
      "angle": "Soft tie-in to cohort/community pillar — \"bring a friend\" challenge promo. Skip if calendar gets crowded."
    },
    {
      "date": "2026-08-26",
      "title": "Women's Equality Day (US)",
      "type": "observance",
      "relevance": "high",
      "angle": "Our primary audience is 60% women. Coach Lena's story angle — strength training as reclamation. LinkedIn long-form."
    },
    {
      "date": "2026-09-07",
      "title": "Labor Day (US)",
      "type": "holiday",
      "relevance": "medium",
      "angle": "End-of-summer hinge. \"Back to routine\" framing — perfect lead-in for September challenge graduation content."
    },
    {
      "date": "2026-09-10",
      "title": "World Suicide Prevention Day",
      "type": "observance",
      "relevance": "medium",
      "angle": "Handle with care. Movement-and-mental-health angle only — partner with a licensed therapist for a co-post. No flippant takes."
    },
    {
      "date": "2026-09-15",
      "title": "Back-to-routine season",
      "type": "seasonal",
      "relevance": "high",
      "angle": "September is our highest sign-up month historically. Membership campaign window opens. Educational \"how to actually stick to it this time\" carousel."
    },
    {
      "date": "2026-09-23",
      "title": "First day of autumn",
      "type": "seasonal",
      "relevance": "medium",
      "angle": "Bridge into Q4 strength-block planning. Tease October programming."
    }
  ],

  /* -------- CONTENT PILLARS -------- */
  "pillars": [
    { "name": "Education",         "weight": 35, "color": "#211D58", "description": "Workout science, nutrition myth-busting, recovery tips. Builds authority and earns saves." },
    { "name": "Community",         "weight": 25, "color": "#8BC07C", "description": "Member spotlights, transformation stories, UGC reposts. Drives shares and trust." },
    { "name": "Promotional",       "weight": 20, "color": "#d62976", "description": "Class launches, membership offers, challenge sign-ups. Conversion-focused — used sparingly to avoid fatigue." },
    { "name": "Brand & Lifestyle", "weight": 20, "color": "#fa7e1e", "description": "Coach culture, studio aesthetic, behind-the-scenes. Builds emotional connection and brand recall." }
  ],

  /* -------- CAMPAIGN ROADMAP -------- */
  "campaigns": [
    { "name": "Hydration & Heat",          "pillar": "Education",         "startWeek": 1,  "endWeek": 3,  "color": "#211D58" },
    { "name": "Coach Spotlight Series",    "pillar": "Brand & Lifestyle", "startWeek": 2,  "endWeek": 5,  "color": "#fa7e1e" },
    { "name": "Summer Strength Challenge", "pillar": "Promotional",       "startWeek": 5,  "endWeek": 9,  "color": "#d62976" },
    { "name": "Member Transformations",    "pillar": "Community",         "startWeek": 8,  "endWeek": 12, "color": "#8BC07C" },
    { "name": "Back-to-Routine Edu",       "pillar": "Education",         "startWeek": 10, "endWeek": 12, "color": "#211D58" },
    { "name": "Corporate Wellness (B2B)",  "pillar": "Promotional",       "startWeek": 6,  "endWeek": 12, "color": "#0a66c2" }
  ],

  /* -------- MONTHLY FOCUS -------- */
  "monthlyFocus": [
    {
      "month": "July",
      "theme": "Warm up the audience",
      "intent": "Establish authority before the August push. Front-load education and coach intros. Quiet on promotion.",
      "priorities": ["Educational Reels & carousels", "Coach Spotlight series kickoff", "Tease the Summer Strength Challenge in final week"],
      "keyMoments": ["Mid-July heat slump", "IDEA conference (Lena)", "Independence Day soft tie-in"],
      "watch": "Save rate on educational Reels — this becomes our baseline for the year."
    },
    {
      "month": "August",
      "theme": "Sell the challenge",
      "intent": "All channels coordinate around the Summer Strength Challenge. Launch Aug 1, hard-sell window Aug 1–14, soft-sell + UGC Aug 15–31.",
      "priorities": ["Challenge launch day push (all channels)", "Daily Stories during challenge", "Founder LinkedIn on corporate wellness angle"],
      "keyMoments": ["Aug 1 launch", "Women's Equality Day (coach story)", "Cohort half-way milestone"],
      "watch": "Challenge sign-ups, but more importantly: which channel sourced them. This decides Q4 budget split."
    },
    {
      "month": "September",
      "theme": "Convert community into retention",
      "intent": "Challenge graduates → annual members. September is historically our top sign-up month — capitalize.",
      "priorities": ["Transformation storytelling (cohort wraps)", "Back-to-routine educational push", "Corporate Wellness LinkedIn ramp"],
      "keyMoments": ["Labor Day", "Back-to-school momentum (mid-Sept)", "Cohort graduation event"],
      "watch": "Member retention 30 days post-challenge. Inbound HR DMs on LinkedIn (B2B pipeline indicator)."
    }
  ],

  /* -------- POSTS (used by monthly.html) -------- */
  "posts": [
    {
      "id": "p1",
      "date": "2026-07-03",
      "channel": "instagram",
      "format": "Reel",
      "pillar": "Education",
      "campaign": "Hydration & Heat",
      "title": "The 3-Bottle Rule",
      "image": "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=800&q=80",
      "copy": "Most people think they're hydrated. Most people are wrong.\n\nHere's the 3-bottle rule our coaches swear by:\n\n1. One bottle before your morning coffee ☕\n2. One bottle during training 💧\n3. One bottle with dinner 🥗\n\nSave this post. Your performance will thank you in two weeks.",
      "hashtags": ["#hydration", "#fitnesstips", "#wellnessjourney", "#fitvibe", "#summerstrength"],
      "cta": "Save & share with a gym buddy",
      "status": "approved"
    },
    {
      "id": "p2",
      "date": "2026-07-09",
      "channel": "linkedin",
      "format": "Article post",
      "pillar": "Brand & Lifestyle",
      "campaign": "Coach Spotlight Series",
      "title": "Meet Coach Lena: From burnout to barbell",
      "image": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1200&q=80",
      "copy": "When Lena joined FitVibe three years ago, she was a corporate lawyer running on espresso and four hours of sleep.\n\nToday she coaches our most-booked strength class — and helps members rebuild the same way she rebuilt herself.\n\nWe asked her what she'd tell her burned-out self. Her answer surprised us.\n\nRead her story in the comments ↓",
      "hashtags": ["#leadership", "#wellbeing", "#fitnessindustry", "#coaching"],
      "cta": "Read full story in comments",
      "status": "approved"
    },
    {
      "id": "p3",
      "date": "2026-07-20",
      "channel": "instagram",
      "format": "Carousel",
      "pillar": "Education",
      "campaign": "Hydration & Heat",
      "title": "You're not lazy. You're hot.",
      "image": "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&q=80",
      "copy": "If your motivation tanked this week, it's not you. It's 34°C.\n\nSwipe → for what actually changes in your body when you train in heat (and the 4 protocol tweaks our coaches use to keep clients consistent through August).\n\nMyth #3 is the one we hear daily.",
      "hashtags": ["#recoveryday", "#trainingsmart", "#fitvibe", "#strengthtraining"],
      "cta": "Save for August",
      "status": "in_review"
    },
    {
      "id": "p4",
      "date": "2026-08-01",
      "channel": "instagram",
      "format": "Reel",
      "pillar": "Promotional",
      "campaign": "Summer Strength Challenge",
      "title": "Summer Strength is LIVE",
      "image": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80",
      "copy": "30 days. 3 workouts a week. One stronger you. 💪\n\nThe Summer Strength Challenge is officially open. Here's what's included:\n\n✓ Coach-led program (in studio + at home)\n✓ Weekly nutrition drops\n✓ Private community chat\n✓ Finisher event on September 5\n\nFirst 100 spots get 30% off membership. Link in bio.",
      "hashtags": ["#summerstrength", "#fitnesschallenge", "#fitvibe", "#joinus"],
      "cta": "Sign up — link in bio",
      "status": "approved"
    },
    {
      "id": "p5",
      "date": "2026-08-26",
      "channel": "linkedin",
      "format": "Image post",
      "pillar": "Brand & Lifestyle",
      "campaign": "Coach Spotlight Series",
      "title": "Why corporate wellness programs fail",
      "image": "https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=1200&q=80",
      "copy": "Most corporate wellness programs are gym memberships with extra steps.\n\nWe just wrapped week 4 of our Summer Strength Challenge — and 87% of corporate-sponsored participants are still showing up.\n\nThe difference? Three things:\n\n1️⃣ Coach accountability, not just access\n2️⃣ Peer cohort, not anonymous gym floor\n3️⃣ A finite goal (30 days), not vague \"wellness\"\n\nIf you're an HR lead looking to actually move the needle, DM us.",
      "hashtags": ["#corporatewellness", "#HR", "#employeeengagement"],
      "cta": "DM for corporate package",
      "status": "approved"
    },
    {
      "id": "p6",
      "date": "2026-09-08",
      "channel": "instagram",
      "format": "Reel",
      "pillar": "Community",
      "campaign": "Member Transformations",
      "title": "Maya's 30 days",
      "image": "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&q=80",
      "copy": "30 days ago, Maya couldn't do a single push-up.\n\nThis week, she hit 12. Clean. Unbroken.\n\nBut the part she's most proud of? She slept through the night for the first time in two years.\n\nStrength isn't always the number on the bar. Sometimes it's the quiet stuff.\n\nMaya — we're so proud of you. 💚",
      "hashtags": ["#transformationtuesday", "#strengthstory", "#fitvibefamily", "#wellnessjourney"],
      "cta": "Tag someone whose transformation inspired you",
      "status": "draft"
    }
  ]
};
