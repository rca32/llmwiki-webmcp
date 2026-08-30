# Ingest workflow

Use this workflow for an article, document, transcript, dataset description, or a batch of proposed knowledge pages.

## Prepare

1. Call `wiki_get_context` and confirm the active vault.
2. Call `wiki_get_operating_contract` and follow its page types, naming, source, claim, approval, and archive policies.
3. Retrieve the source. Record the original URL, retrieval status, retrieval time, extraction method, and confidence. If retrieval failed or is partial, preserve that state rather than presenting the text as complete.
4. Search by source URL, exact title, important entities, and likely canonical concepts. Use `wiki_get_neighbors` when an existing page may already anchor the topic.

## Propose

Build a `wiki_plan_ingest` request containing:

- exactly one source record;
- complete desired Markdown for every proposed knowledge page;
- claims whose subjects refer to a proposed title or an existing page ID;
- evidence fragments that are short enough to review and trace to the source.

The service classifies create versus update. Do not force a duplicate page merely to avoid updating an existing canonical page. Treat plan warnings as unresolved review items.

## Review and apply

Review the returned source action, page actions, claim count, warnings, expiry, and `plan_hash`. Applying a plan is consequential: obtain user authorization when it has not already been given for this ingest.

Call `wiki_apply_ingest` with the unchanged `plan_id`, `plan_hash`, `approved: true`, and a fresh operation UUID. If apply returns a partial or retryable result, retry the same plan with the same operation UUID. Do not create the remaining pages manually because the plan already owns stable sub-operation IDs.

## Verify

Inspect the apply result for completed and pending actions. Read important resulting pages when the change is high impact. Run `wiki_lint`; resolve missing source metadata, unresolved links, or ungrounded claims before calling the ingest complete.
