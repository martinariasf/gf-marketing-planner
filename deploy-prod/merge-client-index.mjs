#!/usr/bin/env node
/**
 * Union-by-slug merge of the repo's clients/index.json into the one already on
 * the box. Runs ON the box (verified 2026-08-28: /usr/bin/node v22.22.0 present
 * on the prod host; no jq).
 *
 * Why this exists
 * ---------------
 * deploy.yml used to rsync clients/index.json as a PLAIN OVERWRITE. The catalog
 * is the list the dashboard renders, so a shrunken catalog un-lists a live
 * client in prod immediately — even though its data survives, because the
 * per-client dir rsync deliberately has no --delete. This mirrors the existing
 * protection on assets/manifest.json in the same workflow, whose plain
 * overwrite bit prod twice (2026-06-26 and 2026-07-03).
 *
 * Semantics
 * ---------
 *   - slug in BOTH  -> the REPO entry wins (git is the source of truth for
 *                      content: name, headline, status, ...)
 *   - slug only in REPO -> added
 *   - slug only on BOX  -> PRESERVED (this is the whole point)
 *   - order: repo order first, then box-only slugs in their existing box order
 *   - key order inside an entry: the winning object's own key order
 *   - output: 2-space indent + trailing newline, written atomically (tmp+rename)
 *
 * Idempotent: running it twice with the same inputs produces the same bytes.
 *
 * If the box file is missing, the repo file is installed as-is.
 * If the box file exists but is unparseable, this FAILS loudly rather than
 * overwriting it — a corrupt catalog is an operator problem, and silently
 * replacing it would be exactly the data loss this script prevents.
 *
 * Usage: node merge-client-index.mjs <box-index.json> <repo-index.json>
 */

import fs from 'node:fs';
import path from 'node:path';

const [boxPath, repoPath] = process.argv.slice(2);

if (!boxPath || !repoPath) {
  console.error('usage: merge-client-index.mjs <box-index.json> <repo-index.json>');
  process.exit(2);
}

function readJson(file, label) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    console.error(`ERROR: cannot read ${label} (${file}): ${err.message}`);
    process.exit(2);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`ERROR: ${label} (${file}) is not valid JSON: ${err.message}`);
    console.error('Refusing to overwrite it. Fix or move the file on the box, then redeploy.');
    process.exit(2);
  }
}

function clientList(doc, label) {
  const list = doc && doc.clients;
  if (!Array.isArray(list)) {
    console.error(`ERROR: ${label} has no "clients" array.`);
    process.exit(2);
  }
  return list.filter((entry) => entry && typeof entry === 'object' && entry.slug);
}

const repoDoc = readJson(repoPath, 'repo index.json');
if (repoDoc === null) {
  console.error(`ERROR: repo index.json not found at ${repoPath}`);
  process.exit(2);
}
const repoClients = clientList(repoDoc, 'repo index.json');

const boxDoc = readJson(boxPath, 'box index.json');
const boxClients = boxDoc === null ? [] : clientList(boxDoc, 'box index.json');

const repoSlugs = new Set(repoClients.map((c) => c.slug));
const preserved = boxClients.filter((c) => !repoSlugs.has(c.slug));

// Start from the repo document so any future top-level keys the repo adds ship;
// then overwrite `clients` with the union.
const merged = { ...repoDoc, clients: [...repoClients, ...preserved] };

const out = `${JSON.stringify(merged, null, 2)}\n`;

const existing = boxDoc === null ? null : fs.readFileSync(boxPath, 'utf8');
if (existing === out) {
  console.log('client catalog unchanged (%d clients)', merged.clients.length);
} else {
  const tmp = path.join(path.dirname(boxPath), `.${path.basename(boxPath)}.tmp`);
  fs.mkdirSync(path.dirname(boxPath), { recursive: true });
  fs.writeFileSync(tmp, out, 'utf8');
  fs.renameSync(tmp, boxPath);
  console.log('client catalog written (%d clients)', merged.clients.length);
}

console.log('  from repo : %s', repoClients.map((c) => c.slug).join(', ') || '(none)');
console.log(
  '  preserved : %s',
  preserved.map((c) => c.slug).join(', ') || '(none — box had no extra slugs)',
);
