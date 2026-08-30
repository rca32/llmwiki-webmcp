# Third-party notices

Last reviewed: 2026-08-29

## Project license

The original Liminal Wiki source code is licensed under `GPL-3.0-only`. The complete license text is included in [LICENSE](LICENSE). Third-party components remain under the licenses recorded below.

## Research baseline not included in this source tree

The product plan references [`nashsu/llm_wiki`](https://github.com/nashsu/llm_wiki) release `v0.6.11`, commit `e8082119649e6a8e1cf85eaf289adcabfdf39d4e`, licensed GPL-3.0, as a behavioral and visual research baseline. No files, components, icons, branding, or other source from that repository are included in this implementation. See [UPSTREAM_PROVENANCE.md](UPSTREAM_PROVENANCE.md) for the maintained provenance statement.

## Direct runtime dependencies

Versions and SPDX-style license identifiers below are taken from the installed packages resolved by `package-lock.json`. Follow each project link for its authoritative license text and copyright notices.

| Package            | Resolved version | License      | Project                                                                                         |
| ------------------ | ---------------: | ------------ | ----------------------------------------------------------------------------------------------- |
| `drizzle-orm`      |         `0.45.2` | `Apache-2.0` | [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm)                         |
| `fflate`           |          `0.8.2` | `MIT`        | [101arrowz/fflate](https://github.com/101arrowz/fflate)                                         |
| `katex`            |        `0.16.47` | `MIT`        | [KaTeX/KaTeX](https://github.com/KaTeX/KaTeX)                                                   |
| `mermaid`          |        `11.16.1` | `MIT`        | [mermaid-js/mermaid](https://github.com/mermaid-js/mermaid)                                     |
| `next`             |         `16.3.3` | `MIT`        | [vercel/next.js](https://github.com/vercel/next.js)                                             |
| `react`            |         `19.2.6` | `MIT`        | [facebook/react](https://github.com/facebook/react)                                             |
| `react-dom`        |         `19.2.6` | `MIT`        | [facebook/react](https://github.com/facebook/react)                                             |
| `react-markdown`   |         `10.1.0` | `MIT`        | [remarkjs/react-markdown](https://github.com/remarkjs/react-markdown)                           |
| `rehype-katex`     |          `7.0.1` | `MIT`        | [remarkjs/remark-math](https://github.com/remarkjs/remark-math/tree/main/packages/rehype-katex) |
| `remark-gfm`       |          `4.0.1` | `MIT`        | [remarkjs/remark-gfm](https://github.com/remarkjs/remark-gfm)                                   |
| `remark-math`      |          `6.0.0` | `MIT`        | [remarkjs/remark-math](https://github.com/remarkjs/remark-math/tree/main/packages/remark-math)  |
| `unist-util-visit` |          `5.0.0` | `MIT`        | [syntax-tree/unist-util-visit](https://github.com/syntax-tree/unist-util-visit)                 |

Transitive dependency versions and declared licenses remain recorded in `package-lock.json`. Before distributing a standalone source or binary package outside Sites, generate and review the complete transitive license bundle required by that distribution format.
