# Maintenance workflow

Use `wiki_lint` before making maintenance changes. Work from structured issue codes rather than broadly rewriting the vault.

## Triage order

1. `missing_source_metadata` and `ungrounded_claim`: evidence cannot be audited.
2. `unresolved_link`: graph navigation is broken.
3. `expired_claim`: the fact may no longer be current.
4. `duplicate_title`: canonical identity is ambiguous.
5. `orphan_page`: the page does not compound the graph.
6. `low_confidence_source`: useful but requires review or replacement.

For each issue, inspect the affected page, its neighbors, and claims before proposing a change. Use a reviewable ingest plan when maintenance changes multiple pages or claims. Preserve source pages and revision history. Prefer superseding a claim or soft-archiving content over deleting evidence.

Run lint again after applying changes and report remaining issue counts. A lower count is not sufficient if high-severity provenance issues remain.
