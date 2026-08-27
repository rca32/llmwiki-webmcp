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

Generate a new append-only migration after changing `db/schema.ts`:

```bash
npm run db:generate
```

## Implemented product slice

- Workspace-authenticated session capabilities and owner bootstrap
- D1-backed page create, read, update, append, search, wikilink index, usage counters, audit events, and immutable revisions
- Optimistic concurrency and idempotent mutations
- R2 snapshots for revisions larger than 64 KB with checksum verification and cleanup
- Responsive Markdown source/preview UI with revision history and conflict messaging
- Six read-only and three capability-gated write WebMCP tools

See `../docs/WEBMCP_NATIVE_LLM_WIKI_DEVELOPMENT_PLAN.md` for the full phased roadmap.
