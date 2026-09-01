# Liminal Wiki — WebMCP Challenge 제출 원고

> 제출 마감: 2026-09-03 13:00 PDT / **2026-09-04 05:00 KST**
>
> 심사 종료: 2026-09-21 17:00 PDT / 2026-09-22 09:00 KST
>
> 수상자 발표: 2026-09-23 14:00 PDT 전후 / 2026-09-24 06:00 KST 전후
>
> Live app: <https://liminal-wiki-webmcp.epinfomax.chatgpt.site/>
>
> Repository: <https://github.com/rca32/llmwiki-webmcp>

이 문서는 Devpost에 붙여넣을 영문 설명, 2분 35초 데모 대본, 심사위원용 테스트
안내와 최종 제출 점검표다. 공개 GitHub 원고를 대상으로 작성된 외부 개선안을 현재
로컬 구현과 대조해 반영했다. 일정과 요건은 최종 제출 직전에 공식 OpenAI 페이지와
Devpost 규정에서 다시 확인한다.

## 1. 제품 메시지와 심사 포인트

### 모든 제출 자료에서 고정할 세 문장

```text
The wiki you update by asking—not editing.
People decide. Agents maintain.
The result lives in the wiki—not in another chat transcript.
```

### 한 문장 정의

> **Liminal Wiki는 사람이 원하는 결과와 범위를 요청하면, WebMCP 에이전트가 실제
> 위키의 문서·출처·연결·변경 이력을 유지하는 agent-maintained wiki다.**

### 대상 사용자와 실제 문제

핵심 사용자는 **근거와 변경 이력이 중요한 지식을 지속적으로 관리하는 소규모
연구·제품·정책·엔지니어링 팀**이다.

위키가 낡는 이유는 사람이 글을 못 써서가 아니다. 유지보수가 끝이 없기 때문이다.
정본 문서를 찾아 중복을 피하고, 회의 메모를 기존 구조에 통합하고, 출처와 claim을
연결하고, 새 정보가 기존 결론과 충돌하는지 판단하고, 동료의 최신 변경을 덮어쓰지
않으면서 무엇이 왜 바뀌었는지 남겨야 한다.

```text
Wikis rarely become stale because people cannot write. They become stale
because maintenance is endless: finding the canonical page, preserving links,
adding evidence, reconciling newer information, handling concurrent changes,
and keeping history intact.
```

### 사람에게 보이는 협업 루프

```text
Read → Request → Verify → Apply → Review
```

1. **Read** — 사람은 Documents, Explore topics, Find와 Connections에서 지식과
   근거를 읽는다.
2. **Request** — 현재 위키·문서·주제·revision 또는 삭제 문서를 대상으로 원하는
   결과와 범위를 요청한다.
3. **Verify** — 에이전트는 열린 페이지의 세션으로 현재 대상, 권한, 버전, 기존
   지식과 근거를 확인한다.
4. **Apply** — 에이전트는 요청 범위 안에서 검토 가능한 plan과 최신 version을
   사용해 변경한다.
5. **Review** — 사람은 같은 읽기 화면에서 결과, 출처, 연결과 immutable revision을
   확인한다.

`Plan`과 `Audit`은 제품 내부의 중요한 안전 단계이지만, 사용자 메시지에서는
`Verify`와 `Review` 안에 포함해 설명한다.

### 네 가지 심사 기준에 대한 답

| 기준                  | Liminal Wiki의 답                                                                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebMCP Leverage       | 안전한 행동이 active wiki, 열린 page, 로그인 role, current version, evidence graph와 operational mode에 따라 달라진다. 열린 Site가 이 상태에 맞는 page-scoped 도구를 직접 선언한다.           |
| Execution             | 읽기 전용 다국어 UI, 구조화된 요청, session-aware WebMCP, persistent wiki, provenance, revision, sharing, backup과 recovery가 하나의 실행 가능한 제품으로 연결된다.                            |
| Potential Impact      | 소규모 팀이 Markdown, 중복, 링크, 출처와 충돌을 손으로 계속 관리하지 않아도 실제 source of truth를 근거와 이력까지 포함해 유지할 수 있다.                                                      |
| Creativity & Ambition | AI를 기존 편집기의 기능으로 추가하지 않고, 사람의 intent를 write interface로 바꾸고 에이전트에게 실제 원본을 유지하기 위한 구조화된 실행 인터페이스를 제공한다.                               |

최대 catalog 수와 전체 도구 목록은 구현 깊이의 증거이지 메인 가치 제안이 아니다. 영상은
도구 목록을 스크롤하지 않고 live context에 따라 올바른 도구가 발견되고 호출된다는 사실을
보여준다.

## 2. Devpost 제출용 영문 원고

아래 블록은 현재 로컬 제품 메시지와 `Project Aurora Launch Review` 데모에 맞춘
붙여넣기용 문안이다.

### Project title

```text
Liminal Wiki — The Wiki You Update by Asking
```

### Tagline

```text
People decide what should change. WebMCP agents maintain the live,
source-grounded wiki.
```

### Short description

```text
Liminal Wiki replaces the editor with a structured request. People read a page
and describe the outcome they want; a WebMCP agent inspects the signed-in
workspace, verifies evidence, reuses existing knowledge, and applies a
version-aware change to the same wiki with sources and revision history.
```

### Full project description

```text
The problem

Wikis rarely become stale because people cannot write. They become stale
because maintenance is endless: finding the canonical page, preserving links,
adding evidence, reconciling newer information, handling concurrent changes,
and keeping history intact. This burden is especially costly for small
research, product, policy, and engineering teams whose knowledge must remain
sourced, connected, and auditable.

Document chatbots can answer questions, but their result stays in a chat.
AI features inside editors can draft prose, but people still have to maintain
the source of truth. Visual browser agents can operate editing controls, but
they must infer live state and may act outside the context a person intended.

What Liminal Wiki does

Liminal Wiki changes the primary interaction. The human-facing workspace is
for reading and judgment, not direct page editing. A person opens the wiki,
reads a page, and selects Request change. They describe what should be
different instead of editing Markdown, moving files, repairing links, placing
sources, or resolving a save conflict.

The Site turns that intent into a structured handoff containing the exact wiki
and target, current version, permalink, request type, user instructions, and
authorized scope. It does not copy the page body or create a second request
database. The agent reads the live wiki through the tools of the open page.

The result lives in the wiki—not in another chat transcript. Applied changes
appear in the same Documents and Explore topics views with stable page IDs,
linked sources, claim-level evidence, immutable revisions, and an audit trail.

Why WebMCP is essential

The safe action depends on live product state: the active wiki, open page,
signed-in role, current revision, evidence graph, and operational mode.
Page-scoped WebMCP lets the Site expose precise, session-aware actions instead
of making an agent scrape the DOM or use a separate automation identity.

Before writing, the agent reads the workspace context and operating contract,
searches for an existing canonical page, and inspects relevant pages, links,
claims, sources, and topic insight. Grounded research is first captured in an
immutable plan. Application requires the same plan hash, a current version,
and a retry-safe operation ID. Every server API independently rechecks the wiki
boundary and permission.

What people and agents do together

People remain responsible for intent, judgment, and scope. Agents handle the
maintenance work required to turn that intent into durable knowledge: search
before creating, reuse stable IDs, connect exact evidence, preserve uncertainty,
avoid stale writes, and record revisions. The agent stops when the target is
ambiguous, a warning expands the impact, the version changes, or the evidence
does not support the requested conclusion.

Complete product

Each signed-in account receives an isolated private wiki with persistent
storage. The product includes multilingual reading and request interfaces,
folder and topic exploration, full-text search, connections, evidence-backed
insights, revisions, recoverable page deletion, roles and sharing, portable and
full backups, operational read-only mode, and a separate recovery Site.

People directly manage membership, ownership, backups, operational settings,
and wiki deletion. Authorized sessions may also expose wiki creation through
WebMCP without granting membership or bypassing owner controls.

What was built during the challenge

The repository history begins during the challenge window. During that period
we built the production Site and its page-scoped WebMCP integration, then
redesigned the normal knowledge-change workflow around structured human
requests. Challenge work includes session-aware tool registration,
capability-based discovery, the Request change handoff, live context and policy
inspection, search-before-create behavior, plan/apply workflows for grounded
changes and topic insights, version and idempotency safeguards, provenance and
revision verification, bounded observability, deployment, backup, and recovery.
Third-party and adapted components are identified in the repository's
provenance and notice files.
```

### Why WebMCP

```text
Liminal Wiki is stateful by design. The correct action depends on the active
wiki, open page, signed-in role, latest version, evidence graph, and operational
mode. Page-scoped WebMCP lets the Site declare precise actions for that live
session instead of making an agent infer state from the DOM or use a separate
automation identity. Discovery improves the experience; every server API still
enforces the same wiki, permission, and version boundary.
```

### Better user experience

```text
People no longer need to learn editing modes, Markdown structure, folder
drag-and-drop, source placement, conflict dialogs, or restore workflows just to
keep a wiki healthy. They read the knowledge and describe the result they want.
Liminal Wiki turns that intent into a scoped handoff, while the agent verifies
the live state and returns the maintained result to the same wiki.
```

### What people and agents can do together

```text
A person can identify what should change from the page they are already
reading. An agent can then find the canonical page, follow stable IDs across
links and claims, integrate exact source evidence, preserve uncertainty, avoid
stale writes, and leave the result in the live wiki with revision history. This
turns human intent into maintained knowledge instead of another answer waiting
to be copied from chat.
```

### Implementation summary

```text
The Site registers page-scoped tools with document.modelContext.registerTool().
A mounted client projects descriptors from trusted same-origin session
capabilities, uses closed JSON Schemas, revalidates executor inputs, and cleans
registrations with an abort signal. Executors call the product's D1/R2-backed
same-origin APIs. The server independently enforces vault isolation, roles,
operational read-only mode, expected-version checks, idempotency, plan hashes,
immutable revisions, provenance validation, and bounded content-free telemetry.
```

### What was built during the challenge

```text
During the challenge window, we built the production Site and its page-scoped
WebMCP integration, then redesigned routine knowledge changes around structured
human requests. The work includes session-aware registration,
capability-projected discovery, live context and policy inspection,
search-before-create, grounded plan/apply workflows, version and idempotency
safeguards, provenance and revision verification, and deployment in a supported
WebMCP host. The public commit history, source provenance, and third-party
notices distinguish repository-owned work from dependencies and adaptations.
```

## 3. 제품과 WebMCP의 책임 경계

### 사람용 Site

- **Documents**: Markdown, linked mentions, attachments와 immutable revision을
  읽고 현재 문서에 대한 변경 요청을 만든다.
- **Explore topics**: 승인된 결론, 상충점, 시사점과 질문을 문장별 근거와 함께
  읽는다.
- **Find**: 위키 내용을 검색하고 같은 문서를 연다.
- **Connections**: 전체 또는 현재 문서 주변의 연결을 그래프와 접근 가능한 목록으로
  탐색한다.
- **Settings & backup**: membership, ownership, backup/import, 운영 설정과 전체 wiki
  삭제를 사람이 직접 관리한다.

일반 Site에는 직접 문서 편집·저장·자동 저장, 문서·폴더 이동, 콘텐츠 삭제,
attachment 업로드, revision 복원, 휴지통 복원과 폴더 drag-and-drop이 없다. 변경이
필요하면 현재 문맥이 채워진 구조화 요청을 만든다. 요청 UI는 영어·한국어·일본어·
중국어를 지원한다.

### WebMCP 에이전트

- page-scoped 도구는 열린 Site, active wiki와 로그인 세션에 속한다. 독립적으로
  항상 연결되는 remote MCP server라고 설명하지 않는다.
- 실제 catalog는 role, capability와 운영 모드에 따라 달라진다. 최대 도구 수를
  제품의 메인 메시지로 쓰지 않는다.
- `can_create_wiki`가 있는 세션은 `wiki_create_vault`를 발견할 수 있다. 이는
  membership, ownership, backup이나 wiki deletion 권한을 에이전트에 주지 않는다.
- client-side capability projection은 발견 경험을 개선하지만 보안 경계가 아니다.
  모든 same-origin API가 wiki와 권한을 다시 검사한다.
- `expected_version`은 오래된 쓰기를 막고 `operation_id`와 request hash는 재시도를
  안전하게 만든다.
- grounded ingest와 knowledge-map 작업은 검토 가능한 durable plan을 먼저 저장한다.
  apply는 동일한 plan hash와 요청 범위가 유지될 때만 실행한다.
- `wiki_apply_ingest`는 `plan_id`, 동일한 `plan_hash`, `approved: true`와 새
  `operation_id`를 받는다. 각 page의 `expected_version`은 immutable plan에
  고정되며 서버가 apply 중 다시 검사한다.
- recoverable page deletion은 capability, 최신 version, 이유, 정확한 typed
  confirmation과 retry-safe operation ID를 요구한다.

### 세 단계 승인과 검증

| 계층                | 역할                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Product request     | 구조화된 요청이 정확한 target과 scope에 대한 제품 수준 실행 승인을 전달한다.                                                            |
| Browser/host        | 플랫폼이 consequential action 확인을 표시할 수 있다. 제품 요청은 이 확인을 우회하지 않는다.                                            |
| Server validation   | 각 API가 wiki boundary, role, version, plan hash와 operation ID를 독립적으로 재검사한다.                                                |

사용할 영문 문장:

```text
The structured request is the product-level authorization for its stated
scope. It does not bypass browser or host confirmations, and every server API
independently rechecks permissions, versions, and the wiki boundary.
```

에이전트는 다음 경우 apply하지 않고 사람에게 돌아간다.

- 대상 ID나 의도가 모호하다.
- warning을 해결하려면 요청 밖의 문서나 주제를 변경해야 한다.
- 삭제, 이동 또는 복원이 요청에 없었는데 필요해졌다.
- current version이나 plan hash가 달라졌다.
- 근거가 부족하거나 교차 wiki 참조가 발견됐다.

제품 경계를 설명할 때는 다음 문장을 사용한다.

```text
WebMCP is the normal write path for routine knowledge changes behind the
read-only product interface.
```

`only possible write path into the system`처럼 사람용 관리 기능과 same-origin API까지
부정하는 절대적인 표현은 사용하지 않는다.

## 4. 2분 35초 데모 원고

### 데모의 한 문장 이야기

```text
A product lead turns fictional launch-review notes into the canonical Project
Aurora decision page without opening an editor. A WebMCP agent reuses the live
page, preserves unmet conditions, links the source, and leaves the result and
revision history in the same wiki.
```

### 연출 원칙

- 정보량보다 interaction model을 먼저 보여준다. 첫 14초 안에 편집기가 없고 사람이
  결과와 범위를 요청한다는 점을 설명한다.
- source packet은 자체 제작한 비식별 fixture만 사용한다. 외부 네트워크, 상표,
  저작권 자료나 실제 회사 데이터에 의존하지 않는다.
- 도구 목록 전체를 스크롤하지 않는다. discovery, live context, canonical search,
  plan, apply와 같은 page 결과만 읽을 수 있게 보여준다.
- plan hash와 permission 같은 기술 필드는 화면으로 증명하고, 음성은 사용자 경험을
  설명한다.
- 목표 길이는 2분 35초다. 대기 시간만 편집하고 실제 request, discovery, context,
  plan/apply와 결과 확인은 유지한다.

### 녹화 fixture

녹화 전에 비식별 개인 wiki를 준비한다.

1. `Project Aurora Launch Review` entity page를 만들고 아래 한 문장만 둔다.

   ```text
   Project Aurora is preparing for a limited pilot.
   ```

2. source page, active claim, 같은 제목의 다른 canonical page가 없는지 확인한다.
3. UI를 영어로 설정하고 `Request change`와 `Research and expand`가 보이는지
   확인한다.
4. [Project Aurora fixture](fixtures/project-aurora-launch-review.md)를 agent 대화에
   첨부할 수 있게 준비한다.
5. 요청에는 다음 문장을 사용한다.

   ```text
   Turn the attached launch-review notes into the canonical decision page for
   Project Aurora. Reuse this existing page. Separate the decision, launch
   conditions, current evidence, and open questions. Link the source, preserve
   uncertainty, and do not describe unmet conditions as completed.
   ```

6. source metadata는 다음 기준을 사용한다.

   ```text
   Source title: Project Aurora Launch Review — source notes
   Source URL: urn:liminal-demo:project-aurora-launch-review
   Retrieved at: <RECORDING_TIME_IN_ISO_8601>
   Retrieval status: success
   Extraction method: user-provided-attachment
   Confidence: 0.99
   ```

7. plan은 기존 page update, source page와 아래 사실을 분리해 보여야 한다.
   - 결정: 2026-09-15에 eligible users 10%를 대상으로 limited pilot 진행
   - 충족 근거: latest load test는 430 ms p95로 500 ms 조건 이내
   - 미충족 조건: rollback drill은 scheduled이지만 not completed
   - 미충족 조건: support owner는 not assigned

### 장면별 한·영 대본

| 시간      | 화면과 조작                                                                                                                                                                                | 한국어 내레이션                                                                                                                                                                         | English subtitle                                                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:14 | `Project Aurora Launch Review`의 얇은 본문과 `Request change`만 보여준다. 제목 주변에 Edit나 Save가 없음을 비춘다.                                                                        | 이건 위키 문서지만 Edit 버튼이 없습니다. Liminal Wiki의 계약은 다릅니다. 사람은 무엇이 달라져야 할지 결정하고, 에이전트는 지식 원본을 관리합니다.                                      | This is a wiki page, but there is no Edit button. Liminal Wiki uses a different contract: people decide what should change, and agents maintain the source of truth.                                        |
| 0:14–0:36 | `Request change → Research and expand`를 열고 Aurora 요청을 입력한다. fixture 파일을 agent 대화에 첨부하는 장면까지 보여준다.                                                           | 사람은 출시 메모를 직접 옮겨 쓰지 않습니다. 이 기존 문서를 정본 결정 페이지로 만들고, 아직 충족되지 않은 조건은 완료된 것처럼 쓰지 말라고 요청합니다.                                   | The person does not rewrite the launch notes by hand. They ask for this existing page to become the canonical decision record—and for unmet conditions to remain visibly unmet.                              |
| 0:36–0:54 | preview에서 wiki ID, page ID, version, permalink, request type과 authorization을 차례로 강조하고 `Copy request`를 실행한다.                                                            | 변경 요청은 의견함이 아닙니다. 평범한 문장을 지금 보고 있는 위키, 문서 버전과 허용 범위가 들어간 구조화된 인계로 바꿉니다.                                                            | Request change is not a feedback form. It turns a plain-language instruction into a structured handoff with the current wiki, page version, and authorized scope.                                           |
| 0:54–1:13 | 실제 tool discovery 후 `wiki_get_context`와 `wiki_get_operating_contract`를 호출한다. UI의 active wiki, page, role과 결과를 나란히 보여준다.                                           | 열린 페이지는 현재 로그인과 권한에 맞는 도구를 제공합니다. 에이전트는 복사된 본문이 아니라 실제 위키에서 대상, 역할과 작업 규칙을 읽습니다.                                           | The open page exposes tools for the current session and permissions. The agent reads the target, role, and operating rules from the live wiki instead of relying on pasted page content.                      |
| 1:13–1:36 | `wiki_search`에서 기존 Aurora page를 재사용하는 결과를 강조한다. `wiki_plan_ingest`의 existing page update, source, claims, exact evidence와 unmet conditions를 보여준다.                  | 먼저 검색해 정본 문서를 재사용합니다. 계획은 결정, 조건, 현재 근거와 열린 질문을 나누고, 완료되지 않은 rollback drill과 support owner를 그대로 보존합니다.                                | Search reuses the canonical page. The plan separates the decision, conditions, evidence, and open questions while preserving the incomplete rollback drill and unassigned support owner.                     |
| 1:36–1:55 | 구조화 요청과 plan scope를 나란히 보여준다. host 확인이 있으면 실행한 뒤 같은 `plan_id`와 hash, `approved: true`, 새 operation ID로 `wiki_apply_ingest`를 호출한다.                       | 구조화된 요청은 제품 수준의 범위 승인입니다. host 확인은 그대로 따르고, 서버가 권한과 plan에 고정된 버전, 같은 plan hash를 다시 확인한 뒤에만 적용합니다.                              | The structured request authorizes the product scope; it does not bypass host confirmation. The server rechecks permissions, the versions captured by the plan, and the plan hash before committing the change. |
| 1:55–2:20 | 같은 Documents page를 새로고침해 Decision, Launch conditions, Current evidence, Open questions와 linked source를 보여준다. 새 revision과 unmet 상태를 강조한다.                            | 결과는 채팅에 남지 않습니다. 같은 위키 문서에 결정과 근거, 아직 충족되지 않은 조건, 출처와 새 revision이 함께 나타납니다.                                                              | The result does not stay in chat. The same wiki page now holds the decision, evidence, visibly unmet conditions, linked source, and a new revision.                                                          |
| 2:20–2:35 | `Human intent is the write interface`를 크게 표시하고 `Read → Request → Verify → Apply → Review`로 끝낸다.                                                                            | 이것이 Liminal Wiki의 모델입니다. 사람의 의도가 쓰기 인터페이스가 되고, 열린 페이지는 에이전트가 지식 원본을 안전하게 관리하는 데 필요한 구조화된 도구를 제공합니다.                  | That is the Liminal Wiki model: human intent is the write interface, and the open page gives agents the structured, session-aware tools required to maintain the source of truth safely.                     |

### 영상에서 보여줄 핵심 WebMCP 흐름

```text
tool discovery
→ wiki_get_context
→ wiki_get_operating_contract
→ wiki_search
→ wiki_plan_ingest
→ wiki_apply_ingest
```

`wiki_get_page`, neighbors, claims, knowledge map, revisions와 lint는 에이전트가 실제
작업에 필요하면 호출하되, 영상의 메인 내레이션에서 목록을 일일이 읽지 않는다. apply
후에는 같은 UI의 linked source와 revision을 제품 결과로 보여준다.

### 녹화 전 기술 확인

- ChatGPT 데스크톱 앱의 built-in browser 또는 공식 규정이 허용하는 WebMCP test
  host에서 정확한 live URL로 로그인한다.
- `fetchTools()`로 실제 catalog의 names, schemas, annotations와 origin을 확인한다.
  영상에는 전체 숫자를 강조하지 않는다.
- `wiki_get_context` 결과의 active wiki, page와 role이 화면과 일치하는지 확인한다.
- viewer, owner와 operational read-only 상태의 catalog가 capability에 맞게 달라지는지
  별도 리허설한다.
- `wiki_plan_ingest`가 plan만 저장하고 page와 claim을 즉시 변경하지 않는지 확인한다.
- 이메일, profile identifier, cookie, token, secret과 다른 wiki 데이터가 화면에
  나오지 않게 한다.
- request, tool name, plan scope, hash, version, unmet conditions와 결과가 1080p에서
  읽히는지 확인한다.

### 촬영 성공 기준

- 공개 YouTube 영상이며 설명 음성이 있고 최종 길이가 **2분 35초 안팎**, 반드시
  3분 미만이다.
- 앱 UI는 영어로 표시하고, 한국어 음성을 쓰면 의미가 일치하는 영문 자막을 넣는다.
- 첫 14초 안에 편집기가 없고 사람이 결과와 범위를 요청한다는 점이 보인다.
- `Request change`에서 생성한 실제 prompt가 agent 대화의 시작점으로 보인다.
- tool discovery와 실제 `wiki_get_context` 호출이 화면에 보인다.
- search 결과가 기존 `Project Aurora Launch Review`를 재사용한다.
- plan에 existing page update, source, decision, conditions, evidence, uncertainty와
  64자리 hash가 보인다.
- host 확인이 표시되면 숨기거나 우회하지 않는다.
- apply는 같은 `plan_id`와 hash, `approved: true`, 새 operation ID를 사용하고,
  서버는 plan에 고정된 page version이 여전히 최신인지 확인한다.
- 같은 UI에서 decision, unmet conditions, source와 새 revision을 확인한다.
- issue나 warning이 있다면 숨기지 않고 결과와 남은 위험을 짧게 설명한다.

### 실패 시 대체

| 문제                        | 대응                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 도구가 발견되지 않음        | 녹화를 중단하고 host 지원, 로그인 세션, 정확한 URL과 client registration을 확인한다. 코드 화면으로 성공 장면을 대체하지 않는다.     |
| fixture title이 이미 존재함 | 중복 page를 만들지 말고 녹화용 wiki를 초기화하거나 정확한 기존 fixture를 원래 상태로 복원한다.                                      |
| plan warning이 범위를 넓힘  | 자동 apply하지 않는다. warning을 설명하고 깨끗한 fixture에서 다시 촬영한다.                                                          |
| version 또는 hash conflict  | 오래된 쓰기를 막은 안전장치로 짧게 설명한 뒤 최신 상태에서 새 request와 plan으로 재촬영한다.                                       |
| 2분 35초를 크게 넘김        | 대기 시간만 편집한다. request, discovery, context, plan/apply와 같은 page의 결과는 유지한다.                                        |

## 5. 심사위원용 라이브 테스트 안내

Devpost testing instructions는 안전한 read-only smoke test와 선택적인 mutation test를
분리해 제공한다.

```text
Testing Liminal Wiki

Environment

1. Open https://liminal-wiki-webmcp.epinfomax.chatgpt.site/ in ChatGPT's
   desktop in-app browser, which supports WebMCP by default. The official rules
   also permit Chrome 149 or later with the WebMCP testing flag enabled.
2. Sign in with ChatGPT. No shared password is required. The first sign-in
   creates an isolated private wiki owned by that account.

Safe read-only smoke test

Ask the agent:

"Use only the WebMCP tools registered by the currently open Liminal Wiki page.
Tell me which wiki and page are active, what role and capabilities I have, and
what operating rules apply. Do not make any changes."

Expected behavior:
- the host discovers the tools of the open page;
- calls include wiki_get_context and wiki_get_operating_contract;
- the returned wiki, page, and role match the visible Site;
- no mutation occurs.

Optional mutation test

Use only the judge account's private wiki. In an empty wiki, ask:

"Use only the WebMCP tools registered by the currently open Liminal Wiki page.
Create a page titled Judge Test Note containing the sentence: 'This page was
created through the WebMCP tools of the open Liminal Wiki page.' Search first
and do not add external factual claims."

Expected behavior:
- the agent reads live context and searches before creating;
- the page is created only in the judge's private wiki;
- Documents shows Judge Test Note and its first immutable revision.

The integration is page-scoped WebMCP, not an independent remote MCP server.
Closing the page, switching wikis, or changing permissions may require tool
rediscovery. The structured request is product-level authorization only; it
does not bypass browser or host confirmations.
```

### 심사 시 확인할 안전 계약

- 비로그인 요청은 sign-in 경계를 만나고 protected API는 거부된다.
- 첫 로그인 계정은 격리된 개인 wiki의 owner가 되며 다른 계정의 wiki를 발견하지
  못한다.
- owner가 직접 추가한 membership만 shared wiki 접근을 허용한다.
- viewer와 operational read-only session에는 content mutation tool이 노출되지
  않으며 서버도 같은 정책을 재검사한다.
- membership, ownership, full backup/import, 운영 설정과 wiki deletion은 사람용
  관리 기능이다.
- `wiki_create_vault`는 `can_create_wiki` 세션에만 나타나며 membership이나 owner
  control을 우회하지 않는다.
- recovery Site는 blank-site restore와 검증을 위한 운영 예외이며 일반 knowledge
  request UX가 아니다.

## 6. 최종 제출, 동결과 근거 기록

### 공식 일정과 내부 동결

```text
2026-09-04 05:00 KST   Final submission and Devpost submission lock
2026-09-22 09:00 KST   Judging period ends
2026-09-24 06:00 KST   Winners announced on or around this time
```

공식 규정상 Submission Period가 끝나면 Devpost Submission은 원칙적으로 변경할 수
없다. live app과 공개 repository도 영상·설명과 동일하게 심사될 수 있도록 final
submission 직후 judged release를 내부적으로 동결한다. 계속 개발해야 하면 심사용
tag·deployment를 유지하고 별도 branch, fork 또는 deployment에서 진행한다.

### Devpost

- [ ] `Join hackathon`과 제출 초안 생성을 완료한다.
- [ ] Project title, short description와 full description에 2절의 영문 원고를
      사용한다.
- [ ] `What was built during the challenge`를 제출 설명에 포함한다.
- [ ] live URL과 5절의 testing instructions를 입력한다.
- [ ] public repository와 detect 가능한 GPL-3.0-only license를 확인한다.
- [ ] 2분 35초 안팎의 public YouTube URL을 입력한다.
- [ ] 모든 제출 자료가 영어이거나 정확한 영문 번역·자막을 포함하는지 확인한다.
- [ ] **2026-09-04 05:00 KST 이전** 최종 Submit과 Devpost 화면 캡처를 완료한다.

### 코드와 라이브 검증

- [ ] final commit의 format, lint, typecheck, unit, UI, build와 GitHub Actions가
      통과한다.
- [ ] 정확한 deployment에서 실제 tool discovery와 `wiki_get_context` 호출을
      기록한다.
- [ ] read-only smoke test와 Aurora mutation demo를 깨끗한 개인 wiki에서 완주한다.
- [ ] viewer/owner/read-only capability projection을 확인한다.
- [ ] search → plan → apply → claims/revisions/lint workflow를 검증한다.
- [ ] 영상과 제출 원고의 UI 명칭, fixture, 승인 경계와 tool 설명이 실제 배포본과
      같다.
- [ ] 로그아웃 창에서 YouTube, live URL과 repository가 모두 열린다.
- [ ] 심사 종료까지 live app이 무료로 접근 가능하고 judged deployment가 유지된다.

### GitHub 외형

- [ ] About description을 다음으로 설정한다.

  ```text
  The wiki you update by asking—not editing. Powered by page-scoped WebMCP.
  ```

- [ ] Homepage에 live app URL을 등록한다.
- [ ] topics에 `webmcp`, `ai-agent`, `wiki`, `knowledge-management`,
      `human-in-the-loop`, `provenance`, `agentic-workflow`, `versioning`을 등록한다.
- [ ] social preview에 `The wiki you update by asking—not editing.`와
      `People decide. Agents maintain.`를 사용한다.
- [ ] final commit에 심사용 tag를 만들고 README, Devpost, 영상 메시지를 맞춘다.

### 최종 증거 기록

```text
Final submission time:
Devpost project URL:
YouTube URL:
Repository URL:
Final commit SHA:
Git tag:
Production deployment ID:
Live app smoke-test result:
Read-only WebMCP test result:
Mutation demo result:
Verified by:
```

### 공식 자료

- OpenAI WebMCP Challenge: <https://openai.com/webmcp-challenge/>
- Devpost Overview: <https://webmcp.devpost.com/>
- Devpost Official Rules: <https://webmcp.devpost.com/rules>
- WebMCP specification: <https://github.com/webmachinelearning/webmcp>

### 프로젝트 자료

- Public repository: <https://github.com/rca32/llmwiki-webmcp>
- WebMCP registration: `site/app/site-tools.tsx`
- Current tool names: `site/lib/webmcp-tool-names.ts`
- Aurora fixture: `docs/fixtures/project-aurora-launch-review.md`
- System design and acceptance: `docs/SYSTEM_DESIGN.md`
- Technical guide: `docs/TECHNICAL_GUIDE.md`
- Production Site guide: `site/README.md`
- Source provenance: `docs/SOURCE_PROVENANCE.md`
- License: `LICENSE`
