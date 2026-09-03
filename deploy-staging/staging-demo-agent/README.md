# Staging-demo Hermes agent — deployed source-of-truth mirror
Deployed on Otto_Clawdbot (46.224.224.113) at /opt/agents/staging-demo/. Plugins + config.yaml are bind-mounted; apply by editing the box copy then 'cd /opt/agents/staging-demo && docker compose restart'.

- plugins/image_gen_openrouter/__init__.py -> /opt/agents/staging-demo/plugins/image_gen_openrouter/__init__.py  (adds image post_id auto-link and OpenRouter Seedance video generation)
- skills/video-generation/SKILL.md -> /opt/agents/staging-demo/skills/video-generation/SKILL.md
- config.yaml -> /opt/agents/staging-demo/config.yaml
- Dockerfile -> /opt/agents/staging-demo/Dockerfile  (snapshot; base bumped to hermes-agent:base-v2026.7.1 on 2026-07-04 for the whatsapp_cloud platform)

## WhatsApp Business Cloud API (GF-46, staging, 2026-07-04)

The staging agent runs upstream Hermes v2026.7.1, which ships the official
Meta Cloud API adapter (`gateway/platforms/whatsapp_cloud.py`) alongside the
Baileys self-chat bridge (now a bundled plugin; both run in parallel).

- Base image: built from a git worktree on the box —
  `/opt/agents/_upstream-v2026.7.1` → `hermes-agent:base-v2026.7.1`.
  Prod agents' `hermes-agent:base` (May-19) is untouched.
- Enable: the adapter turns on when `WHATSAPP_CLOUD_PHONE_NUMBER_ID` +
  `WHATSAPP_CLOUD_ACCESS_TOKEN` are set in `/opt/agents/staging-demo/.env`
  and the container is recreated (`docker compose up -d`, not `restart`).
  Placeholders are live so Meta's webhook "Verify and save" already works.
- Webhook: `https://staging.marketing.gfinnov.com/whatsapp/webhook` →
  box Caddy (deploy/Caddyfile) → `hermes-marketing-staging:8090`.
  Verify token lives in the box `.env` (`WHATSAPP_CLOUD_VERIFY_TOKEN`).
  Without `WHATSAPP_CLOUD_APP_SECRET`, inbound POSTs are refused (503) —
  safe until real creds exist.
- Access control (this build has no `WHATSAPP_CLOUD_ALLOWED_USERS`):
  `WHATSAPP_CLOUD_DM_POLICY=allowlist`, `WHATSAPP_CLOUD_ALLOW_FROM=<digits,
  intl, no +, csv>`, `WHATSAPP_CLOUD_GROUP_POLICY=disabled`.
- Toolset: `platform_toolsets.whatsapp_cloud: [hermes-telegram]` in config.yaml.
