# `drive` plugin — read-only Google Drive (GF-19 Phase 1)

Gives Viktor read access to **one** client-controlled Drive folder, so it can
pull logos, brand assets, briefs, and reference images (e.g. into
`image_generate`). Read-only by design — write-back is GF-19 Phase 2.

## Tools
- `drive_list_files` — list files/subfolders in the connected folder (`folder_id`
  to descend, `recursive=true` to walk all).
- `drive_read_file` — read one file: Docs/Sheets/Slides as text; images saved to
  a local path usable as an `image_generate` reference; other binaries → metadata.

## Isolation (why one agent can't read another's folder)
Each stack holds **only its own** service-account key and is pointed at **one**
`GDRIVE_FOLDER_ID`. Access is folder-scoped at two layers: the credential (the
client only shared that one folder with this SA) and the code (every call is
constrained to descendants of the configured root; no "shared with me" listing).
Anything else → Google `403/404`.

## Onboard a client (read-only)
1. **One-time:** a GCP project with the Drive API enabled (the "robot factory").
2. Run `./provision_drive_sa.sh <client-slug> <project-id>` → creates the SA and
   writes `keys/<slug>-drive-sa.json` (gitignored). It prints the SA email and
   the exact share instruction for the client.
3. Client shares their folder with the SA email as **Viewer**.
4. In the client's stack `.env`:
   ```
   GDRIVE_FOLDER_ID=<folder id from the folder URL>
   GDRIVE_SA_KEY_FILE=/run/secrets/drive-sa.json   # mount keys/<slug>-drive-sa.json here
   # or, instead of a file: GDRIVE_SA_KEY=<base64 of the JSON key>
   # GDRIVE_MAX_READ_MB=10   # optional per-file read cap
   ```
   Mount the key file read-only via docker-compose, `chmod 600` on the host.
5. Rebuild/restart: `docker compose up -d --force-recreate`.

## Dependencies
`google-api-python-client` and `google-auth` must be in the agent venv. The
in-repo prod Dockerfile installs them; the staging box Dockerfile
(`/opt/agents/staging-demo`) needs the same `pip install` line added.

## Verify
- `hermes tools | grep drive_` lists both tools.
- `drive_list_files` returns the shared folder's contents; `drive_read_file`
  returns a known file.
- **Isolation test:** point `GDRIVE_FOLDER_ID` at a folder NOT shared with the SA
  → tools refuse / Google returns 403/404.
- Unset the env → tools report "not connected"; the agent otherwise works.
