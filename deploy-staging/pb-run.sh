#!/usr/bin/env bash
# PocketBase container launcher for staging — RECORDED so the data-dir flags
# are never lost again.
#
# Root-cause history: PB was originally started with a bare
#   serve --http=0.0.0.0:8090
# which made PocketBase fall back to its BINARY-default data dir
# (/usr/local/bin/pb_data, INSIDE the container = ephemeral) and ignore the
# mounted ./pb-data volume (which sat empty with a 0-byte data.db). All chat
# history / overlays would have been lost on any container recreation.
#
# Fix: pin --dir and --migrationsDir at the mounted host volumes. The host
# ./pb-migrations now holds the REAL auto-generated migrations (the stale
# 1748* initial files were moved to pb-migrations-stale-backup-*).
set -euo pipefail
cd /opt/marketing-planner-staging
docker rm -f mp-staging-pb 2>/dev/null || true
docker run -d   --name mp-staging-pb   --restart unless-stopped   --network marketing-planner_default   -p 127.0.0.1:8090:8090   -v /opt/marketing-planner-staging/pb-data:/pb/pb_data   -v /opt/marketing-planner-staging/pb-migrations:/pb/pb_migrations   ghcr.io/muchobien/pocketbase:latest   serve --http=0.0.0.0:8090 --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations
echo 'mp-staging-pb started (data dir = host ./pb-data, durable)'
