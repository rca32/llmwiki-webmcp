# nashsu/llm_wiki source provenance

This is the canonical and only detailed record in this repository for source,
interaction patterns, and research derived from `nashsu/llm_wiki`. It
consolidates the former production import record and the production and
recovery provenance notes.

## Pinned source

- Repository: <https://github.com/nashsu/llm_wiki>
- Release: `v0.6.11`
- Commit: `e8082119649e6a8e1cf85eaf289adcabfdf39d4e`
- License: GPL-3.0
- Last compared: 2026-08-30

## Production Site file mapping

The production source in `site/` selectively imports or adapts the following
files and interaction patterns.

| Upstream path                              | Liminal Wiki path                                                         | Import kind                    | Sites-specific modifications                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/utils.ts`                         | `site/lib/utils.ts`                                                       | Direct port                    | Formatting only; retains `clsx` and `tailwind-merge` composition.                                                                                                                                                                                                                                                                                                                      |
| `src/components/ui/button.tsx`             | `site/components/ui/button.tsx`                                           | Direct selective port          | Preserves the Base UI and CVA structure, trims unused variants, and normalizes project formatting.                                                                                                                                                                                                                                                                                     |
| `src/components/ui/tooltip.tsx`            | `site/components/ui/tooltip.tsx`                                          | Direct selective port          | Preserves the Base UI provider/root/trigger/popup structure and reduces the animation utility surface.                                                                                                                                                                                                                                                                                 |
| `src/components/ui/scroll-area.tsx`        | `site/components/ui/scroll-area.tsx`                                      | Direct selective port          | Preserves the Base UI viewport and scrollbar structure and normalizes formatting.                                                                                                                                                                                                                                                                                                      |
| `src/components/ui/resizable.tsx`          | `site/components/ui/resizable.tsx`                                        | Direct port                    | Preserves the `react-resizable-panels` group, panel, and separator wrapper.                                                                                                                                                                                                                                                                                                            |
| `src/index.css`                            | `site/app/workspace.css`                                                  | Tokens and layout port         | Retains the pinned neutral OKLCH light/dark token system, Geist typography, radius scale, sidebar tokens, and compact workspace density; removes desktop-only root/titlebar styling.                                                                                                                                                                                                   |
| `src/components/layout/app-layout.tsx`     | `site/app/page.tsx`                                                       | Adapted port                   | Replaces local project/store loading with authenticated HTTP state; retains the icon rail, collapsible left panel, resizable center/right panels, and full-height workspace.                                                                                                                                                                                                           |
| `src/components/layout/icon-sidebar.tsx`   | `site/components/layout/icon-sidebar.tsx`                                 | Adapted port                   | Replaces Zustand, i18n, daemon, update, and research dependencies with controlled Sites navigation props; removes upstream logo and non-MVP desktop features.                                                                                                                                                                                                                          |
| `src/components/layout/knowledge-tree.tsx` | `site/components/layout/knowledge-tree.tsx`                               | Adapted port                   | Replaces filesystem traversal and local commands with D1 page records and server-authorized callbacks; retains semantic type groups, counts, expansion, compact rows, search, and trash access.                                                                                                                                                                                        |
| `src/components/editor/wiki-editor.tsx`    | `site/components/editor/wiki-editor.tsx`                                  | Adapted interaction port       | Replaces Milkdown, filesystem writes, and built-in LLM editing with controlled Markdown state and CAS save callbacks; retains the read/edit switch, document header, status bar, and dense editor layout.                                                                                                                                                                              |
| `src/components/editor/wiki-reader.tsx`    | `site/app/markdown-preview.tsx`, `site/components/editor/wiki-editor.tsx` | Adapted renderer port          | Keeps the existing GFM/KaTeX/Mermaid/wikilink renderer as the data-safe implementation and aligns reader hierarchy and neutral prose styling to the pinned component.                                                                                                                                                                                                                  |
| `src/components/search/search-view.tsx`    | `site/components/search/search-view.tsx`                                  | Adapted interaction port       | Replaces filesystem search with `/api/search`; retains the focused search surface, result metadata, excerpts, empty state, and single-click open.                                                                                                                                                                                                                                      |
| `src/components/graph/graph-view.tsx`      | `site/components/graph/graph-view.tsx`                                    | Direct visual/interaction port | Retains the Sigma/Graphology canvas, ForceAtlas2 layout, node sizing and type/community colors, hover-neighborhood emphasis, toolbar, zoom controls, legend, insights rail, and document preview. Replaces local graph construction, filesystem reads/writes, deep research, Zustand, and i18n with `/api/graph`, `/api/pages/:id`, controlled props, and the Sites Markdown renderer. |

## Explicit production exclusions

- `src-tauri/**`
- `src/commands/fs.ts` and Tauri command wrappers
- desktop initialization and absolute local paths
- local wiki stores as the source of truth
- settings, chat, local source ingest, provider configuration, and built-in LLM
  editing
- deep research queues and local research state
- local API/MCP server, tray, watcher, autostart, and CLI integration
- upstream logo, product name, and other branding

## Recovery Site status

The isolated `recovery-site/` implementation was built from the OpenAI Sites
starter and does not copy the pinned project's application components, icons,
branding, Tauri filesystem adapter, or other source files. Its generic
icon-rail, page-tree, Markdown editor/preview, and revision-panel layout was
used as a behavioral and visual research baseline only.

If source is imported into `recovery-site/` later, its file, pinned revision,
modifications, and license handling must be added to this record before
release.

## License handling

This repository is distributed as `GPL-3.0-only`. The complete license text is
in the root `LICENSE` and is repeated in each independently buildable Site
package. Imported and adapted production files remain covered by that project
license. This record preserves the pinned origin, import classification,
modification history, exclusions, and recovery-site non-import status.

Direct runtime dependency licenses remain recorded in
`site/THIRD_PARTY_NOTICES.md` and `recovery-site/THIRD_PARTY_NOTICES.md`.
