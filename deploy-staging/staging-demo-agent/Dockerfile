# Extend the upstream hermes-agent image with our custom plugins.
#
# We build the base image once on the host (under /opt/agents/_upstream) and
# tag it as `hermes-agent:base`. This image just layers plugins on top so
# rebuilds are fast.

FROM hermes-agent:base-v2026.7.1

# Postiz CLI — official `postiz` package from gitroomhq/postiz-agent.
# Auth via POSTIZ_API_KEY env var; no browser flow needed.
USER root
RUN npm install -g postiz@latest && postiz --version

# [mp-staging] Bake the WhatsApp (Baileys) bridge deps into the image so a
# rebuild can't silently break WhatsApp. The upstream bridge package.json pins
# Baileys to a git ref that *current* WhatsApp rejects at link time ("couldn't
# link the device"); pin a known-good registry build instead and install.
# (The paired session + per-user approval live in the mounted ./data volume
# and survive rebuilds on their own — only node_modules needs baking here.)
# To bump WhatsApp compatibility later, change the version below and rebuild.
RUN cd /opt/hermes/scripts/whatsapp-bridge \
 && sed -i 's#"@whiskeysockets/baileys": *"[^"]*"#"@whiskeysockets/baileys": "7.0.0-rc13"#' package.json \
 && npm install --no-audit --no-fund \
 && node -e "import('@whiskeysockets/baileys').then(()=>console.log('baileys load OK')).catch(e=>{console.error(e);process.exit(1)})"

# Strip ALL bundled Hermes skills. Startup re-syncs /opt/hermes/skills into
# the agent data/skills on every boot, so anything left here silently
# reappears. Real skills are repo-canonical (agent-skills/) via sync-agent-skills.sh.
RUN cd /opt/hermes/skills && rm -rf -- */ && ls -A
# [mp-staging patch] Make api_server (/v1/runs) inherit the configured
# agent.system_prompt so the in-app dashboard agent follows the marketing
# API workflow (image_gen -> copy -> manifest -> PATCH /posts).
COPY --chown=root:root patches/patch_api_server.py /tmp/patch_api_server.py
RUN /opt/hermes/.venv/bin/python3 /tmp/patch_api_server.py

# [mp-staging] Let the staging agent install dependencies it needs at runtime.
# STAGING ONLY — this image is the isolated staging-demo agent, never production.
#   - Install sudo and grant the `hermes` runtime user passwordless sudo so the
#     agent can `sudo apt-get install <pkg>` system packages. Plain `sudo <cmd>`
#     passes Hermes' command guard; only `sudo -S/-s/-a` privilege flags are
#     gated, and those are never needed with a NOPASSWD rule.
RUN apt-get update \
 && apt-get install -y --no-install-recommends sudo \
 && rm -rf /var/lib/apt/lists/* \
 && printf 'hermes ALL=(ALL) NOPASSWD: ALL\n' > /etc/sudoers.d/10-hermes-staging \
 && chmod 0440 /etc/sudoers.d/10-hermes-staging \
 && visudo -cf /etc/sudoers.d/10-hermes-staging

USER 10000

# Copy custom plugins into the user-plugin directory that hermes scans at
# startup. HERMES_HOME=/opt/data is set by the base image, so the plugin
# loader looks at /opt/data/plugins/<name>/.
COPY --chown=10000:10000 plugins/ /opt/data/plugins/

# Copy default config (will be overridden by anything the user creates in
# the mounted volume — config.yaml in /opt/data wins at runtime).
COPY --chown=10000:10000 config.yaml /opt/hermes/default-config.yaml

# [mp-staging] Add pip INTO the venv (uv is already on PATH for `uv pip
# install`, but the agent instinctively types `pip install`). Run as the
# hermes user so the new site-packages stay hermes-owned and writable for
# later runtime installs.
# [2026-07-04] new base (v2026.7.1) ships a root-owned venv: install pip as
# root, then hand the venv to the hermes uid so runtime installs keep
# working (STAGING ONLY).
USER root
RUN UV_CACHE_DIR=/tmp/uvcache VIRTUAL_ENV=/opt/hermes/.venv uv pip install pip \
 && rm -rf /tmp/uvcache \
 && chown -R 10000:10000 /opt/hermes/.venv
USER 10000

# Default command stays the same (gateway run) — inherited from base.
