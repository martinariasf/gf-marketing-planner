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

# Marketing/sales focus — strip skills the bot doesn't need.
# Each company can override this layer by editing its own Dockerfile.
RUN cd /opt/hermes/skills && \
    rm -rf apple autonomous-ai-agents data-science devops dogfood gaming github \
           inference-sh mcp mlops red-teaming smart-home software-development yuanbao && \
    rm -rf creative/ascii-art creative/ascii-video creative/comfyui \
           creative/manim-video creative/p5js creative/architecture-diagram \
           creative/pixel-art creative/sketch creative/songwriting-and-ai-music \
           creative/touchdesigner-mcp creative/pretext && \
    rm -rf productivity/linear && \
    rm -rf media/heartmula media/songsee media/spotify && \
    rm -rf research/arxiv research/llm-wiki research/polymarket research/research-paper-writing

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
