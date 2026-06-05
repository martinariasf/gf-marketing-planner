#!/usr/bin/env bash
# Production PocketBase launcher — mirrors deploy-staging/pb-run.sh.
#
# Same root-cause lesson as staging: PB must be pinned to the mounted host
# volumes via --dir and --migrationsDir, or it falls back to its in-container
# binary-default data dir (ephemeral) and silently loses all data on recreate.
#
# Runs as a bare `docker run` (NOT compose-managed), on the shared
# marketing-planner_default network, bound to localhost only. Container name
# mp-prod-pb so it never collides with mp-staging-pb.
#
# One-time + after any PB image bump:
#   bash /opt/marketing-planner/pb-run.prod.sh
set -euo pipefail
cd /opt/marketing-planner
docker rm -f mp-prod-pb 2>/dev/null || true
docker run -d \
  --name mp-prod-pb \
  --restart unless-stopped \
  --network marketing-planner_default \
  -p 127.0.0.1:8091:8090 \
  -v /opt/marketing-planner/pb-data:/pb/pb_data \
  -v /opt/marketing-planner/pb-migrations:/pb/pb_migrations \
  ghcr.io/muchobien/pocketbase:latest \
  serve --http=0.0.0.0:8090 --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations
echo 'mp-prod-pb started (data dir = host ./pb-data, durable; host port 8091)'
