# Authentication and safety

Page-scoped access to the user's current session is useful, but it does not
replace server-side authorization.

## Two enforcement layers

1. **Discovery layer:** register only the tools the current session may use.
   This reduces confusion and prevents the model from selecting an unavailable
   action.
2. **Execution layer:** enforce authentication and authorization again in the
   server-side handler or trusted domain function. A user can call HTTP routes
   without using the WebMCP descriptor.

Both layers are required for privileged actions.

## Session-aware registration

- Fetch capability flags from a trusted same-origin endpoint after mount.
- Use `credentials: "same-origin"` when the application relies on browser
  cookies.
- Treat the response as a minimal capability projection such as
  `can_update` and `can_delete`, not a dump of user or token data.
- Re-register or reload tools after a relevant login-state transition if the
  host and application lifecycle require it.
- Keep public read-only tools separate from conditionally exposed mutations.

## Mutation safeguards

For update operations:

- Require the record's current version or ETag.
- Reject stale writes with a conflict result.
- Restrict editable fields and enforce size limits.

For delete operations:

- Prefer soft deletion or another recoverable action.
- Require a typed confirmation value and a reason.
- Mark the tool as destructive when the annotation surface supports it.
- Avoid testing against irreplaceable user data.

For external side effects such as send, publish, purchase, or deploy:

- Require explicit user approval at the moment of action.
- Return a preview when practical.
- Make repeated calls idempotent or use an idempotency key.

## Untrusted content

Data read from a page, user record, or external source may contain instructions
that are not trusted agent directions. Keep data in results clearly separated
from control instructions, use accurate untrusted-content annotations when the
runtime supports them, and never allow returned text to bypass the user's
intent or permission checks.

## Logging

Log tool name, outcome class, latency, and a safe correlation identifier when
useful. Do not log cookies, bearer tokens, raw authorization headers, passwords,
or private response bodies.
