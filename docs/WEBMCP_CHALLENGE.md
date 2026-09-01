# Liminal Wiki — WebMCP Challenge 제출 원고

> 제출 마감: 2026-09-03 13:00 PDT / **2026-09-04 05:00 KST**
>
> 심사 종료: 2026-09-21 17:00 PDT / 2026-09-22 09:00 KST
>
> Live app: <https://liminal-wiki-webmcp.epinfomax.chatgpt.site/>
>
> Repository: <https://github.com/rca32/llmwiki-webmcp>

이 문서는 Devpost에 붙여넣을 영문 설명, 3분 미만 데모 대본, 심사위원용 테스트
안내와 최종 제출 점검표다. 일정과 요건은 제출 직전에 Devpost 공식 페이지와
규정을 다시 확인한다.

## 1. 제품 정의와 심사 포인트

### 한 문장 정의

> **Liminal Wiki는 사람이 직접 편집하는 위키가 아니라, 사람이 지식을 읽고
> 변경을 요청하면 Codex가 근거를 검토하고 page-scoped WebMCP로 안전하게
> 유지하는 위키다.**

### Elevator pitch

```text
A read-only, source-grounded knowledge workspace where people request changes
and Codex verifies evidence and maintains knowledge through page-scoped WebMCP.
```

### 핵심 협업 루프

```text
Read → Request → Verify → Plan → Apply → Audit
```

1. **Read** — 사람은 Documents, Explore topics, Find, Connections에서 지식과
   근거를 읽는다.
2. **Request** — 현재 문서·주제·revision·삭제 문서 또는 전체 위키를 대상으로
   구조화된 변경 요청을 복사한다.
3. **Verify** — Codex는 열린 페이지의 세션과 권한을 사용해 운영 계약, 기존 문서,
   연결, claim과 topic brief를 확인한다.
4. **Plan** — 외부 근거나 여러 문서·claim 작업은 immutable ingest plan으로,
   주제·인사이트 작업은 knowledge-map plan으로 만든다.
5. **Apply** — 최초 요청이 명시한 정확한 범위 안에서 동일한 plan hash, 최신
   version과 retry-safe operation ID로 적용한다.
6. **Audit** — 사람은 같은 읽기 화면에서 결과를 확인하고 Codex는 provenance,
   revision과 lint 결과를 다시 검증한다.

### 네 가지 심사 기준에 대한 답

| 기준                  | Liminal Wiki의 답                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebMCP Leverage       | 열린 페이지의 vault, 선택 문서, 로그인 role과 capability에 따라 최대 27개의 구조화된 도구를 투영한다. 도구는 DOM을 추측하지 않고 동일한 same-origin API와 제품 규칙을 사용한다. |
| Execution             | 읽기 전용 UI, 다국어 변경 요청, D1/R2 저장, revision, provenance, backup, recovery와 권한 모델이 하나의 실행 가능한 제품으로 연결된다.                                          |
| Potential Impact      | 사람이 직접 문서 구조와 출처를 관리하는 부담을 줄이면서도 변경 범위, 근거와 책임 추적을 잃지 않는다.                                                                            |
| Creativity & Ambition | AI를 편집기 안의 보조 버튼으로 넣는 대신, 사람의 요청을 제품 수준의 권한 계약으로 바꾸고 지식 유지보수 전체를 WebMCP 흐름으로 만든다.                                           |

## 2. Devpost 제출용 영문 원고

아래 블록은 제출 폼에 바로 붙여넣을 수 있는 최종 문안이다.

### Project title

```text
Liminal Wiki — A Read-Only Knowledge Workspace Maintained by Codex
```

### Short description

```text
Liminal Wiki is a source-grounded workspace where people read knowledge and
request changes instead of editing pages directly. Codex uses page-scoped
WebMCP tools to inspect the current workspace, verify evidence, reuse existing
knowledge, plan safe updates, and maintain the same pages, revisions, and
provenance that people see.
```

### Full project description

```text
Most wikis assume that people will continuously edit pages, move files, repair
links, curate sources, and resolve conflicts by hand. Adding an AI button to
that editor does not remove the maintenance burden; it also makes it difficult
to tell which context the agent used, what it was allowed to change, and which
evidence supports the result.

Liminal Wiki starts from a different interaction model. The human-facing Site
is a read-only knowledge surface. People use Documents, Explore topics, Find,
and Connections to understand a wiki, then select the contextual Request change action.
The request identifies the exact wiki and target, current version, path,
permalink, request type, and the person's instructions. It explicitly
authorizes only that scope and is copied into the person's Codex conversation;
the request itself is not stored by the Site.

Codex then discovers the tools registered by the currently open page. Before
writing, it reads the workspace context and operating contract, searches for
existing canonical pages, and checks the target's neighbors, claims, sources,
and approved topic brief. A normal single-page request uses optimistic
concurrency and a retry-safe operation ID. Research, external evidence, or
multi-page claim work uses an immutable ingest plan and plan hash. Topic and
insight work uses the corresponding knowledge-map plan. The original request
authorizes application only while the resulting plan stays inside its stated
scope; Codex stops when the target is ambiguous, warnings expand the impact, or
the required version has changed.

This is a strong fit for WebMCP because every useful action depends on live page
state: the active vault, selected page, signed-in membership, current revision,
and operational read-only setting. Liminal Wiki registers page-scoped tools
through document.modelContext.registerTool(), projects the catalog from the
current session's capabilities, validates closed schemas again in each
executor, and calls the same authenticated APIs used by the product. A viewer
does not discover content-changing tools. Soft deletion appears only when the
session has can_soft_delete and still requires the current version, an exact
typed confirmation, a reason, and an idempotent operation ID at the server.

The result is one product with two deliberately different interfaces: people
read, judge, and request; Codex investigates and maintains. Applied changes
immediately appear in the same Documents and Explore topics views, with stable
page IDs, immutable revisions, claim-level evidence, and an audit trail. There
is no separate automation database to synchronize and no hidden background
process that silently rewrites insight prose.

People continue to manage administrative concerns directly: wiki lifecycle,
members, backups, and operational settings. The separate recovery Site is an
explicit disaster-recovery and verification tool, not the normal knowledge
editing experience.
```

### Why WebMCP

```text
Liminal Wiki is stateful by design. The correct action depends on the open
vault, current page, signed-in role, latest version, evidence graph, and
operational mode. Page-scoped WebMCP lets the Site declare precise,
session-aware product actions instead of making Codex scrape the DOM or use a
separate automation identity. Discovery improves usability, while the same
authorization is enforced again by every server API.
```

### Better user experience

```text
People no longer need to learn editing modes, folder drag-and-drop, source
placement controls, conflict dialogs, or restore workflows just to keep a wiki
healthy. They read the knowledge, choose a plain-language request such as
Research and expand, Verify facts and sources, Move page, or Restore deleted
page, and add their intent. Liminal Wiki turns that context into a structured
prompt while preserving human judgment: Codex must verify the current state and
evidence, stay inside the authorized scope, and report the result and remaining
risks.
```

### What people and agents can do together

```text
A person can identify what should change from the page they are already
reading. Codex can then follow stable IDs across pages, links, claims, topics,
and revisions; search before creating; add exact source evidence; apply a
review-hashed plan; and audit the finished wiki. This combines human intent and
judgment with maintenance that would otherwise require many manual editing,
navigation, and provenance steps.
```

### Implementation summary

```text
The ChatGPT Site registers page-scoped tools with
document.modelContext.registerTool(). A mounted client component reads
same-origin session capabilities, exposes only authorized descriptors, uses
closed JSON Schemas, revalidates executor input, and cleans registrations with
an abort signal. Executors call the same D1/R2-backed APIs as the product. The
server independently enforces vault isolation, role permissions, operational
read-only mode, expected-version checks, idempotency keys, immutable revisions,
typed deletion confirmation, plan hashes, provenance validation, and bounded
content-free telemetry.
```

## 3. 제품과 WebMCP의 책임 경계

### 사람용 Site

- **Documents**: Markdown, linked mentions, attachments와 immutable revision을
  읽고 현재 문서에 대한 변경 요청을 만든다.
- **Explore topics**: 마지막으로 승인된 결론, 상충점, 시사점과 질문을 문장별
  근거와 함께 읽는다.
- **Find**: 위키 내용을 검색하고 동일한 문서를 연다.
- **Connections**: 전체 또는 현재 문서 주변의 연결을 그래프와 접근 가능한 목록으로
  탐색한다.
- **Settings & backup**: 위키 생성·삭제, 멤버, portable/full backup과 운영 설정을
  직접 관리한다.

일반 Site에는 직접 문서 편집·저장·자동 저장, 문서·폴더 이동, 콘텐츠 삭제,
attachment 업로드, revision 복원, 휴지통 복원과 폴더 drag-and-drop이 없다.
attachment와 revision은 읽을 수 있으며, 변경이 필요하면 현재 문맥이 채워진 요청을
생성한다. 요청 UI는 영어·한국어·일본어·중국어를 지원한다.

### Codex와 WebMCP

- 최대 catalog는 27개이며 실제 발견 수는 role, capability와 운영 모드에 따라
  달라진다. 영상 대본에는 고정된 숫자를 넣지 않고 촬영 당시 `fetchTools()` 결과를
  보여준다.
- page-scoped 도구는 열린 Site와 로그인 세션에 속한다. 독립적으로 항상 연결되는
  remote MCP server라고 설명하지 않는다.
- client-side capability projection은 발견 경험을 개선하지만 보안 경계가 아니다.
  모든 same-origin API가 vault와 권한을 다시 검사한다.
- `expected_version`은 오래된 쓰기를 막고 `operation_id`와 request hash는 재시도를
  안전하게 만든다.
- `wiki_plan_ingest`와 `wiki_plan_knowledge_map`은 검토 가능한 durable plan을
  저장하지만 page와 claim을 즉시 변경하지 않는다. apply는 동일한 plan hash와
  요청 범위가 유지될 때만 실행한다.
- `wiki_soft_delete_page`는 `can_soft_delete`가 있는 세션에만 등록되며 destructive,
  idempotent로 표시한다. 최신 version, 삭제 이유, 새 operation ID와 정확한
  `DELETE {title}` 확인 문자열이 필요하고 leaf page만 soft-delete한다.
- `wiki_restore_deleted_page`는 같은 capability 아래에서 삭제 문서를 history와 함께
  복구하며 slug 충돌 시 대체 slug를 받을 수 있다.

### 승인 경계

구조화된 변경 요청은 그 메시지에 적힌 대상과 작업 범위의 명시적 실행 승인이다.
Codex는 범위가 그대로라면 plan을 보여준 뒤 별도의 일반 승인 질문을 반복하지 않는다.
다음 경우에는 apply하지 않고 사용자에게 다시 확인한다.

- 대상 ID나 의도가 모호하다.
- plan warning을 해결하려면 다른 문서나 주제를 추가로 변경해야 한다.
- 삭제, 이동 또는 복원이 요청에 없었는데 필요해졌다.
- current version이나 plan hash가 달라졌다.
- 근거가 부족하거나 교차 vault 참조가 발견됐다.

## 4. 2분 55초 데모 원고

### 데모의 한 문장 이야기

```text
A person reads an incomplete page and requests better evidence. Codex discovers
the tools of that exact page, verifies the current knowledge, safely applies a
source-grounded plan under the request's scope, and proves the result in the
same read-only wiki.
```

### 녹화 fixture

녹화 전에 비식별 개인 vault를 준비한다.

1. `OpenScreen` concept page를 만들되 “open-source screen recorder”라는 짧은
   소개만 두고 source page와 active claim은 만들지 않는다.
2. 같은 제목의 다른 canonical page나 아래 source title이 없는지 확인한다.
3. UI 언어를 영어로 설정하고 `Request change`와 요청 유형
   `Research and expand`가 보이는지 확인한다.
4. operating contract에 `search_before_create`, `plan_before_apply`, source metadata와
   claim evidence 규칙이 있는지 확인한다.
5. 아래 public source packet을 Codex 대화에 붙여넣거나 파일로 첨부할 수 있게
   준비한다.

```text
Source title: OpenScreen GitHub README — product overview
Source URL: https://github.com/getopenscreen/openscreen
Retrieved at: <RECORDING_TIME_IN_ISO_8601>
Retrieval status: success
Extraction method: manual-summary-and-excerpt
Confidence: 0.95

Summary:
OpenScreen is a free, open-source desktop application for recording screens and
turning recordings into polished product demos. Its README describes automatic
voiceover captions that are transcribed locally and can be edited or translated.

Exact evidence fragment:
Automatic captions for voiceovers, transcribed on-device with no upload (works offline)

Requested claim:
- subject: OpenScreen
- predicate: supports
- object value: on-device automatic captions for voiceovers
- confidence: 0.95
```

공개 자료의 필요한 사실과 짧은 근거 fragment만 사용한다. source page에는 URL,
조회 시각, retrieval status, extraction method와 confidence를 함께 보존한다.

### 장면별 한·영 대본

| 시간      | 화면과 조작                                                                                                                                                                            | 한국어 내레이션                                                                                                                                                                                 | English subtitle                                                                                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00–0:18 | 읽기 전용 Documents와 `OpenScreen` 문서를 보여준다. 화면에 `Read knowledge. Request change. Codex maintains.`를 표시한다.                                                              | 위키를 오래 유지하기 어려운 이유는 글쓰기보다 편집, 연결, 출처와 충돌을 계속 관리해야 하기 때문입니다. AI가 편집 버튼을 대신 누르는 것만으로는 무엇을 근거로 어디까지 바꿨는지 알기 어렵습니다. | The hard part of maintaining a wiki is not writing alone. It is continuously managing edits, links, sources, and conflicts. Having AI click the same editing controls still leaves its evidence and scope unclear. |
| 0:18–0:42 | 현재 문서의 `Request change`를 열고 `Research and expand`를 선택한다. “Add reliable evidence for offline voiceover captions without creating a duplicate OpenScreen page.”를 입력한다. | Liminal Wiki에서 사람은 직접 편집하지 않습니다. 읽고 있는 문서를 대상으로 평범한 말로 변경을 요청합니다.                                                                                        | In Liminal Wiki, people do not edit the page directly. They request a change in plain language from the document they are already reading.                                                                         |
| 0:42–0:58 | 접힌 preview를 열어 wiki/page ID, version, permalink, request type과 exact-scope authorization을 강조하고 `Copy request`를 누른다. Codex에 요청과 source packet을 붙인다.              | 요청에는 대상과 현재 버전, 링크, 작업 종류와 정확한 범위의 승인이 들어갑니다. 본문은 복사하지 않고 Codex가 현재 페이지에서 다시 읽습니다.                                                       | The request carries the target, current version, permalink, change type, and authorization for that exact scope. It does not copy the page body; Codex reads the current page through WebMCP.                      |
| 0:58–1:25 | 실제 tool discovery 후 context, contract, page, neighbors, claims, knowledge map과 search 결과를 빠르게 이어서 보여준다. 기존 `OpenScreen` page를 재사용한다는 결과를 강조한다.        | 열린 페이지가 현재 로그인 세션에 허용된 도구를 제공합니다. Codex는 운영 규칙과 현재 문서, 연결, claim, 주제 인사이트를 확인하고 먼저 검색해 기존 지식을 재사용합니다.                           | The open page provides tools allowed by the current signed-in session. Codex checks the operating rules, page, links, claims, and topic insight, then searches first and reuses the existing knowledge.            |
| 1:25–1:52 | `wiki_plan_ingest` 결과에서 existing page update, 새 source, grounded claim, warning과 `plan_hash`를 보여준다.                                                                         | 외부 근거와 claim은 바로 쓰지 않습니다. 하나의 immutable plan이 기존 페이지 수정, 새 source와 정확한 evidence를 검토 가능한 결과로 묶습니다.                                                    | External evidence and claims are not written immediately. One immutable plan groups the existing-page update, new source, and exact evidence into a reviewable result.                                             |
| 1:52–2:15 | 최초 요청 범위와 plan이 일치함을 보여준 뒤 `wiki_apply_ingest`가 동일한 hash, `approved: true`, 새 operation ID로 실행되는 장면을 보여준다. 별도 승인 프롬프트는 보내지 않는다.        | 이 요청 자체가 명시된 범위의 실행 승인입니다. 범위와 hash가 그대로이므로 Codex는 승인을 반복해서 묻지 않고, 서버는 권한과 version을 다시 검사한 뒤 적용합니다.                                  | The request itself authorizes its stated scope. Because the scope and hash are unchanged, Codex does not ask for another general approval; the server rechecks permission and version before applying.             |
| 2:15–2:40 | Documents를 다시 열어 보완된 문장, linked source와 새 revision을 보여준다. 가능하면 Explore topics의 접힌 문장별 근거에서 같은 source를 연다.                                          | 결과는 별도의 AI 저장소가 아니라 사람이 읽던 같은 위키에 나타납니다. 문서, source, claim과 immutable revision이 함께 남아 판단 과정을 추적할 수 있습니다.                                       | The result appears in the same wiki the person was reading, not in a separate AI store. The page, source, claim, and immutable revision remain connected and traceable.                                            |
| 2:40–2:55 | `wiki_get_claims`, `wiki_list_revisions`, `wiki_lint` 결과를 보여주고 `People request · Codex verifies · WebMCP maintains`로 끝낸다.                                                   | 마지막으로 Codex가 근거와 revision, 위키 품질을 다시 검사합니다. 사람은 요청하고 판단하며, Codex는 검증하고, WebMCP는 그 경계를 실행 가능한 제품 계약으로 만듭니다.                             | Codex finishes by checking the evidence, revision, and wiki quality. People request and judge, Codex verifies, and WebMCP turns that boundary into an executable product contract.                                 |

### 예상 WebMCP 호출 흐름

```text
wiki_get_context
→ wiki_get_operating_contract
→ wiki_get_page
→ wiki_get_neighbors
→ wiki_get_claims
→ wiki_get_knowledge_map
→ wiki_search
→ wiki_plan_ingest
→ wiki_apply_ingest
→ wiki_list_revisions
→ wiki_lint
```

독립적인 수동 프롬프트 네 개를 보내지 않는다. 화면에서 복사한 요청 하나와 source
packet으로 전체 흐름을 시작한다. host가 개별 consequential tool 호출 확인을
표시하는 경우 그 화면은 제품의 일반 승인 요청이 아니라 host의 안전 UI임을 구분한다.

### 녹화 전 기술 확인

- 지원되는 ChatGPT/Codex 인앱 브라우저의 정확한 live URL에서 로그인한다.
- `fetchTools()`로 실제 catalog의 이름, description, schema, annotation과 origin을
  확인한다. 영상에는 당시 발견된 숫자만 표시한다.
- `wiki_get_context`를 실제 호출해 화면의 active vault, page와 role이 결과와
  일치하는지 확인한다.
- viewer, editor/owner와 operational read-only 상태의 catalog가 capability에 맞게
  달라지는지 별도 리허설한다.
- `wiki_plan_ingest`가 mutation을 즉시 수행하지 않고 plan을 저장하는 write tool로
  표시되는지 확인한다.
- `wiki_soft_delete_page`와 `wiki_restore_deleted_page`가 `can_soft_delete` 세션에만
  보이는지 확인하되 영상에서는 실행하지 않는다.
- 이메일, cookie, token, deployment secret과 다른 vault의 데이터가 화면에 나오지
  않게 한다.
- 도구명, plan hash, version과 evidence가 1080p 영상에서 읽히는지 확인한다.

### 촬영 성공 기준

- 영상 길이가 2분 55초 이하이고 공개 YouTube 영상이며 설명 음성이 있다.
- 앱 UI는 영어로 표시하고, 한국어 음성을 쓰면 의미가 일치하는 영문 자막을 넣는다.
- `Request change`에서 생성한 실제 prompt가 Codex 대화의 시작점으로 보인다.
- tool discovery와 최소 한 번의 실제 read call이 화면에 보인다.
- search 결과가 기존 `OpenScreen` page를 선택하고 duplicate를 만들지 않는다.
- plan에 기존 page update, source, claim, evidence와 64자리 plan hash가 보인다.
- 최초 요청 외에 두 번째 일반 승인 메시지를 보내지 않는다.
- apply는 같은 hash, `approved: true`, 최신 version과 새 operation ID를 사용한다.
- 같은 UI에서 새 revision과 출처 연결을 확인한다.
- lint issue가 있다면 숨기지 않고 결과와 남은 위험을 짧게 설명한다.

### 실패 시 대체

| 문제                        | 대응                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 도구가 발견되지 않음        | 녹화를 중단하고 host 지원, 로그인 세션, 정확한 URL과 client registration을 확인한다. 소스 코드 화면으로 성공 장면을 대체하지 않는다. |
| fixture title이 이미 존재함 | 중복 페이지를 만들지 말고 테스트 vault를 초기화하거나 날짜가 포함된 별도 fixture를 준비한다.                                         |
| plan warning이 범위를 넓힘  | 자동 apply하지 않는다. warning을 설명하고 깨끗한 fixture에서 다시 촬영한다.                                                          |
| version 또는 hash conflict  | 오래된 쓰기를 막은 안전장치로 짧게 설명한 뒤 최신 상태에서 새 요청·plan으로 재촬영한다.                                              |
| 응답이 길어 3분을 넘김      | 대기 시간만 편집하고 tool name, 요청 범위, plan, apply와 검증 결과는 유지한다.                                                       |

## 5. 심사위원용 라이브 테스트 안내

아래 영문 블록을 Devpost testing instructions에 사용한다.

```text
Testing Liminal Wiki

1. Open https://liminal-wiki-webmcp.epinfomax.chatgpt.site/ in ChatGPT's
   in-app browser or another supported WebMCP host.
2. Sign in with ChatGPT. No shared test password is required. On first sign-in,
   the app creates an isolated private Liminal Wiki owned by that account.
3. Open a document and select Request change to inspect the structured prompt.
   Copying the prompt does not mutate or store a request on the Site.
4. To verify WebMCP without changing data, ask the agent:

   "Use only the WebMCP tools provided by the currently open Liminal Wiki page.
   Tell me which wiki and page are active, what permissions I have, and the
   workspace's operating rules. Do not make any changes."

   Expected calls include wiki_get_context and wiki_get_operating_contract.
5. Inspect the discovered tool descriptors. The catalog is projected from the
   signed-in session, so the exact count depends on role and operational mode.
6. Mutations should be attempted only in the account's private wiki and after
   an explicit request copied from Request change. Content-changing APIs recheck the
   same permissions, versions, and vault boundary.

The integration is page-scoped WebMCP registered by the open Site. It is not an
independent remote MCP server. Closing the page, switching vaults, or changing
permissions may require tool rediscovery.
```

### 심사 시 보여줄 안전 계약

- 비로그인 요청은 sign-in 경계를 만나고 protected API는 거부된다.
- 첫 로그인 계정은 격리된 개인 vault의 owner가 되며 다른 계정의 vault를 발견하지
  못한다.
- owner가 Settings & backup에서 명시적으로 추가한 membership만 공유 vault 접근을
  허용한다.
- viewer와 operational read-only session에는 content mutation tool이 노출되지
  않으며 서버도 같은 정책을 재검사한다.
- 멤버, full backup/import와 운영 설정은 사람용 관리 기능이고 page-scoped WebMCP
  catalog에 노출하지 않는다.
- recovery Site는 blank-site restore와 검증을 위한 운영 예외이며 일반 knowledge
  request UX가 아니다.

## 6. 최종 제출 체크리스트와 근거

### Devpost

- [ ] `Join hackathon`과 제출 초안 생성을 완료한다.
- [ ] Project title, short description와 full description에 2절의 영문 원고를 사용한다.
- [ ] live URL과 위 testing instructions를 입력한다.
- [ ] 공개 repository URL을 입력한다.
- [ ] GitHub About에 GPL-3.0-only license가 인식되는지 확인한다.
- [ ] 3분 미만 public YouTube URL을 입력한다.
- [ ] 모든 제출 자료가 영어이거나 정확한 영문 번역·자막을 포함하는지 확인한다.
- [ ] **2026-09-04 05:00 KST 이전** 최종 Submit을 완료한다.
- [ ] 심사 종료 시각인 2026-09-22 09:00 KST까지 live app을 무료로 유지한다.

### 코드와 라이브 검증

- [ ] 최종 commit의 lint, typecheck, unit, UI, build와 GitHub Actions가 통과한다.
- [ ] 정확한 배포 URL에서 `fetchTools()`와 실제 `wiki_get_context` 호출을 기록한다.
- [ ] 현재 최대 27개 catalog와 viewer/editor/owner/read-only projection을 다시 확인한다.
- [ ] search → plan → apply → claims/revisions/lint 데모를 깨끗한 fixture에서 완주한다.
- [ ] `wiki_soft_delete_page`가 destructive/idempotent이고 정확한 typed confirmation을
      요구하는지 descriptor와 서버 응답에서 확인한다.
- [ ] 영상과 제출 원고의 UI 명칭, 요청 승인 경계와 tool 설명이 실제 배포본과 같다.
- [ ] 로그아웃 창에서 YouTube 영상, live URL과 repository가 모두 열리는지 확인한다.

### 공식 자료

- OpenAI WebMCP Challenge: <https://openai.com/ko-KR/webmcp-challenge/>
- Devpost Overview: <https://webmcp.devpost.com/>
- Devpost Official Rules: <https://webmcp.devpost.com/rules>
- WebMCP specification: <https://github.com/webmachinelearning/webmcp>
- OpenScreen fixture source: <https://github.com/getopenscreen/openscreen>

### 프로젝트 자료

- Public repository: <https://github.com/rca32/llmwiki-webmcp>
- WebMCP registration: `site/app/site-tools.tsx`
- Current tool names: `site/lib/webmcp-tool-names.ts`
- System design and acceptance: `docs/SYSTEM_DESIGN.md`
- Production Site guide: `site/README.md`
- License: `LICENSE`
