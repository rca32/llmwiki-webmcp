# Verification

Verification has three layers. Report each separately so a configured or built
integration is not mistaken for an end-to-end success.

## 1. Static contract

- Registration code is client-side and mounted.
- Tool names are unique and stable.
- Descriptions explain selection and prerequisites.
- Schemas are closed, bounded, and revalidated by executors.
- Annotations match real side effects.
- Privileged tools are conditionally exposed and server-authorized.
- Cleanup prevents stale or duplicate registration.

## 2. Application checks

- Run the repository's formatter or lint command.
- Run the production build.
- Run relevant unit and integration tests.
- Exercise same-origin handlers with authorized and unauthorized cases when
  practical.
- Confirm that the deployed source matches the validated revision.

## 3. Host end-to-end check

In a ChatGPT/Codex browser environment with WebMCP capability, use the host's
current equivalent of this sequence:

```js
const webmcp = await tab.capabilities.get("webmcp");
const tools = await webmcp.fetchTools();
const result = await tools.call("example_search", { query: "WebMCP" });
```

The browser harness API is host-specific and may change. The invariant is:

```text
acquire WebMCP capability -> fetch descriptors -> call a real tool
```

Record:

- exact page URL and relevant session role;
- discovered tool names;
- whether descriptions and schemas match the intended contract;
- the tool called and a concise result category;
- browser console errors or warnings;
- mutations deliberately not exercised.

## Permission matrix

For gated tools, verify at least the relevant rows:

| Session | Public reads | Update | Delete |
|---|---:|---:|---:|
| Anonymous | expected | hidden | hidden |
| Signed-in reader | expected | hidden | hidden |
| Editor | expected | expected | policy-dependent |
| Administrator | expected | expected | expected |

Tool absence can be correct behavior. Compare the result with the intended
permission matrix before diagnosing registration failure.

## Acceptance rule

Call the integration complete only when:

1. static and application checks pass;
2. the supported host discovers the expected descriptor; and
3. at least one safe tool invocation returns a semantically correct result.

If runtime access is unavailable, report the work as statically validated and
name the missing end-to-end check explicitly.
