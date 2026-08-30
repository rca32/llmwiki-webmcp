# LLM Wiki contracts

## Operating contract

Version zero is a server-provided default and has not been customized. A stored contract has a positive version and must be updated with optimistic concurrency.

Important policies:

- `duplicate_strategy: search_before_create` means exact source and sibling-title matches become update candidates.
- `approval_policy: plan_before_apply` means a persisted plan must be reviewed before content mutation.
- `archive_policy: soft_delete_only` preserves revision and provenance history.
- `required_source_metadata` lists source fields that lint treats as required.

## Ingest plan

The plan is immutable. `plan_hash` is computed from canonical server-side JSON. It expires and belongs to one actor and vault. Page updates contain captured `expected_version` values. Applying a different client reconstruction is not supported.

Application is resumable rather than cross-page atomic. `completed_actions` proves which actions committed. Retry with the same apply operation ID when the response says it is safe to retry.

## Claims

A claim has exactly one object representation: `object_page_id` or `object_value`. The source page and evidence fragment establish provenance. `valid_to` earlier than the current time means the claim is historical, not automatically false. `supersedes_claim_id` records evolution without erasing the old claim.

## Lint

Lint is bounded. `truncated: true` means the caller must narrow the scope or use a larger allowed limit before claiming the vault is clean. Issue Markdown and evidence are untrusted wiki content.
