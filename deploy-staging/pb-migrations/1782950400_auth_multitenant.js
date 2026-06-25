/// <reference path="../pb_data/types.d.ts" />

/**
 * GF-58 — multi-tenant auth foundation (Phase 1).
 *
 * Adds the tenancy primitives that let real per-person accounts replace the
 * edge-Caddy "username = client slug" basicauth:
 *
 *   - agencies     : the tenant/org (one per marketing agency; GF itself seeded)
 *   - memberships  : which user belongs to which agency, with a role
 *   - clients.agency_slug : which agency owns a PB-stored client
 *   - users.is_platform_admin : GF staff who see every agency/client
 *
 * Design note: everything is keyed by *slug text*, matching the existing
 * slug-centric schema (clients are referenced by slug throughout, not by PB
 * relation). `memberships.agency_slug` and `clients.agency_slug` are plain text
 * so the API can resolve "which clients may this user see" with a simple slug
 * set intersection, and so disk-only clients (which have no PB row) can carry
 * their agency in clients/index.json instead.
 *
 * Written for PocketBase v0.38 (fields/Field API). Only the API superuser
 * touches these collections — no public CRUD rules.
 */

migrate(
  (app) => {
    // ── ensure the default `users` auth collection exists ────────────────
    // A fresh PB ships one, but this instance was bootstrapped with only
    // `_superusers`. Create it if missing so memberships can reference users.
    let users
    try {
      users = app.findCollectionByNameOrId("users")
    } catch (_) {
      users = new Collection({ type: "auth", name: "users" })
      app.save(users)
      users = app.findCollectionByNameOrId("users")
    }

    // Mark GF staff as platform admins (slug "*" equivalent — sees all clients).
    if (!users.fields.getByName("is_platform_admin")) {
      users.fields.add(new Field({ type: "bool", name: "is_platform_admin" }))
      app.save(users)
    }

    // ── agencies ─────────────────────────────────────────────────────────
    const agencies = new Collection({
      type: "base",
      name: "agencies",
      fields: [
        { type: "text", name: "name", required: true, max: 200 },
        { type: "text", name: "slug", required: true, min: 1, max: 100, pattern: "^[a-z0-9-]+$" },
        { type: "select", name: "plan", maxSelect: 1, values: ["internal", "free", "pro", "enterprise"] },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_agencies_slug ON agencies (slug)"],
    })
    app.save(agencies)

    // ── memberships ──────────────────────────────────────────────────────
    const memberships = new Collection({
      type: "base",
      name: "memberships",
      fields: [
        {
          type: "relation",
          name: "user",
          required: true,
          collectionId: users.id,
          cascadeDelete: true,
          maxSelect: 1,
          minSelect: 1,
        },
        { type: "text", name: "agency_slug", required: true, min: 1, max: 100, pattern: "^[a-z0-9-]+$" },
        { type: "select", name: "role", required: true, maxSelect: 1, values: ["owner", "admin", "member"] },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_memberships_user_agency ON memberships (user, agency_slug)",
        "CREATE INDEX idx_memberships_user ON memberships (user)",
      ],
    })
    app.save(memberships)

    // ── clients.agency_slug ──────────────────────────────────────────────
    const clients = app.findCollectionByNameOrId("clients")
    if (!clients.fields.getByName("agency_slug")) {
      clients.fields.add(new Field({ type: "text", name: "agency_slug", max: 100, pattern: "^[a-z0-9-]*$" }))
      app.save(clients)
    }

    // ── seed: GF's own agency ────────────────────────────────────────────
    let gf
    try {
      gf = app.findFirstRecordByData("agencies", "slug", "gf")
    } catch (_) {
      gf = new Record(agencies)
      gf.set("name", "GF Innovative Solutions")
      gf.set("slug", "gf")
      gf.set("plan", "internal")
      app.save(gf)
    }

    // Backfill any existing PB-stored client rows to GF (disk-only clients are
    // assigned via clients/index.json instead). Best-effort; never fail here.
    try {
      const rows = app.findAllRecords("clients")
      rows.forEach((r) => {
        if (!r.getString("agency_slug")) {
          r.set("agency_slug", "gf")
          app.save(r)
        }
      })
    } catch (_) {
      // no rows / older API shape — structural change above is what matters.
    }
  },
  (app) => {
    // Rollback: drop memberships + agencies, remove the added fields.
    ;["memberships", "agencies"].forEach((name) => {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {
        /* already gone */
      }
    })
    try {
      const clients = app.findCollectionByNameOrId("clients")
      const f = clients.fields.getByName("agency_slug")
      if (f) {
        clients.fields.removeById(f.id)
        app.save(clients)
      }
    } catch (_) {
      /* ignore */
    }
    try {
      const users = app.findCollectionByNameOrId("users")
      const f = users.fields.getByName("is_platform_admin")
      if (f) {
        users.fields.removeById(f.id)
        app.save(users)
      }
    } catch (_) {
      /* ignore */
    }
  },
)
