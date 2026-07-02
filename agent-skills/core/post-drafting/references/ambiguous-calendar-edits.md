# Ambiguous calendar edit lookups

Use this when a user references an existing content-calendar item by a loose description instead of a file path or post ID.

## What to do

1. Search the post index first.
2. Search `posts/*.json` for the named concept, people, campaign, and any visible title fragments.
3. Search the session transcript if the wording sounds like a past review or correction.
4. If no exact match is found, report the closest candidates and ask for the post ID or exact text.

## Why this matters

User phrasing often uses the concept name they remember, while the stored post may use a different title, campaign label, or body wording. A broad lookup avoids false negatives and unnecessary back-and-forth.

## Good search terms

- exact names mentioned by the user
- alternate spellings or nicknames
- campaign names
- post IDs if any are hinted
- title fragments
- nearby nouns like venue, coach, calendar, workshop, launch
