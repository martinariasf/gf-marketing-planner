# Postiz endpoint note

Session note: when the local Postiz helper was asked to list integrations, it hit a 404 with a doubled `/public/v1` prefix in the request path (`/public/v1/public/v1/integrations`).

Practical takeaway:
- Verify the effective base URL before queueing posts.
- Do not assume a helper has normalized the API prefix.
- If queueing fails, leave the post approved on disk and report the failure for human follow-up instead of silently marking it scheduled.
