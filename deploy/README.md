# Hetzner deploy (Docker) — Phase 0

The Hetzner box at `100.92.24.75` (Tailscale: `clawdbot-otto`, Hostname: `ubuntu-4gb-nbg1-1`) runs the dashboard as a single Caddy container, isolated from the other services on the box (Hermes/Viktor, Otto, openclaw-gateway).

## Live state (already deployed)

| What | Where |
|---|---|
| Container | `marketing-planner-caddy` (image `caddy:2-alpine`) |
| Bind address | `0.0.0.0:80` + `0.0.0.0:443` — public, behind TLS + per-client basicauth |
| App build | `/opt/marketing-planner/app-dist/` mounted RO at `/srv/app` |
| Client data | `/opt/marketing-planner/clients/` mounted RO at `/srv/data` |
| Compose file | `/opt/marketing-planner/docker-compose.yml` |
| Caddy config | `/opt/marketing-planner/Caddyfile` |

Access: **https://marketing.gfinnov.com/** (public).

Credentials are per-client basicauth on `/data/<slug>/*`. Hashes live in the Caddyfile; plaintext lives only in your password manager. Generate new ones with:
```bash
docker exec marketing-planner-caddy caddy hash-password --plaintext '<newpw>'
```
…then paste the bcrypt hash into the relevant `basicauth` block in `deploy/Caddyfile`.

## Layout

```
/opt/marketing-planner/
├── docker-compose.yml      ← scp'd from deploy/docker-compose.yml
├── Caddyfile               ← scp'd from deploy/Caddyfile
├── app-dist/               ← React build output, written by CI via rsync
└── clients/                ← per-client JSON, written live by Viktor
    └── fitvibe-demo/
        └── brief.json
```

Volumes `caddy_data` and `caddy_config` are Docker-managed (for future TLS cert storage).

## How writes work

- **CI pushes new UI build** → rsync overwrites `app-dist/` → Caddy serves new files on next request. No container restart.
- **Viktor edits client data** → writes JSON into `clients/<slug>/` → dashboard fetches the new content on next page load. No container restart.

The container itself only changes when the Caddyfile or compose file changes — rare.

## Day-to-day commands (on the box)

```bash
cd /opt/marketing-planner

docker compose ps              # is it running?
docker compose logs -f         # tail Caddy logs
docker compose restart         # if Caddyfile changed
docker compose down            # stop
docker compose up -d           # start
docker compose pull && docker compose up -d  # upgrade Caddy
```

## GitHub repo secrets — already configured

Set on `martinariasf/gf-marketing-planner` 2026-05-21:

| Secret | Current value |
|---|---|
| `HETZNER_HOST` | `46.224.224.113` (the box's public IPv4) |
| `HETZNER_USER` | `root` |
| `HETZNER_DEPLOY_KEY` | dedicated ed25519 private key (fingerprint `SHA256:uSwwzTQvapje2JXucK/DMiPh+vpvRzYkGUTf5MBRSa4`) |

The matching public key is appended to `/root/.ssh/authorized_keys` on the box, labelled `github-actions@gf-marketing-planner-2026-05-21`. The private key is also kept locally at `~/.ssh/gf-marketing-deploy` so you can rotate or revoke it later.

To list / rotate / delete:
```bash
gh secret list -R martinariasf/gf-marketing-planner
gh secret set HETZNER_DEPLOY_KEY -R martinariasf/gf-marketing-planner < ~/.ssh/new-key

# Revoke on the box:
ssh root@46.224.224.113 "sed -i '/github-actions@gf-marketing-planner/d' ~/.ssh/authorized_keys"
```

**Why the public IP, not the Tailscale IP:** GitHub-hosted runners aren't on the GF Tailnet, so they can only reach the box via its public Hetzner IP. The Caddy container is still bound to the Tailscale-only IP (`100.92.24.75:80`) — the dashboard itself stays off the public internet. SSH happens over the public IP; HTTP serving happens over Tailscale.

If you ever want to deploy from a Tailnet-only entry point, swap the workflow to use [`tailscale/github-action`](https://github.com/tailscale/github-action) (needs you to create a Tailscale OAuth client first).

## Pipeline

```
push to main (changes in app-v2/**)
   ↓
GitHub Actions: pnpm install + pnpm build → dist/
   ↓
rsync dist/ → 100.92.24.75:/opt/marketing-planner/app-dist/
   ↓
Caddy (already running) serves the new files immediately
```

## Going public (later — not Phase 0)

When ready to expose to a real domain:

1. Pick a hostname, e.g. `marketing.gf-innovative.com`. Point its DNS A/AAAA records at the box's **public** Hetzner IP.
2. Edit `/opt/marketing-planner/docker-compose.yml`:
   ```yaml
   ports:
     - "0.0.0.0:80:80"
     - "0.0.0.0:443:443"
   ```
3. Edit `/opt/marketing-planner/Caddyfile`: replace `:80 {` with `marketing.gf-innovative.com {` — Caddy will auto-fetch a Let's Encrypt cert on first request.
4. Add basic auth in the `/data/*` block to gate per-client data (one bcrypt hash per client).
5. `docker compose up -d` to apply.

Until that's done the dashboard is reachable only through Tailscale, which is what we want for the smoke test.
