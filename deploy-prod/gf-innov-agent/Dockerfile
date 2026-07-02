# Extend the upstream hermes-agent image with our custom plugins.
#
# We build the base image once on the host (under /opt/agents/_upstream) and
# tag it as `hermes-agent:base`. This image just layers plugins on top so
# rebuilds are fast.

FROM hermes-agent:base

# Postiz CLI — official `postiz` package from gitroomhq/postiz-agent.
# Auth via POSTIZ_API_KEY env var; no browser flow needed.
USER root
RUN npm install -g postiz@latest && postiz --version

# Google Drive client libs for the read-only `drive` plugin (GF-19). Installed
# into the hermes venv so the plugin imports cleanly at startup. The staging box
# Dockerfile (/opt/agents/staging-demo) needs the same line — see the GF-19
# onboarding runbook.
RUN /opt/hermes/.venv/bin/pip install --no-cache-dir \
      google-api-python-client google-auth

# Strip ALL bundled Hermes skills. Startup re-syncs /opt/hermes/skills into
# the agent's data/skills on every boot, so anything left here silently
# reappears (and re-consumes context) even after being parked on the box.
# The agent's real skills are repo-canonical (agent-skills/ core + client)
# and are deployed to the data/skills bind mount by sync-agent-skills.sh.
RUN cd /opt/hermes/skills && rm -rf -- */ && ls -A

# [mp-prod parity 2026-06-05] Patch the api_server platform (/v1/runs etc.) so
# the in-app dashboard chat (a) inherits the configured agent.system_prompt when
# the request carries no "instructions" (the chat proxy sends none) -> the agent
# follows the marketing API workflow, not just SOUL.md; and (b) forces plugin
# discovery BEFORE the agent snapshots its toolset -> it gets the OpenRouter
# image_generate override (post_id / reference_images / fidelity), not the
# core text-only schema. Idempotent; mirrors staging. See patches/ for details.
COPY --chown=root:root patches/patch_api_server.py /tmp/patch_api_server.py
RUN /opt/hermes/.venv/bin/python3 /tmp/patch_api_server.py
USER 10000

# Copy custom plugins into the user-plugin directory that hermes scans at
# startup. HERMES_HOME=/opt/data is set by the base image, so the plugin
# loader looks at /opt/data/plugins/<name>/.
COPY --chown=10000:10000 plugins/ /opt/data/plugins/

# Copy default config (will be overridden by anything the user creates in
# the mounted volume — config.yaml in /opt/data wins at runtime).
COPY --chown=10000:10000 config.yaml /opt/hermes/default-config.yaml

# Default command stays the same (gateway run) — inherited from base.
