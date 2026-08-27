# Liminal Wiki

WebMCP Native LLM Wiki is a ChatGPT Sites knowledge workspace where the human UI and page-scoped agent tools use the same authenticated APIs, optimistic concurrency rules, immutable revisions, and audit trail.

## Local development

```bash
npm install
npm run dev
```

The Sites development runtime supplies D1 and R2 bindings and a local test identity. Production never accepts the local identity adapter.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

With the development server running, exercise the rendered tree and graph views in headless Chrome:

```bash
npm run test:ui
```

Generate a new append-only migration after changing `db/schema.ts`:

```bash
npm run db:generate
```

## Implemented capabilities

- Workspace-authenticated session capabilities and owner bootstrap
- D1-backed page create, read, update, append, move, link, leaf soft-delete/restore, text search, backlinks, and graph
- Optimistic concurrency, idempotent mutations, simple YAML frontmatter validation, autosave, immutable revisions, and restore-as-new-version
- R2 revision tiering plus upload/download/checksum, 30-day attachment soft-delete/restore, quota accounting, orphan reconciliation, and retention maintenance
- Portable and full multipart backups with per-part SHA-256, explicit ACK, and full-backup revision coverage
- Resumable import sessions that validate every declared part before an empty-Site-only atomic commit
- Responsive tree, Markdown source/preview, graph, attachments, trash, revision restore, conflict, and backup-manifest UI
- Six read-only and six capability-gated write WebMCP tools using the same server APIs as the human UI

The current WebMCP mutation set is `wiki_create_page`, `wiki_update_page`, `wiki_append_page`, `wiki_move_page`, `wiki_link_pages`, and `wiki_restore_revision`. Soft delete remains UI/API-only until the late-MVP typed-confirmation tool is deliberately exposed.

See `../docs/WEBMCP_NATIVE_LLM_WIKI_DEVELOPMENT_PLAN.md` for the full phased roadmap.
