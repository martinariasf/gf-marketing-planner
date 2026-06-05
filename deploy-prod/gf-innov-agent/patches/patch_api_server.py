#!/usr/bin/env python3
# [mp-staging patch] Two fixes to the api_server platform (/v1/runs etc.), both
# idempotent + safe to run on every image build:
#  (1) Fall back to the configured agent.system_prompt when the request carries
#      no "instructions" (the dashboard chat proxy sends none) so the agent gets
#      the marketing-planner workflow, not just SOUL.md.
#  (2) Force plugin discovery BEFORE the agent snapshots its toolset, so the
#      api_server agent gets the OpenRouter plugin's richer image_generate
#      (reference_images / post_id / fidelity), not the core text-only schema.
import sys, py_compile
p = "/opt/hermes/gateway/platforms/api_server.py"
src = open(p, encoding="utf-8").read()
marker = "enabled_toolsets = sorted(_get_platform_tools(user_config, \"api_server\"))"
if marker not in src:
    print("[patch_api_server] ERROR: anchor not found; api_server.py changed upstream", file=sys.stderr); sys.exit(1)

# ---- patch (2): plugin discovery before toolset snapshot ----
disc_id = "# [mp-staging patch] discover plugin tools before toolset snapshot"
if disc_id not in src:
    disc_block = (
        "        " + disc_id + "\n"
        "        try:\n"
        "            from hermes_cli.plugins import _ensure_plugins_discovered as _mp_epd\n"
        "            _mp_epd(force=True)\n"
        "        except Exception:\n"
        "            pass\n"
    )
    src = src.replace(marker, disc_block + "        " + marker, 1)

# ---- patch (1): system_prompt fallback ----
sp_id = "# [mp-staging patch] fallback to configured agent.system_prompt"
if sp_id not in src:
    sp_block = (
        "\n        " + sp_id + "\n"
        "        # See /opt/agents/staging-demo/patches/patch_api_server.py for why.\n"
        "        if not ephemeral_system_prompt:\n"
        "            try:\n"
        "                ephemeral_system_prompt = (user_config.get(\"agent\", {}).get(\"system_prompt\") or \"\").strip() or None\n"
        "            except Exception:\n"
        "                pass"
    )
    src = src.replace(marker, marker + sp_block, 1)

open(p, "w", encoding="utf-8").write(src)
py_compile.compile(p, doraise=True)
print("[patch_api_server] applied + compiled OK")
