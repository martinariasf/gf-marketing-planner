#!/usr/bin/env bash
# GF-19 — provision a per-client read-only Drive service account.
#
# Creates (idempotently) a free service account for one client in the shared
# "robot factory" GCP project and emits its JSON key + the exact instruction to
# give the client. Service accounts are free, so this is a loop over 25-50
# clients, never 50 manual Gmail signups.
#
# Prereqs (one-time, done by a human — see TASK-002):
#   - A GCP project exists with the Google Drive API enabled.
#   - `gcloud` is installed and authenticated: `gcloud auth login`.
#
# Usage:
#   ./provision_drive_sa.sh <client-slug> [project-id]
#
# Example:
#   ./provision_drive_sa.sh biomas gf-agents-drive
#
# Output:
#   - keys/<slug>-drive-sa.json   (the credential — keep secret, chmod 600)
#   - the SA email + a copy-paste client share instruction
set -euo pipefail

SLUG="${1:?usage: provision_drive_sa.sh <client-slug> [project-id]}"
PROJECT="${2:-${GCP_DRIVE_PROJECT:-gf-agents-drive}}"
SA_NAME="viktor-${SLUG}"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
KEY_DIR="$(dirname "$0")/keys"
KEY_FILE="${KEY_DIR}/${SLUG}-drive-sa.json"

echo "Project: ${PROJECT}"
echo "Service account: ${SA_EMAIL}"

# 1. Create the service account (idempotent: ignore "already exists").
if gcloud iam service-accounts describe "${SA_EMAIL}" --project "${PROJECT}" >/dev/null 2>&1; then
  echo "  - service account already exists, reusing it."
else
  gcloud iam service-accounts create "${SA_NAME}" \
    --project "${PROJECT}" \
    --display-name "Viktor Drive (read-only) — ${SLUG}"
  echo "  - created."
fi

# 2. Mint a JSON key (only if we don't already have one locally).
mkdir -p "${KEY_DIR}"
if [[ -f "${KEY_FILE}" ]]; then
  echo "  - key already present at ${KEY_FILE} (not regenerating)."
else
  gcloud iam service-accounts keys create "${KEY_FILE}" \
    --iam-account "${SA_EMAIL}" --project "${PROJECT}"
  chmod 600 "${KEY_FILE}"
  echo "  - key written to ${KEY_FILE} (chmod 600)."
fi

cat <<EOF

------------------------------------------------------------------
NEXT STEPS for client "${SLUG}"
------------------------------------------------------------------
1. Send the client this one-liner:

   "Open your Google Drive, right-click the folder you want Viktor to
    use, choose Share, paste this address, set it to Viewer, and Send:

        ${SA_EMAIL}

    Viktor will only ever access this one folder."

2. Get the folder ID (the part of the folder URL after /folders/).

3. In /opt/agents/${SLUG}/.env set:
        GDRIVE_FOLDER_ID=<the folder id>
        GDRIVE_SA_KEY_FILE=/run/secrets/drive-sa.json

4. Mount the key into the container. Copy it next to docker-compose.yml as
   ./secrets/drive-sa.json and add this volume line (or set GDRIVE_SA_KEY as
   base64 in .env instead and skip the mount):
        cp "${KEY_FILE}" /opt/agents/${SLUG}/secrets/drive-sa.json
        # docker-compose.yml volumes:
        - ./secrets/drive-sa.json:/run/secrets/drive-sa.json:ro

   Then: docker compose up -d --force-recreate

NOTE: this SA can only READ. Write-back is GF-19 Phase 2.
------------------------------------------------------------------
EOF
