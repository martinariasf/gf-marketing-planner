#!/usr/bin/env python3
"""Prod inventory guard.

Compares two git refs and fails when the RESULT ref would REMOVE production-only
state that currently exists on the BASE ref (normally `main`).

`main` carries live production state that by policy never exists on
`experimental`:

  * client workspaces created straight from `main` by the
    `create-platform-workspace` skill (`clients/<slug>/` + an entry in
    `clients/index.json`);
  * prod-only environment keys in `deploy-prod/docker-compose.yml`
    (`AUTH_EXCHANGE_ADMINS`, `HERMES_AGENTS_JSON`, ...).

A plain 3-way merge preserves all of it. What does not is a *conflict resolved
toward experimental*, a force-push, a `git checkout experimental -- .`, or a
revert-of-a-merge. This guard exists to catch exactly that class of mistake
before it reaches `main`, because `.github/workflows/deploy.yml` then ships the
shrunken catalog to the box and un-lists a live client in production.

The check is ADDITIVE-SAFE: adding clients or keys passes, removing fails.

Usage:
    prod_inventory_guard.py --base <ref> --result <ref> [--allow-removal]
                            [--escape-hatch-note <text>]

Exit codes: 0 = ok (or explicitly waived), 1 = regression, 2 = usage/IO error.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys

INDEX_PATH = "clients/index.json"
COMPOSE_PATH = "deploy-prod/docker-compose.yml"

# Keys asserted no matter what BASE looks like. The full required set is
# (keys found on BASE) | MINIMUM_COMPOSE_KEYS, so the list below is a floor,
# not the definition.
MINIMUM_COMPOSE_KEYS = (
    "AUTH_EXCHANGE_ADMINS",
    "HERMES_AGENTS_JSON",
    "PUBLIC_API_BASE",
    "CLIENT_LANGS_JSON",
    "BOOTSTRAP_TOKENS",
)

ESCAPE_HATCH_LABEL = "allow-prod-inventory-removal"
ESCAPE_HATCH_TOKEN = "ALLOW-PROD-INVENTORY-REMOVAL"

# Matches an env-style key at the start of a YAML line: `  AUTH_EXCHANGE_ADMINS: "..."`.
# Deliberately dumb and dependency-free: service/section names in this compose
# file are lowercase, env keys are SCREAMING_SNAKE, so this separates them
# cleanly without pulling in a YAML parser.
ENV_KEY_RE = re.compile(r"^\s*([A-Z][A-Z0-9_]*)\s*:")


def git(args: list[str]) -> str:
    proc = subprocess.run(
        ["git"] + args, capture_output=True, text=True, encoding="utf-8"
    )
    if proc.returncode != 0:
        raise RuntimeError(
            "git %s failed: %s" % (" ".join(args), proc.stderr.strip())
        )
    return proc.stdout


def read_blob(ref: str, path: str) -> str | None:
    """Return file contents at <ref>:<path>, or None if the file is absent."""
    proc = subprocess.run(
        ["git", "show", "%s:%s" % (ref, path)],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if proc.returncode != 0:
        return None
    return proc.stdout


def client_slugs(ref: str) -> list[str] | None:
    """Slugs listed in clients/index.json at <ref>. None if the file is gone."""
    raw = read_blob(ref, INDEX_PATH)
    if raw is None:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("%s at %s is not valid JSON: %s" % (INDEX_PATH, ref, exc))
    entries = data.get("clients", [])
    return [e.get("slug") for e in entries if isinstance(e, dict) and e.get("slug")]


def client_dirs(ref: str) -> set[str]:
    """Top-level directory names under clients/ at <ref>."""
    out = git(["ls-tree", "--name-only", "%s:clients" % ref])
    names = set()
    for line in out.splitlines():
        name = line.strip().rstrip("/")
        if not name or name.endswith(".json"):
            continue
        names.add(name)
    return names


def compose_keys(ref: str) -> set[str]:
    raw = read_blob(ref, COMPOSE_PATH)
    if raw is None:
        return set()
    return {m.group(1) for m in (ENV_KEY_RE.match(l) for l in raw.splitlines()) if m}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, help="ref holding live prod state (main)")
    ap.add_argument("--result", required=True, help="ref that would become main")
    ap.add_argument(
        "--allow-removal",
        action="store_true",
        help="waive the guard (escape hatch already validated by the caller)",
    )
    ap.add_argument(
        "--escape-hatch-note",
        default="",
        help="human-readable reason recorded in the log when waived",
    )
    args = ap.parse_args()

    try:
        base_slugs = client_slugs(args.base)
        result_slugs = client_slugs(args.result)
        base_dirs = client_dirs(args.base)
        result_dirs = client_dirs(args.result)
        base_keys = compose_keys(args.base)
        result_keys = compose_keys(args.result)
    except RuntimeError as exc:
        print("ERROR: %s" % exc, file=sys.stderr)
        return 2

    problems: list[str] = []

    # --- 1. catalog entries -------------------------------------------------
    if base_slugs is None:
        print("note: %s absent on base %s - skipping catalog check" % (INDEX_PATH, args.base))
    elif result_slugs is None:
        problems.append(
            "%s is DELETED in the result; base %s lists: %s"
            % (INDEX_PATH, args.base, ", ".join(base_slugs) or "(none)")
        )
    else:
        missing = [s for s in base_slugs if s not in set(result_slugs)]
        for slug in missing:
            problems.append(
                "%s: client slug '%s' is on %s but MISSING from the result "
                "(deploy.yml would un-list this live client in prod)"
                % (INDEX_PATH, slug, args.base)
            )

    # --- 2. client workspace directories ------------------------------------
    for slug in sorted(base_dirs - result_dirs):
        problems.append(
            "clients/%s/ exists on %s but is MISSING from the result "
            "(a live client workspace would be removed from the repo)"
            % (slug, args.base)
        )

    # --- 3. prod-only compose env keys --------------------------------------
    required_keys = base_keys | set(MINIMUM_COMPOSE_KEYS)
    for key in sorted(required_keys - result_keys):
        origin = "on %s" % args.base if key in base_keys else "in the guard's minimum set"
        problems.append(
            "%s: env key '%s' is %s but MISSING from the result "
            "(a bad conflict resolution here silently breaks prod login / chat routing)"
            % (COMPOSE_PATH, key, origin)
        )

    # --- report -------------------------------------------------------------
    print("prod-inventory-guard")
    print("  base   : %s" % args.base)
    print("  result : %s" % args.result)
    print("  clients on base   : %s" % (", ".join(base_slugs) if base_slugs else "(none)"))
    print("  clients in result : %s" % (", ".join(result_slugs) if result_slugs else "(none)"))
    print("  client dirs on base   : %s" % (", ".join(sorted(base_dirs)) or "(none)"))
    print("  client dirs in result : %s" % (", ".join(sorted(result_dirs)) or "(none)"))
    print("  required compose keys : %s" % ", ".join(sorted(required_keys)))
    print("")

    if not problems:
        print("PASS: nothing that exists on %s is removed by this change." % args.base)
        return 0

    print("FAIL: this change would REMOVE production state from %s" % args.base)
    print("")
    for p in problems:
        print("  - %s" % p)
    print("")

    if args.allow_removal:
        print("WAIVED: escape hatch present%s" % (
            " (%s)" % args.escape_hatch_note if args.escape_hatch_note else ""
        ))
        print("Recording the removals above as INTENTIONAL and passing the check.")
        return 0

    print("How to fix (pick one):")
    print("")
    print("  1. UNINTENTIONAL (this is almost always the case) - redo the merge and")
    print("     keep main's side of the conflict:")
    print("       git checkout main && git merge experimental")
    print("       # on a clients/index.json conflict, keep EVERY slug from both sides")
    print("       git checkout --ours clients/index.json   # main's catalog wins")
    print("       # on deploy-prod/docker-compose.yml, keep main's prod-only env keys")
    print("       #   AUTH_EXCHANGE_ADMINS, HERMES_AGENTS_JSON, PUBLIC_API_BASE,")
    print("       #   CLIENT_LANGS_JSON, BOOTSTRAP_TOKENS")
    print("     ...then push the corrected branch.")
    print("")
    print("  2. INTENTIONAL removal (offboarding a client, retiring a key). Use the")
    print("     escape hatch and say why:")
    print("       a) add the PR label:  %s" % ESCAPE_HATCH_LABEL)
    print("       b) OR put a line in the PR BODY (push events: in the commit message):")
    print("            %s: <reason>" % ESCAPE_HATCH_TOKEN)
    print("     Removing a client from clients/index.json does NOT delete its data on")
    print("     the box - the per-client rsync has no --delete, and deploy.yml now")
    print("     union-merges the catalog, so a slug dropped from the repo SURVIVES on")
    print("     the box. Remove it there by hand if that is really what you want.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
