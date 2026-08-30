# Tool design

Design tools for model selection, safe execution, and stable application
behavior.

## Descriptor checklist

For every tool, define:

- `name`: stable identifier using the project's naming convention;
- `title`: short user-facing label;
- `description`: when to call the tool, important prerequisites, and result;
- `inputSchema`: closed, bounded JSON Schema;
- annotations that accurately describe side effects and external access;
- an executor that validates inputs and returns a stable result shape.

## Description pattern

Use this sequence:

```text
[Action and object]. [When or prerequisite]. [Important result or constraint].
```

Example:

```text
Search active knowledge notes by title, summary, body, and tags. Use this before
requesting a note by ID. Returns concise matches with stable IDs and versions.
```

Avoid vague descriptions such as "Manages notes" and avoid hiding required
call order only in human-facing documentation.

## Input schema

- Prefer strings, integers, booleans, enums, and bounded arrays over free-form
  nested objects.
- Set minimum and maximum lengths or values where the domain provides natural
  limits.
- Mark required inputs explicitly.
- Use `additionalProperties: false` unless extensibility is intentional.
- Describe identifiers, confirmation fields, and concurrency tokens.
- Validate again at runtime with the project's existing validation library or
  focused manual checks.

## Result shape

Return compact data that both the model and application can reason about:

```json
{
  "found": true,
  "item": {
    "id": "note-123",
    "version": 4,
    "title": "WebMCP verification"
  }
}
```

Prefer stable keys over prose-only success messages. Exclude secrets, internal
authorization data, and fields unrelated to the task.

## Tool granularity

Keep one job per tool. A common read flow is:

```text
health -> search -> get
```

A common mutation flow is:

```text
get current version -> update with expected_version
```

Do not combine search, update, and delete behind an `action` enum merely to
reduce the number of descriptors. Separate tools make selection and safety
properties clearer.

## Error behavior

Distinguish these cases with actionable, non-sensitive messages:

- invalid input;
- unauthenticated or unauthorized session;
- item not found;
- version conflict;
- upstream or application failure.

Do not return raw stack traces, cookie values, session IDs, SQL errors, or
secret-bearing upstream responses.
