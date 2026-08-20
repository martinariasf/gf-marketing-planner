#!/opt/hermes/.venv/bin/python3
"""Add rows to the GF Platform Backlog (Notion).

Edit the `items` list below, then run:
    /opt/hermes/.venv/bin/python3 add_backlog_items.py

Each item maps to the exact schema. Valid select values are enforced by Notion;
see SKILL.md for the full list. New items default to Status="Inbox".
"""
import json, os, subprocess, sys

NOTION_KEY = os.environ.get("GF_NOTION_TOKEN")
if not NOTION_KEY:
    sys.exit("GF_NOTION_TOKEN is not set. Export the Notion integration token "
             "before running this script; it is never hardcoded here.")
DS = "377ae4b1-247e-81f9-ac36-000b8455942d"

def rt(text):
    return [{"type": "text", "text": {"content": text}}]

# ---- EDIT THIS LIST ----
items = [
    {
        "Name": "Ejemplo: título imperativo corto",
        "Type": "Bug",            # Bug | Idea | Change
        "Area": "Dashboard",      # Agent | Dashboard
        "Priority": "High",       # Urgent | High | Medium | Low
        "Proposed by": "Pilar",   # Martin | Pilar
        "Status": "Inbox",        # default for new reports
        "Description": "Qué pasa, cómo reproducirlo y la solución/causa propuesta, en español claro.",
    },
]
# ------------------------

def create(it):
    props = {
        "Name": {"title": rt(it["Name"])},
        "Type": {"select": {"name": it["Type"]}},
        "Area": {"select": {"name": it["Area"]}},
        "Priority": {"select": {"name": it["Priority"]}},
        "Proposed by": {"select": {"name": it["Proposed by"]}},
        "Status": {"select": {"name": it["Status"]}},
        "Description": {"rich_text": rt(it["Description"])},
    }
    payload = {"parent": {"type": "data_source_id", "data_source_id": DS},
               "properties": props}
    p = subprocess.run(
        ["curl", "-s", "-X", "POST", "https://api.notion.com/v1/pages",
         "-H", f"Authorization: Bearer {NOTION_KEY}",
         "-H", "Notion-Version: 2025-09-03",
         "-H", "Content-Type: application/json",
         "-d", json.dumps(payload)],
        capture_output=True, text=True)
    r = json.loads(p.stdout)
    ok = r.get("object") == "page"
    print(("OK: " if ok else "ERR: ") + it["Name"] +
          ("" if ok else " -> " + json.dumps(r)[:300]))
    return ok

if __name__ == "__main__":
    n = sum(create(it) for it in items)
    print(f"\nCreadas: {n} de {len(items)}")
