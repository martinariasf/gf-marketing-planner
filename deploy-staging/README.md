# Staging deployment (PocketBase)

Experimental branch — staging environment for the marketing-planner with a real backend.

## Architecture

```
staging.marketing.gfinnov.com
├── Caddy (reverse proxy + SPA + static Viktor data)
│   ├── /api/*  → PocketBase    (user-owned data)
│   ├── /data/* → static JSON   (Viktor-owned: posts, suggestions, perf, approvals, assets)
│   └── /*      → React SPA     (app-v2 built with VITE_PB_URL)
└── PocketBase
    ├── clients    (slug, name, industry, ...)
    ├── briefs     (slug, data JSON)
    ├── plans      (slug, data JSON)
    ├── goals      (slug, data JSON)
    └── learnings  (slug, data JSON)
```

## First-time setup on Hetzner

```bash
# 1. Create the staging directory
sudo mkdir -p /opt/marketing-planner-staging/{app-dist,clients,pb-migrations}

# 2. Copy Viktor-owned static data (one-time, or symlink to production)
cp -r /opt/marketing-planner/clients /opt/marketing-planner-staging/

# 3. Copy staging config files
# (CI does this automatically on push to experimental)

# 4. Generate the basicauth hash
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'YOUR_STAGING_PASSWORD'

# 5. Set the hash as an env var
echo 'STAGING_BCRYPT_HASH=$2a$14$...' > /opt/marketing-planner-staging/.env

# 6. Start the stack
cd /opt/marketing-planner-staging
docker compose up -d

# 7. Create the PocketBase admin account
# Open https://staging.marketing.gfinnov.com/_/ and follow the setup wizard.
# Use admin@gfinnov.com as the email.

# 8. Seed data from JSON files
cd /path/to/repo
PB_URL=https://staging.marketing.gfinnov.com \
PB_EMAIL=admin@gfinnov.com \
PB_PASSWORD=<admin-password> \
node deploy-staging/seed.mjs
```

## How it works

**User-owned data** (brief, plan, goals, learnings, client index) is stored in PocketBase.
When the user clicks "Save" in the dashboard, the merged JSON is sent to PocketBase via its REST API.
Changes are instant — no download/commit/CI step needed.

**Viktor-owned data** (posts, suggestions, performance, approvals.log, assets) stays as static JSON on disk, same as production.
Viktor writes these files, humans approve them on Telegram, then they appear in the dashboard.
This preserves the literal-approval contract.

## CI/CD

Push to `experimental` branch → GitHub Actions builds with `VITE_PB_URL` → rsyncs to staging.
Push to `main` branch → existing pipeline → rsyncs to production (no PocketBase, file-based).

## Merge to production

When staging is validated:
1. PR `experimental` → `main`
2. Set `VITE_PB_URL` in the production deploy workflow
3. Add PocketBase to the production docker-compose
4. Migrate data from staging PB → production PB (or re-seed from JSON)
