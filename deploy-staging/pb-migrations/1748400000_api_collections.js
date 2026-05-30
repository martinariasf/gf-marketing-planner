/// <reference path="../pb_data/types.d.ts" />

/**
 * Phase 1 schema additions for the staging API.
 *
 *   - api_tokens  : bearer tokens issued to dashboard users and Viktor instances
 *   - audit       : append-only state-change log written by the API on every mutation
 *   - chat_messages : conversation history for the in-platform chatbot widget
 *
 * All three are written exclusively by `mp-staging-api`. The collections have
 * no public list/view/create/update/delete rules — only the superuser
 * (i.e. the API's admin client) can touch them. This is the same pattern as
 * the existing briefs/plans/goals/learnings collections.
 */

migrate(
  (app) => {
    // ── api_tokens ───────────────────────────────────────────────────────
    const apiTokens = new Collection({
      name: "api_tokens",
      type: "base",
      schema: [
        {
          name: "token",
          type: "text",
          required: true,
          options: { min: 16, max: 128 },
        },
        {
          name: "role",
          type: "select",
          required: true,
          options: { values: ["agent", "dash", "admin"] },
        },
        {
          name: "slug",
          type: "text",
          required: true,
          options: { min: 1, max: 100 },
        },
        { name: "label", type: "text" },
        { name: "revoked", type: "bool" },
        { name: "lastUsedAt", type: "date" },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_api_tokens_token ON api_tokens (token)",
      ],
    })
    app.save(apiTokens)

    // ── audit ────────────────────────────────────────────────────────────
    const audit = new Collection({
      name: "audit",
      type: "base",
      schema: [
        { name: "actor", type: "text", required: true },
        {
          name: "role",
          type: "select",
          required: true,
          options: { values: ["agent", "dash", "admin"] },
        },
        { name: "action", type: "text", required: true },
        { name: "slug", type: "text", required: true },
        { name: "resourceId", type: "text" },
        { name: "before", type: "json", options: { maxSize: 524288 } },
        { name: "after", type: "json", options: { maxSize: 524288 } },
        { name: "note", type: "text" },
      ],
      indexes: [
        "CREATE INDEX idx_audit_slug_created ON audit (slug, created)",
        "CREATE INDEX idx_audit_action ON audit (action)",
      ],
    })
    app.save(audit)

    // ── chat_messages ────────────────────────────────────────────────────
    const chat = new Collection({
      name: "chat_messages",
      type: "base",
      schema: [
        { name: "slug", type: "text", required: true },
        { name: "thread", type: "text", required: true },
        {
          name: "role",
          type: "select",
          required: true,
          options: { values: ["user", "agent", "tool", "system"] },
        },
        { name: "content", type: "text", required: true, options: { max: 32768 } },
        { name: "toolName", type: "text" },
        { name: "toolArgs", type: "json", options: { maxSize: 65536 } },
        { name: "toolResult", type: "json", options: { maxSize: 131072 } },
      ],
      indexes: [
        "CREATE INDEX idx_chat_slug_thread_created ON chat_messages (slug, thread, created)",
      ],
    })
    app.save(chat)
  },
  (app) => {
    ;["chat_messages", "audit", "api_tokens"].forEach((name) => {
      try {
        const col = app.findCollectionByNameOrId(name)
        app.delete(col)
      } catch (_) {
        // Already gone — fine.
      }
    })
  },
)
