# Upstream provenance

Liminal Wiki selectively ports GPL-3.0 code and interaction patterns from
[`nashsu/llm_wiki`](https://github.com/nashsu/llm_wiki) release `v0.6.11`,
commit `e8082119649e6a8e1cf85eaf289adcabfdf39d4e`.

The imported work is modified for ChatGPT Sites: Tauri filesystem commands,
desktop initialization, local stores, built-in LLM/chat, deep research, local
MCP, tray, watcher, CLI, and upstream branding are excluded. Human UI and
page-scoped WebMCP tools continue to use the same authenticated HTTP/domain
layer backed by D1 and R2.

The authoritative file-by-file import and modification record is maintained in
[`docs/UPSTREAM_LLM_WIKI.md`](docs/UPSTREAM_LLM_WIKI.md). The complete GPL-3.0
license text remains in [`LICENSE`](LICENSE), and direct dependency licenses
are listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

Last upstream comparison: 2026-08-30.
