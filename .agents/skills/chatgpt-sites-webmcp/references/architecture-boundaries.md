# Architecture boundaries

Choose the integration from the required lifetime and state source, not from
the shared word "MCP."

| Need | Best fit | Reason |
|---|---|---|
| Act on the currently open page and its signed-in session | WebMCP | The page owns the tools and current browser state. |
| Provide an independently connectable service | Remote MCP server | The service has its own endpoint, authentication, and lifecycle. |
| Automate a site that exposes no structured tools | Browser automation | The agent must operate the UI or DOM instead of calling page tools. |
| Build an ordinary page with no agent-facing actions | Frontend or Sites workflow | No WebMCP contract is needed. |

## WebMCP characteristics

- Tools are registered by the page and exist within the page lifecycle.
- Executors can reuse same-origin APIs, application state, and the current
  user's authenticated browser session.
- Tool availability may change after login, logout, navigation, or a permission
  change.
- A compatible host must discover and invoke the tools. Source code alone does
  not make them available in every browser.

## Remote MCP characteristics

- A client connects to a server independently of an open page.
- The server owns transport, authentication, availability, and tool discovery.
- It is appropriate for background jobs, independent real-time data, and
  controlled actions that should remain callable after a page closes.

## Sites-specific lesson

The PoC first treated a deployed Sites application as if a framework route at
`/mcp` would automatically become a registered remote MCP server. The public
page worked while the presumed remote endpoint did not provide the intended
integration. Reframing the feature as page-scoped WebMCP tools matched the
product surface and enabled discovery and real calls.

Do not turn this historical observation into a universal hosting claim. Check
the current Sites documentation and runtime. Preserve the lasting boundary:
page-owned tools and an independently registered MCP server are different
architectures.

## Escalation rule

Leave this skill when all of the following are true:

1. The tools must work without the page being open.
2. Authentication belongs to the service rather than the current page session.
3. The client must configure or connect to an MCP endpoint.

Use a remote MCP server workflow in that case. A future plugin may bundle this
skill with such a server, but the architectures should remain explicit.

## Current sources

- [OpenAI WebMCP](https://learn.chatgpt.com/docs/webmcp)
- [OpenAI Build skills](https://developers.openai.com/codex/skills)
