# Liminal Wiki

Liminal Wiki는 사람과 에이전트가 같은 데이터·권한·명령 계층을 사용하는 ChatGPT Sites 기반 Markdown 지식 작업공간입니다. 브라우저 UI와 page-scoped WebMCP를 통해 여러 vault, revision, attachment, source-grounded ingest와 claim provenance를 관리합니다.

## Repository layout

- [`site/`](site/): production Site source
- [`recovery-site/`](recovery-site/): isolated restore and recovery validation Site
- [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md): architecture, contracts, security, operations, and release evidence
- [`skills/llm-wiki-domain/`](skills/llm-wiki-domain/): canonical source-grounded wiki Agent Skill
- [`.agents/skills/`](.agents/skills/): repository-local Codex skill entry points

## Local development

```bash
cd site
npm ci
npm run dev
```

## Quality checks

```bash
cd site
npm run format:check
npm run lint
npm run typecheck
npm test
npm run db:check
npm run test:notices
npm run build
npm run test:bundle
```

The root GitHub Actions workflow validates the production Site on every pull request and push to `main`. It also runs functional validation for the preserved recovery Site snapshot.

## License and provenance

Liminal Wiki is licensed under `GPL-3.0-only`. See [`site/LICENSE`](site/LICENSE), [`site/THIRD_PARTY_NOTICES.md`](site/THIRD_PARTY_NOTICES.md), and [`site/UPSTREAM_PROVENANCE.md`](site/UPSTREAM_PROVENANCE.md).
