#!/usr/bin/env bash
# Sync canonical agent skills (repo) <-> a Hermes agent box.
# Usage: ./sync-agent-skills.sh <slug> [--pull] [--dry-run] [--no-restart]
#   push (default): repo core/ + clients/<slug>/ -> box, chown, restart agent
#   --pull:         box -> temp dir, diff against repo (review agent edits)
set -euo pipefail
HOST="root@100.92.24.75"
SLUG="${1:?usage: sync-agent-skills.sh <slug> [--pull] [--dry-run] [--no-restart]}"; shift || true
PULL=0; DRY=""; RESTART=1
for a in "$@"; do case "$a" in
  --pull) PULL=1;; --dry-run) DRY="--dry-run -v"; RESTART=0;; --no-restart) RESTART=0;;
  *) echo "unknown flag $a" >&2; exit 1;; esac; done
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
BOX_SKILLS="/opt/agents/$SLUG/data/skills"

if [ "$PULL" = 1 ]; then
  TMP="$(mktemp -d)"
  rsync -az "$HOST:$BOX_SKILLS/core/" "$TMP/core/"
  rsync -az "$HOST:$BOX_SKILLS/client/" "$TMP/client/" 2>/dev/null || true
  echo "== diff repo core/ vs box core/ =="
  diff -ru "$REPO_DIR/core" "$TMP/core" || true
  if [ -d "$TMP/client" ]; then
    echo "== diff repo clients/$SLUG/ vs box client/ =="
    diff -ru "$REPO_DIR/clients/$SLUG" "$TMP/client" || true
  fi
  echo "pulled copy left at: $TMP"
  exit 0
fi

# push
rsync -az --delete $DRY "$REPO_DIR/core/" "$HOST:$BOX_SKILLS/core/"
if [ -d "$REPO_DIR/clients/$SLUG" ]; then
  rsync -az --delete $DRY "$REPO_DIR/clients/$SLUG/" "$HOST:$BOX_SKILLS/client/"
fi
[ -n "$DRY" ] && { echo "dry-run only; nothing changed on box"; exit 0; }
ssh "$HOST" "chown -R 10000:10000 $BOX_SKILLS/core $BOX_SKILLS/client 2>/dev/null || true"
if [ "$RESTART" = 1 ]; then
  ssh "$HOST" "cd /opt/agents/$SLUG && docker compose restart"
fi
echo "synced skills to $SLUG (restart=$RESTART). Verify: ssh $HOST 'find $BOX_SKILLS/core $BOX_SKILLS/client -name SKILL.md | wc -l'"
