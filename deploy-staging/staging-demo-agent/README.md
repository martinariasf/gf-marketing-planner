# Staging-demo Hermes agent — deployed source-of-truth mirror
Deployed on Otto_Clawdbot (46.224.224.113) at /opt/agents/staging-demo/. Plugins + config.yaml are bind-mounted; apply by editing the box copy then 'cd /opt/agents/staging-demo && docker compose restart'.

- plugins/image_gen_openrouter/__init__.py -> /opt/agents/staging-demo/plugins/image_gen_openrouter/__init__.py  (adds image post_id auto-link and OpenRouter Seedance video generation)
- skills/video-generation/SKILL.md -> /opt/agents/staging-demo/skills/video-generation/SKILL.md
- config.yaml -> /opt/agents/staging-demo/config.yaml
