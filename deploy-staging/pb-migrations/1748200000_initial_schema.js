/// <reference path="../pb_data/types.d.ts" />

/**
 * Initial schema for the marketing-planner PocketBase instance.
 *
 * User-owned collections (editable through the dashboard):
 *   - clients  (slug, name, industry, logoInitials, quarter, headline, status)
 *   - briefs   (slug → clients, data JSON)
 *   - plans    (slug → clients, data JSON)
 *   - goals    (slug → clients, data JSON)
 *   - learnings (slug → clients, data JSON)
 *
 * Viktor-owned data (posts, suggestions, performance, approvals.log, assets)
 * stays on disk as static JSON — NOT stored in PocketBase.
 */

migrate(
  (app) => {
    // ── clients ──────────────────────────────────────────────────────────
    const clients = new Collection({
      name: "clients",
      type: "base",
      schema: [
        {
          name: "slug",
          type: "text",
          required: true,
          options: { min: 1, max: 100, pattern: "^[a-z0-9-]+$" },
        },
        { name: "name", type: "text", required: true },
        { name: "industry", type: "text" },
        { name: "logoInitials", type: "text", options: { max: 4 } },
        { name: "quarter", type: "text" },
        { name: "headline", type: "text" },
        {
          name: "status",
          type: "select",
          options: { values: ["active", "demo", "archived"] },
        },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_clients_slug ON clients (slug)"],
    })
    app.save(clients)

    // ── helper: create a document collection linked by slug ──────────────
    function createDocCollection(collectionName) {
      const col = new Collection({
        name: collectionName,
        type: "base",
        schema: [
          {
            name: "slug",
            type: "text",
            required: true,
            options: { min: 1, max: 100, pattern: "^[a-z0-9-]+$" },
          },
          {
            name: "data",
            type: "json",
            required: true,
            options: { maxSize: 1048576 }, // 1 MB — plenty for a brief/plan
          },
        ],
        indexes: [
          `CREATE UNIQUE INDEX idx_${collectionName}_slug ON ${collectionName} (slug)`,
        ],
      })
      app.save(col)
    }

    createDocCollection("briefs")
    createDocCollection("plans")
    createDocCollection("goals")
    createDocCollection("learnings")
  },
  (app) => {
    // Rollback: drop everything.
    ;["learnings", "goals", "plans", "briefs", "clients"].forEach((name) => {
      const col = app.findCollectionByNameOrId(name)
      app.delete(col)
    })
  }
)
