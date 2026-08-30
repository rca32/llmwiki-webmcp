---
name: chatgpt-sites-webmcp
description: Build, debug, and validate page-scoped WebMCP tools in ChatGPT Sites and compatible web applications. Use this skill whenever a user wants to implement registerTool, expose site actions to ChatGPT or Codex, use the current page login session or permissions, diagnose WebMCP tools that do not appear or cannot be called, distinguish WebMCP from a remote MCP server, or verify discovery and real tool invocation after deployment. Do not use it for ordinary website UI work, DOM-only browser automation, or standalone remote MCP servers.
---

# ChatGPT Sites WebMCP

Build a page-scoped WebMCP integration and finish with evidence that the target
host can discover and call the registered tools. Treat implementation, session
gating, and runtime verification as one workflow because a tool that merely
exists in source code is not yet a working integration.

## Establish the outcome

Infer which entry path applies:

1. **Implement** — add new page tools to a Sites or web application.
2. **Diagnose** — find why existing tools are missing, stale, or failing.
3. **Secure** — expose mutating tools only to authorized page sessions.
4. **Verify** — prove a deployed page's tools are discoverable and callable.

Ask only when the missing choice changes the tool contract, authorization
model, or deployment target. Otherwise inspect the project and proceed with the
smallest safe implementation.

## Respect the architecture boundary

Read [references/architecture-boundaries.md](references/architecture-boundaries.md)
when choosing between WebMCP, a remote MCP server, and ordinary browser
automation.

- Use WebMCP for tools that are available while a page is open and should use
  that page's current state, origin, and login session.
- Do not assume that adding a `/mcp` route makes a Sites page an independently
  connectable MCP server.
- Route an independent, always-available, server-to-server integration to an
  MCP server workflow instead of stretching WebMCP beyond its page lifecycle.
- If the task is ordinary UI construction without agent-facing page tools,
  leave this skill and use the relevant frontend or Sites workflow.

Confirm the current official OpenAI WebMCP documentation and the installed
runtime before changing an API surface. WebMCP is evolving, and current product
behavior wins over historical examples in this skill.

## Inspect before editing

1. Read repository instructions and inspect the smallest set of files that
   owns the page, session state, API handlers, and build commands.
2. Detect a Sites project from `.openai/hosting.json`. When present, follow the
   available Sites build and hosting workflows for source ownership, validation,
   and deployment rather than duplicating their internals here. Read
   [references/sites-integration.md](references/sites-integration.md) for the
   integration and deployment handoff.
3. Identify the current registration surface and lifecycle. In the verified
   Sites PoC this was `document.modelContext.registerTool()` inside a mounted
   client component.
4. Separate source-code existence from host availability. A registration call
   can exist while the current browser host exposes no WebMCP capability.
5. Preserve unrelated user changes and the project's package manager,
   framework, authentication model, and existing tests.

## Design the tool contract

Read [references/tool-design.md](references/tool-design.md) before adding or
substantially changing tools.

For each tool:

- Give it one user-meaningful job and a stable, action-oriented name.
- Write a title and description that tell the model when to call it and what it
  returns.
- Use a closed JSON Schema with explicit types, required fields, bounds, and
  `additionalProperties: false` where appropriate.
- Validate again in the executor. Treat the schema as model guidance, not a
  security boundary.
- Return concise structured results with stable identifiers and versions.
- Set read-only, destructive, idempotent, and open-world annotations according
  to actual behavior. Do not label a mutation as read-only.
- Provide actionable errors without leaking secrets, session tokens, internal
  stack traces, or unrelated user data.

Start with the smallest tool set that demonstrates the user flow. Prefer a
read-only health or search tool before adding state-changing actions.

## Implement page-scoped registration

Use [assets/templates/site-tools.tsx](assets/templates/site-tools.tsx) as a
starting point for React/ChatGPT Sites projects. Adapt it to the project's
framework and current API contract instead of copying it blindly.

1. Register from client-side code after the page mounts.
2. Guard the registration surface so the page still works in browsers without
   WebMCP.
3. Tie registration to component lifetime with an abort signal or the current
   runtime's equivalent cleanup mechanism.
4. Keep page tools thin. Put domain logic and persistence behind ordinary,
   testable application functions or same-origin API handlers.
5. Use same-origin credentials deliberately when the executor relies on the
   signed-in page session.
6. Parse and validate executor inputs before invoking domain logic.
7. Avoid duplicate registration during rerenders or development hot reload.

## Gate privileged tools

Read [references/auth-and-safety.md](references/auth-and-safety.md) whenever a
tool reads private data, writes, deletes, sends, purchases, publishes, or
performs another consequential action.

- Fetch the current session or capability state from a trusted same-origin
  endpoint before registering privileged tools.
- Register only the tools that the current user may invoke. Also enforce the
  same permission in the server-side handler; conditional registration improves
  discovery but is not authorization by itself.
- Require optimistic concurrency tokens such as `expected_version` for edits
  that could overwrite newer state.
- Require explicit confirmation fields for destructive actions and prefer
  recoverable operations such as soft deletion.
- Make retries safe when practical. Document non-idempotent behavior when it
  cannot be avoided.
- Never expose credentials, cookies, bearer tokens, or raw authorization
  decisions in tool results or logs.

## Validate in layers

Read [references/verification.md](references/verification.md) for the complete
acceptance checklist.

1. Run the project's formatter or lint command and production build.
2. Exercise application handlers directly where unit or integration tests
   exist.
3. Open the exact target page in a ChatGPT/Codex browser environment that
   advertises WebMCP support.
4. Acquire the browser's WebMCP capability and call `fetchTools()`.
5. Inspect tool names, descriptions, schemas, and annotations.
6. Call at least one harmless read-only tool with realistic input and verify
   its semantic result.
7. For permission-sensitive work, compare unauthorized and authorized sessions.
   Invoke mutations only with explicit approval and test or recoverable data.
8. Re-run discovery after navigation, login-state changes, or deployment when
   those transitions are part of the request.

Do not stop because a generic page evaluation reports that
`document.modelContext` is absent. In the verified PoC, host capability
discovery was the reliable acceptance path. Treat source inspection and generic
evaluation as diagnostics; treat `fetchTools()` plus a real call as proof.

## Diagnose failures systematically

Read [references/troubleshooting.md](references/troubleshooting.md) when the
runtime result differs from the source or local preview.

Check, in order:

1. The current host actually supports WebMCP.
2. Client registration code loaded and ran without console errors.
3. Registration survived the component lifecycle and did not duplicate.
4. The tool is not intentionally hidden by the current session's permissions.
5. The deployed asset matches the validated source version.
6. `fetchTools()` returns the expected descriptor.
7. A real call reaches the executor and returns a valid result.

Avoid repeatedly rewriting `/mcp`, deployment metadata, or browser globals
without evidence that they are the failing layer.

## Report completion

Lead with the user-visible outcome and include:

- the tools implemented or diagnosed;
- static checks and builds that passed;
- the exact discovery result;
- at least one real call and its result category;
- authorization paths tested and not tested;
- any current product or hosting limitation;
- whether the result is page-scoped WebMCP or an independent remote MCP server.

Never claim end-to-end success from configuration, source code, or a successful
build alone.
