# Troubleshooting

Diagnose the first failing layer rather than changing every layer at once.

| Symptom | Likely layer | Checks |
|---|---|---|
| `fetchTools()` is unavailable | Host capability | Confirm the page is open in a WebMCP-compatible ChatGPT/Codex browser and current product access supports it. |
| `fetchTools()` returns no tools | Client lifecycle | Confirm the registration component mounted, the browser console is clean, and the current registration API matches the runtime. |
| Some tools are missing | Authorization | Inspect the current session capability response and intended permission matrix. |
| Tools appear more than once | Lifecycle | Ensure registration occurs once and cleanup aborts or unregisters on unmount. |
| Descriptor appears but call fails | Executor or API | Validate input parsing, same-origin credentials, server authorization, and result serialization. |
| Local preview works but deployment does not | Deployment/source drift | Confirm deployed assets match the validated source and rerun host discovery on the exact URL. |
| Root page works but `/mcp` fails | Architecture | Decide whether the goal is page-scoped WebMCP or an independently registered remote MCP server. Do not assume they are interchangeable. |
| Generic evaluation says `modelContext` is missing while tools are discoverable | Diagnostic mismatch | Trust the host WebMCP capability and real call for acceptance; use generic evaluation only as a clue. |
| Tools disappear after login or navigation | Page/session lifecycle | Revisit when and where registration runs and whether capability changes require re-registration. |

## Console errors

Capture errors around registration and execution, but keep messages safe. Useful
categories include:

- unsupported registration surface;
- invalid descriptor or schema;
- session lookup failure;
- executor input validation failure;
- same-origin API authorization failure;
- stale version conflict.

## Minimal recovery sequence

1. Reproduce on the exact page and session role.
2. Check console errors.
3. Confirm the client component mounted.
4. Confirm session capability flags.
5. Fetch descriptors.
6. Call one read-only tool.
7. Change only the first broken layer.
8. Rebuild, redeploy if necessary, and repeat discovery plus call.
