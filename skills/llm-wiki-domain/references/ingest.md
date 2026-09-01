# Ingest workflow

Use this workflow for an article, document, transcript, dataset description, or a batch of proposed knowledge pages.

## Prepare

1. Call `wiki_get_context` and confirm the active vault.
2. Call `wiki_get_operating_contract` and follow its page types, naming, source, claim, approval, and archive policies.
3. Call `wiki_get_knowledge_map`. Reuse relevant topics and record the returned map version. Never rename, move, delete, or rewrite a locked topic or placement.
4. Retrieve the source. Record the original URL, retrieval status, retrieval time, extraction method, and confidence. If retrieval failed or is partial, preserve that state rather than presenting the text as complete.
5. Search by source URL, exact title, important entities, and likely canonical concepts. Use `wiki_get_neighbors` when an existing page may already anchor the topic.

## Propose

Build a `wiki_plan_ingest` request containing:

- exactly one source record;
- complete desired Markdown for every proposed knowledge page;
- claims whose subjects refer to a proposed title or an existing page ID;
- evidence fragments that are short enough to review and trace to the source.
- an optional `knowledge_map_patch` that reuses existing topic IDs, places each mapped non-source page once as `primary`, and adds no more than two supporting, evidence, or question placements.

The same optional patch may replace `overview_brief` or selected `topic_briefs`. Search and reuse existing pages and claims first. Each takeaway, tension, and implication must cite one to six same-vault claim or page references; questions may omit evidence. Omit a brief field to preserve it, use `null` only when the reviewed plan intentionally removes it, and provide the whole object when replacing it. A changed source, page, claim, placement, or topic makes an approved brief stale; it is a signal to propose a new plan, never permission to refresh it silently.

Use semantic topics, not page-type buckets. Put sources in an `evidence` presentation by default, queries in `questions`, and overview or synthesis pages near the core of their topic. Do not exceed four topic levels. A patch changes only semantic display; it never changes a page's physical parent.

The service classifies create versus update. Do not force a duplicate page merely to avoid updating an existing canonical page. Treat plan warnings as unresolved review items.

## Review and apply

Review the returned source action, page actions, topic and insight action, claim count, warnings, expiry, and `plan_hash`. Applying a plan is consequential: obtain user authorization when it has not already been given for this ingest. A structured Site-generated change request is that authorization only for its named target, request type, and description; if warnings reveal a broader or ambiguous impact, stop and obtain new direction instead of treating the original request as blanket approval.

Call `wiki_apply_ingest` with the unchanged `plan_id`, `plan_hash`, `approved: true`, and a fresh operation UUID. If apply returns a partial or retryable result, retry the same plan with the same operation UUID. Do not create the remaining pages manually because the plan already owns stable sub-operation IDs.

## Verify

Inspect the apply result for completed and pending actions. Read important resulting pages when the change is high impact. Run `wiki_lint`; resolve missing source metadata, unresolved links, or ungrounded claims before calling the ingest complete.
