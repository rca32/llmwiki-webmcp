# ChatGPT Sites integration

Use this reference when the target repository contains `.openai/hosting.json`
or the user explicitly targets ChatGPT Sites.

## Ownership

Use the installed Sites build and hosting workflows for project setup,
validation, deployment, and browser handoff. This skill owns the WebMCP tool
contract and its runtime verification; it should not duplicate or override
Sites deployment rules.

## React integration pattern

1. Put registration in a small client component.
2. Mount that component once near the application root or the route whose
   lifecycle should own the tools.
3. Keep the component visually empty unless the product requires a status UI.
4. Delegate data work to ordinary same-origin handlers or domain functions.
5. Abort registration during unmount and avoid duplicate registration during
   development hot reload.

The template at `assets/templates/site-tools.tsx` demonstrates this shape.

## Session-aware tools

Use a small same-origin session endpoint to return capability flags. Register
public tools immediately or after the capability check, then add authorized
mutations only for eligible sessions. The server handler must repeat the
authorization check.

## Deployment loop

After source validation:

1. Deploy through the current Sites hosting workflow.
2. Open the exact deployed URL in the supported ChatGPT/Codex browser.
3. Discover tools from the host WebMCP capability.
4. Call a harmless tool.
5. Recheck gated tools with the intended session role when required.

Do not substitute a successful local build, a reachable root page, or a generic
browser evaluation for the final host discovery test.
