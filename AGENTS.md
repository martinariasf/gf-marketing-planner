# Agent Guidelines — Making Changes & Deploying the Staging Marketing Platform

**Audience:** any AI agent (Claude, Codex, etc.) or human making changes to the
Viktor Marketing Operating Dashboard / staging marketing platform.

**Why this exists:** On 2026-06-04 a set of real features was lost and the whole
staging dashboard went dark — not because of a hard bug, but because of *how*
changes were made and deployed (editing compiled bundles, never committing to
git, and deploying a frontend built the wrong way). This document encodes the
rules that prevent that from happening again. Read it before you touch this
system.

---

## 0. The one-paragraph version

Edit **source** in the **real git repo**, never compiled `dist`/`app-dist`
bundles. Commit **everything** you change to the `experimental` branch. Deploy
**only** by pushing to `experimental` (or running the GitHub Actions workflow) —
**never** by hand-building locally and rsync'ing to the box. The CI build is the
only build that sets `VITE_API_BASE`; a build without it silently breaks the
entire dashboard. Verify before and after. Leave no uncommitted changes live on
the server — the next CI run rebuilds from git and will erase them.

---

## 1. Know the system before you change it

| Thing | Where |
|---|---|
| **Canonical repo (local)** | `C:\Users\Admin\Desktop\GF Innovative Solutions\GF\marketing-planner` |
| **GitHub** | `github.com/martinariasf/gf-marketing-planner` |
| **Deploy branch (staging)** | `experimental` |
| **Frontend** | `app-v2/` — React 19 + Vite, builds to `app-v2/dist/` |
| **API** | `deploy-staging/api/` — Hono + TypeScript |
| **Agent (Viktor / Hermes)** | box: `/opt/agents/staging-demo/` (config, plugins, skills) |
| **CI deploy workflow** | `.github/workflows/deploy-staging.yml` |
| **Hetzner box** | Tailscale `100.92.24.75` / public `46.224.224.113`, user `root` |
| **Box web root (SPA)** | `/opt/marketing-planner-staging/app-dist` (served by caddy at `/srv/app`) |
| **Box client data** | `/opt/marketing-planner-staging/clients` |
| **Live URL** | `https://staging.marketing.gfinnov.com` (behind edge basicauth) |

**There is exactly one source of truth: the git repo.** If your change is not in
the repo on `experimental`, it does not really exist — it will be reverted on the
next deploy.

---

## 2. Golden rules for making changes

1. **Work in the real repo, on a real checkout.** Clone/checkout
   `gf-marketing-planner`, branch `experimental`. Do **not** invent a side
   folder with a fresh empty git repo and pull only build artifacts into it.
   *(This is exactly what went wrong: a separate workspace with no source meant
   the only copy of the work was a compiled bundle.)*

2. **Never edit compiled output.** Do not modify anything under `dist/`,
   `app-dist/`, or any minified `assets/*.js`. Those are build products. Editing
   them means:
   - there is no reviewable source,
   - `tsc`/lint/tests can't see it,
   - the next `vite build` overwrites it,
   - the change is effectively unrecoverable.
   Always change the `.tsx`/`.ts` **source** and rebuild.

3. **Commit everything you change, immediately and completely.** No
   "deployed but uncommitted" state. The CI deploy builds **from git HEAD**, so
   any hot-patch on the box or uncommitted local edit will be silently reverted
   the next time anyone deploys. If you had to touch the box directly to test,
   mirror the exact change into the repo and commit it the same session.

4. **One logical change = one commit**, with a message that says *what* and
   *why*. End AI-authored commits with a `Co-Authored-By:` trailer.

5. **Keep frontend and API changes consistent.** If a UI feature needs a new
   API route (e.g. saving a calendar range), the route must be committed in
   `deploy-staging/api/` in the same push, or the feature 500s/looks broken in
   production.

6. **Don't leave secrets or env-specific values in source.** Build-time config
   (like the API base URL) comes from the CI workflow's `env:`, not from a
   committed `.env`. (`.env.staging` only carries `VITE_PB_URL`.)

---

## 3. The deployment model (how it actually works)

Deployment is **git-push-driven CI**, not manual file copying.

- `.github/workflows/deploy-staging.yml` triggers on:
  - `push` to `experimental` touching `app-v2/**`, `deploy-staging/**`, or the
    workflow file, **and**
  - manual `workflow_dispatch`.
- The workflow:
  1. `pnpm install` + **`pnpm build` with `VITE_API_BASE` set** (this is the
     critical part — see §4),
  2. `rsync --delete` the built `dist/` to `/opt/marketing-planner-staging/app-dist`,
  3. syncs `deploy-staging/` config + rebuilds the staging **api** and **caddy**
     containers.

**To deploy: push to `experimental`, or run the workflow.** That's it.

```bash
# from the repo root, on branch experimental, with everything committed:
git push origin experimental
# or, without a new commit:
gh workflow run deploy-staging.yml --ref experimental
```

Then watch it: `gh run watch <run-id> --exit-status`.

---

## 4. ⚠️ The file-mode trap (the #1 way to break the whole dashboard)

The frontend has two modes, chosen **at build time**:

```
isApiEnabled = !!import.meta.env.VITE_API_BASE
```

- **API mode** (correct): `VITE_API_BASE` is set → the SPA talks to
  `/api/v1/*`, auth works, the dashboard and chat work.
- **File mode** (broken on staging): `VITE_API_BASE` is **unset** → the SPA
  tries to read static `/data/index.json`, gets caddy's SPA HTML fallback
  instead of JSON, swallows the parse error, and shows **"No clients yet."**
  Ask Viktor also dies ("VITE_API_BASE not set").

**Only the CI workflow sets `VITE_API_BASE`.** A plain local `pnpm build` (or any
build that forgets the env var) produces a **file-mode** bundle. If you rsync
that to the box, the entire dashboard goes dark. This is precisely what took
staging down on 2026-06-04.

**Rule: never deploy a locally/hand-built SPA. Always deploy via CI.** If you
absolutely must build locally for a test, set the env var explicitly:

```bash
VITE_API_BASE=https://staging.marketing.gfinnov.com/api/v1 pnpm build
```

**How to verify a build is API mode** (the URL lives in the *code-split
`api-client` chunk*, NOT the main `index` chunk — grep the wrong file and you'll
get a false "file mode"):

```bash
grep -l "api/v1" app-dist/assets/api-client*.js   # match = API mode = good
```

---

## 5. Pre-flight checklist (before you deploy)

- [ ] All changes are **source**, in the repo, on `experimental`.
- [ ] `git status` is clean except the files you intend to commit. No stray
      compiled artifacts, screenshots, or `node_modules` staged.
- [ ] Frontend typechecks: `cd app-v2 && npx tsc -b`
- [ ] Frontend builds: `cd app-v2 && npx vite build`
- [ ] Lint is no worse than before: `cd app-v2 && npx eslint <changed files>`
- [ ] API typechecks: `cd deploy-staging/api && npx tsc --noEmit`
- [ ] Any new UI that calls the API has its **route committed** too.
- [ ] You've read what you're about to overwrite/delete and it matches your
      expectation.
- [ ] Everything is **committed** (no "I'll commit later").

---

## 6. Post-deploy verification (after CI succeeds)

Don't claim success from a green CI run alone — confirm the live result:

- [ ] CI run is `completed / success` (`gh run watch`).
- [ ] Live bundle is **API mode**:
      `ssh root@100.92.24.75 'grep -l api/v1 /opt/marketing-planner-staging/app-dist/assets/api-client*.js'`
- [ ] API is healthy:
      `ssh root@100.92.24.75 'docker exec mp-staging-api wget -qO- http://localhost:8080/api/v1/health'`
      → expect `{"ok":true,...,"pb":"up"}`
- [ ] Clients list is non-empty (the canary for the whole app):
      hit `/api/v1/clients` with a token, or just load the site and confirm the
      client cards render.
- [ ] **Hard-reload** the browser (Ctrl+Shift+R) and click through the changed
      screens. `index.html` is cached 60s, so a normal reload picks up new
      hashed chunks after that.
- [ ] The feature you shipped actually does what it should — observe it, don't
      assume.

---

## 7. Anti-patterns — do NOT do these (each one bit us)

- ❌ **Editing the compiled `app-dist` bundle directly** instead of source.
  → No source, not reviewable, erased on next build, unrecoverable.
- ❌ **Building locally and rsync'ing to the box.** → Bypasses CI, usually
  forgets `VITE_API_BASE` → file-mode → dashboard down. Also instantly stale.
- ❌ **Hot-patching files on the box without committing.** → The next CI deploy
  rebuilds from git HEAD and silently reverts your live change.
- ❌ **Working in a throwaway folder with no real git checkout.** → The only copy
  of the work ends up being a build artifact.
- ❌ **Forgetting `VITE_API_BASE`.** → See §4.
- ❌ **Deploying with uncommitted changes in the tree.** → CI builds HEAD, not
  your tree; your edits don't ship (or worse, a *different* stale build ships).
- ❌ **Grepping the main `index-*.js` chunk to check API mode.** → False
  negative; the API base is in the `api-client-*.js` chunk.
- ❌ **Claiming "done/fixed" without observing the live result.**

---

## 8. If something breaks — rollback & recovery

- **Fastest recovery is forward:** fix the source, commit, re-run the deploy.
  Re-running CI from a known-good commit rebuilds correctly (including
  `VITE_API_BASE`).
- **Find a known-good commit:** `git log --oneline` on `experimental`; the last
  green CI deploy is a safe target. `gh workflow run deploy-staging.yml --ref <sha>`.
- **The box keeps staging copies:** prior uploads may sit under `/tmp/*-dist` /
  `/tmp/incoming-dist`. Useful for *diagnosis/diffing*, but treat them as
  read-only evidence — don't redeploy a random staged bundle (it may be
  file-mode or partial).
- **Don't restore "the last thing deployed" blindly** — it might be the thing
  that broke it. Confirm a candidate is API mode and complete first (§4, §6).
- **Diagnose at the boundary, with evidence:** check the edge caddy access logs
  (`docker logs marketing-planner-caddy`) for what the browser actually
  requested and what status it got (e.g. browser hitting `/data/index.json` =
  file mode; `/api/v1/clients` = API mode).

---

## 9. Box etiquette (Hetzner)

- The box also runs **production** Viktor (`hermes-marketing-demo`) and Otto's
  services. **Never** restart/remove containers you didn't create. Check
  `docker ps` first.
- Ports 80/443 belong to `marketing-planner-caddy`. Don't bind them.
- Treat the box as a **deploy target, not a workspace.** Make changes in the
  repo; let CI put them on the box. SSH is for inspection, diagnosis, and
  one-off ops — not for editing app source.
- PocketBase data on staging can be ephemeral across container recreate — don't
  assume box-only state is durable; the durable source of truth is the repo +
  the committed seed/migrations.

---

## 10. Quick reference

```bash
# Canonical checkout
cd "C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner"
git switch experimental

# Verify before deploy
( cd app-v2 && npx tsc -b && npx vite build )
( cd deploy-staging/api && npx tsc --noEmit )

# Deploy (the ONLY supported way)
git add <source files>
git commit -m "feat/fix(staging): … "
git push origin experimental            # triggers CI
gh run watch "$(gh run list --workflow=deploy-staging.yml --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status

# Verify after deploy (API mode + health)
ssh root@100.92.24.75 'grep -l api/v1 /opt/marketing-planner-staging/app-dist/assets/api-client*.js && docker exec mp-staging-api wget -qO- http://localhost:8080/api/v1/health'
```

---

*Last updated: 2026-06-04, after the file-mode outage + Codex compiled-bundle
recovery incident.*
