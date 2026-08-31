# Live WebMCP evaluation — 2026-08-28

## Target

- Target: ephemeral ChatGPT Sites deployment; its generated URL is intentionally
  not persisted in this reusable evaluation record
- Hosting: ChatGPT Sites, owner-only access
- Runtime: Codex in-app browser with an authenticated ChatGPT session
- Fixture source: `live-webmcp-eval` (local-only and ignored by the skill repository)

## Static and application checks

| Check                                   | Result            |
| --------------------------------------- | ----------------- |
| ESLint                                  | Pass, no warnings |
| Vinext production build                 | Pass              |
| Deployed revision matches pushed source | Pass              |
| Browser console errors                  | None              |

## Host discovery

The deployed page exposed three page-scoped, read-only tools through the host
WebMCP capability and `fetchTools()`:

1. `webmcp_eval_health`
2. `webmcp_eval_search`
3. `webmcp_eval_get_case`

All descriptors reported the deployed Sites origin, closed object schemas, and
`readOnlyHint: true`.

## Real calls

| Call                                                   | Observed semantic result                                    |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| `webmcp_eval_health({})`                               | `ok: true`, `scope: page`, `tool_count: 3`, `case_count: 3` |
| `webmcp_eval_search({ query: "runtime", limit: 2 })`   | One `runtime-verification` match                            |
| `webmcp_eval_get_case({ id: "runtime-verification" })` | Full case with expected discovery and call evidence         |

## Verdict

Pass. The result satisfies the skill's acceptance rule: application checks
passed, the supported host discovered the intended descriptors, and multiple
safe calls returned semantically correct results. This validates page-scoped
WebMCP behavior; it does not turn the site into an independently callable
remote MCP server.
