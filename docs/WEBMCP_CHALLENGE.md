# WebMCP Challenge 참가 및 제출 준비 문서

> 조사 기준일: 2026-08-31 KST
> 대상 프로젝트: Liminal Wiki
> 공식 정보는 변경될 수 있으므로 최종 제출 직전에 Devpost 공식 규정을 다시 확인한다.

## 1. 요약

Liminal Wiki는 WebMCP Challenge의 주제와 기술 요구사항에 잘 맞는다. 현재
프로젝트는 ChatGPT Sites에서 실행되는 page-scoped WebMCP 앱이며, 사람 UI와
에이전트 도구가 같은 세션 권한, API, D1/R2 데이터, revision, optimistic
concurrency 및 provenance 규칙을 사용한다.

기술 구현과 로컬 검증은 완료됐지만 다음 외부 제출 항목을 마치기 전에는 제출
준비가 끝난 것으로 볼 수 없다.

1. Devpost 참가 등록 및 제출 초안 생성
2. 심사위원이 접속할 수 있는 격리된 라이브 데모 제공
3. 추가된 루트 라이선스의 GitHub 인식 확인
4. 수정된 GitHub Actions의 원격 전체 CI 통과 확인
5. 영문 제출 설명과 3분 미만 공개 YouTube 데모 준비
6. 외부 심사 세션에서 WebMCP discovery와 실제 호출 재검증

## 2. 공식 일정

Devpost 공식 규정의 Pacific Daylight Time을 Korea Standard Time으로 변환한
일정이다.

| 단계              | 공식 시각            | 한국 시각                |
| ----------------- | -------------------- | ------------------------ |
| 등록 및 제출 시작 | 2026-08-25 11:00 PDT | 2026-08-26 03:00 KST     |
| 등록 및 제출 마감 | 2026-09-03 13:00 PDT | **2026-09-04 05:00 KST** |
| 심사 시작         | 2026-09-04 10:00 PDT | 2026-09-05 02:00 KST     |
| 심사 종료         | 2026-09-21 17:00 PDT | 2026-09-22 09:00 KST     |
| 수상자 발표 예정  | 2026-09-23 14:00 PDT | 2026-09-24 06:00 KST     |

OpenAI 소개 페이지와 Devpost 규정의 시작 시각 표기에는 차이가 있지만 마감
시각은 동일하다. 충돌 시 Devpost 공식 규정을 기준으로 한다.

## 3. 참가 자격과 등록 절차

### 3.1 참가 자격

- 거주 지역의 성년 기준을 충족한 개인이 참가할 수 있다.
- 팀 또는 조직으로 참가할 수 있다.
- 팀이나 조직은 제출을 담당할 대표자 한 명을 지정해야 한다.
- 참가자는 OpenAI API 지원 국가 또는 지역의 거주자여야 하며 공식 제외
  지역에 해당하지 않아야 한다.
- 대한민국은 공개된 제외 목록에 없지만 각 참가자는 자신의 성년 여부와 최신
  지원 국가 조건을 직접 확인해야 한다.

### 3.2 Devpost 등록

등록에는 개인정보 입력과 공식 규정 동의가 포함되므로 참가자 또는 팀 대표자가
직접 진행한다.

1. <https://webmcp.devpost.com/>에 접속한다.
2. `Join hackathon`을 누른다.
3. Devpost 계정을 생성하거나 기존 계정으로 로그인한다.
4. 개인, 팀 또는 조직 참가 형태를 정하고 필요한 팀원을 연결한다.
5. `My projects` 또는 `Enter a Submission`에서 제출 초안을 생성한다.
6. 필수 자료를 입력하고 초안으로 저장한다.
7. 마감 전에 최종 `Submit`까지 완료한다. 초안 저장만으로는 제출되지 않는다.

Devpost Hackathons 플러그인은 선택 사항이며 참가나 수상에 필수적이지 않다.

### 3.3 현재 Project overview 입력안

**Project name**

```text
Liminal Wiki
```

**Elevator pitch**

```text
A source-grounded knowledge workspace where humans and AI agents share the same tools, permissions, revisions, and provenance through WebMCP.
```

## 4. 공식 제출 요구사항

제출물에는 다음 항목이 필요하다.

- 심사위원이 ChatGPT 인앱 브라우저 또는 WebMCP가 활성화된 Chrome에서 접근할
  수 있는 실제 라이브 URL
- 다음 내용을 설명하는 프로젝트 소개문
  - 이 use case가 WebMCP에 적합한 이유
  - 사용자 경험이 어떻게 개선되는지
  - 사람과 에이전트가 이전에는 어렵거나 불가능했던 어떤 일을 함께 하는지
  - WebMCP를 어떻게 구현했는지
- GitHub, GitLab 또는 Bitbucket의 공개 코드 저장소 URL
- 프로젝트 실행에 필요한 소스, 에셋 및 사용 지침
- 저장소 상단에서 감지되고 GitHub About에 표시되는 오픈소스 라이선스
- 3분 미만의 공개 YouTube 데모 영상
  - 실제 작동 장면
  - WebMCP 사용 장면
  - 구현 내용과 WebMCP 활용을 설명하는 음성
- 비공개 앱인 경우 심사용 접근 방법 또는 테스트 인증 정보
- 영문 제출 자료 또는 모든 비영문 자료에 대한 영문 번역과 영상 자막

제출 마감 후에는 원칙적으로 제출 자료를 변경할 수 없다. 라이브 프로젝트는
적어도 심사 기간이 끝날 때까지 무료이고 제한 없이 테스트할 수 있어야 한다.

## 5. 심사 기준

1차 심사는 주제와 요구 API의 기본 적용 여부를 pass/fail로 확인한다. 이를
통과한 제출작은 다음 네 기준으로 동일 가중치 평가를 받는다.

1. **WebMCP Leverage**: WebMCP를 얼마나 깊고 능숙하게 활용했는가
2. **Execution**: 단순 기술 PoC가 아니라 완결된 제품 경험인가
3. **Potential Impact**: 구체적인 사용자의 실제 문제를 해결하는가
4. **Creativity & Ambition**: 기존 개념과 구별되는 창의성과 야심이 있는가

Liminal Wiki는 다음과 같이 대응할 수 있다.

- 열린 페이지, 현재 vault, 로그인 세션 및 role에 따라 도구가 달라진다.
- UI와 에이전트가 동일한 D1/R2 데이터와 same-origin API를 사용한다.
- 사람은 운영 계약과 ingest 계획을 검토하고 에이전트는 검색, 계획, 승인된 적용,
  provenance 및 품질 감사를 수행한다.
- CAS, idempotency, immutable revision, audit trail로 사람과 에이전트의 동시
  작업을 안전하게 만든다.

## 6. 현재 프로젝트 감사 결과

| 요구사항                      | 상태        | 근거 또는 후속 작업                                                                                                                                   |
| ----------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 챌린지 기간 내 신규 프로젝트  | 통과        | 공개 저장소 생성일은 2026-08-27, 최초 커밋은 2026-08-30이다.                                                                                          |
| 공개 코드 저장소              | 통과        | <https://github.com/rca32/llmwiki-webmcp>                                                                                                             |
| ChatGPT Sites 설정            | 통과        | `site/.openai/hosting.json`에 project, D1, R2 binding이 있다.                                                                                         |
| WebMCP 등록 구현              | 통과        | `site/app/site-tools.tsx`에서 capability 확인 후 `document.modelContext.registerTool()`을 호출한다.                                                   |
| lifecycle cleanup             | 통과        | component unmount 시 AbortController로 등록을 정리한다.                                                                                               |
| capability-gated 도구         | 통과        | read, write, vault 생성 도구를 세션 capability에 따라 선택한다.                                                                                       |
| closed schema와 executor 검증 | 통과        | top-level `additionalProperties: false`와 실행기 재검증이 있다.                                                                                       |
| 실제 WebMCP 활용 깊이         | 강점        | 현재 catalog는 세션에 따라 최대 22개 도구를 제공한다.                                                                                                 |
| owner host discovery          | 부분 통과   | owner 세션에서 discovery와 harmless read call 성공 기록이 있다.                                                                                       |
| editor/viewer 권한 행렬       | 부분 통과   | hosted demo editor에서 제한된 20-tool discovery와 실제 호출을 검증했다. viewer-only hosted 비교는 남아 있다.                                          |
| 최신 핵심 ingest 흐름         | 통과        | production demo에서 context → contract → search → plan → apply → claims/revisions/lint를 완주했다.                                                    |
| 외부 심사 접근                | 통과        | Site는 public admission이며, 로그인한 비회원에게 계정별 격리 `WebMCP Demo` editor membership을 자동 연결한다. 익명 API와 관리자 권한은 계속 차단된다. |
| 루트 라이선스 인식            | 부분 통과   | 루트 `LICENSE`와 README의 GPL-3.0-only 적용 범위는 준비됐다. push 후 GitHub About 인식 확인이 남아 있다.                                              |
| GitHub Actions                | 재검증 필요 | 로컬에서 server bind, Windows 종료, UI selector와 접근성 실패를 수정해 `test:ui:ci`가 통과했다. 원격 Actions green 확인이 남아 있다.                  |
| 영문 제출 설명                | 미완료      | 아래 초안을 기준으로 최종 편집해야 한다.                                                                                                              |
| 공개 YouTube 영상             | 미완료      | 3분 미만 데모를 촬영하고 공개 URL을 제출해야 한다.                                                                                                    |

## 7. 제출 전 기술 조치

### 7.1 격리된 심사용 라이브 환경

production judge demo는
<https://liminal-wiki-webmcp.epinfomax.chatgpt.site/>에서 제공한다. 여기서 Site의
`public`은 owner 초대 없이 URL의 로그인 경계까지 접근할 수 있다는 뜻이며, 익명
wiki/API 접근을 뜻하지 않는다.

- ChatGPT 로그인이 필요하며 비로그인 API 요청은 기존과 같이 거부한다.
- 자동 onboarding은 production 환경에서 `PUBLIC_DEMO_AUTO_ONBOARD=true`를
  명시한 경우에만 활성화한다.
- 기존 membership이 없는 로그인 계정에는 계정별로 결정적이고 격리된
  `WebMCP Demo` vault를 자동 생성한다. 다른 계정은 이 vault를 발견하거나 읽을 수
  없다.
- demo role은 일반 콘텐츠의 `can_read`와 `can_write`만 유지한다.
- vault 생성, revision 복원, soft delete, 멤버·첨부 관리, import/export와 full
  backup capability는 제거한다.
- capability에 없는 WebMCP 도구는 discovery에서 제외하고, 같은 권한을 서버 API가
  다시 검사한다.
- 각 demo vault는 50 pages와 2 MiB D1 content 한도를 가진다.
- 대표 read/write 흐름은 허용하지만 owner 계정, 비밀번호나 private vault는
  심사위원에게 제공하지 않는다.

### 7.2 루트 라이선스

- 저장소 루트에 `LICENSE`를 추가한다.
- GPL-3.0-only의 적용 범위를 루트 README에서 명확히 설명한다.
- push 후 GitHub 저장소 About 영역에 라이선스가 표시되는지 확인한다.

### 7.3 CI 수정 및 원격 재검증

2026-08-30 GitHub Actions 실행에서 lint, typecheck, unit tests, notices, DB
check, build, bundle 및 production dependency audit는 통과했다. 이후 `vinext
dev`는 `http://localhost:3000`에서 시작됐지만 `start-server-and-test`가
`http://127.0.0.1:3000`을 기다리다가 5분 후 timeout됐다. 이 때문에 UI,
performance 및 backup-spike gate가 완주하지 못했다.

로컬 수정 결과:

1. `vinext dev --hostname 127.0.0.1`로 bind 주소와 health check 주소를 일치시켰다.
2. 최신 Windows에서 제거된 `wmic.exe`에 의존하지 않는 CI server runner로 교체했다.
3. 다국어 UI 이후 stale selector와 동적 fixture type을 수정하고 axe 접근성 검사를 통과했다.
4. 로컬 `test:ui:ci`는 통과했다. GitHub Actions에서 performance와 backup-spike까지
   완주하는지 확인하고 최종 제출 commit의 run을 green으로 유지한다.

### 7.4 `wiki_plan_ingest` annotation

수정 완료. `wiki_plan_ingest`는 write catalog로 이동했고
`readOnlyHint: false`, `idempotentHint: false`로 표시한다. discovery는
`can_write` 세션으로 제한하고 `POST /api/ingest/plans`도 서버에서 `can_write`를
다시 검사한다. 이 도구는 plan과 audit event를 저장하지만 wiki page와 claim은
명시적으로 승인된 `wiki_apply_ingest` 전까지 변경하지 않는다.

### 7.5 최종 검증

소스나 성공한 build만으로 WebMCP 완료를 주장하지 않는다. 정확한 심사용 URL을
지원 host에서 열고 다음을 기록한다.

1. WebMCP capability 획득
2. `fetchTools()` 결과와 발견된 도구 이름
3. descriptor의 description, schema, annotation
4. `wiki_get_context` 또는 `wiki_get_operating_contract` 실제 호출 결과
5. search → plan → review → apply → claims/lint 대표 흐름
6. viewer/editor/owner별 도구 projection
7. vault 전환이나 권한 변경 후 rediscovery
8. 의도적으로 실행하지 않은 destructive mutation

## 8. 제출용 설명 초안

### 8.1 Project title

```text
Liminal Wiki — A Source-Grounded Knowledge Workspace for Humans and Agents
```

### 8.2 Short description

```text
Liminal Wiki gives people and agents one shared knowledge workspace with the same permissions, revisions, provenance, and commands. Humans define the operating contract and approve changes; agents search existing knowledge, prepare source-grounded ingest plans, apply approved updates, and audit claims without bypassing the UI's safety rules.
```

### 8.3 Why WebMCP

```text
Liminal Wiki is stateful by design: every action depends on the open vault, the current page, the signed-in user's role, and the latest revision. WebMCP lets the page expose precise, session-aware tools instead of forcing an agent to infer complex workflows from screenshots and DOM interactions.
```

### 8.4 Better user experience

```text
People and agents work through the same APIs and permission model. Agent changes use optimistic concurrency, idempotency keys, immutable revisions, and an audit trail, so users can review, recover, and understand every change without maintaining a separate automation backend.
```

### 8.5 What people and agents can do together

```text
A person can define a vault's knowledge policy and review a proposed ingest plan while an agent searches existing pages, prepares source-grounded updates, records claim-level provenance, applies only the approved plan, and audits the vault for missing sources, broken links, and stale claims.
```

### 8.6 Implementation summary

```text
The ChatGPT Sites client registers page-scoped tools with document.modelContext.registerTool(). It obtains session capabilities from a same-origin endpoint, exposes only authorized tools, validates closed JSON Schemas again in each executor, and delegates work to the same D1/R2-backed APIs used by the human interface. Abort signals clean up registrations, while version checks, idempotency keys, revisions, and bounded telemetry protect mutations and retries.
```

## 9. 3분 데모 구성

| 구간      | 내용                                                                     |
| --------- | ------------------------------------------------------------------------ |
| 0:00–0:15 | 문제 소개: AI가 웹앱을 화면과 DOM으로 추측해야 하는 한계와 WebMCP의 해법 |
| 0:15–0:35 | 열린 페이지가 현재 로그인 세션과 role에 맞는 도구를 직접 제공하는 장면   |
| 0:35–0:52 | WebMCP discovery와 `wiki_get_context` 실제 호출                          |
| 0:52–1:10 | 클릭 대신 제품 수준의 작업인 운영 규칙 확인과 지식 검색 실행             |
| 1:10–1:36 | 구조화된 입력과 결과로 `wiki_plan_ingest` 계획 생성                      |
| 1:36–1:55 | WebMCP가 앱의 승인·권한·버전 안전장치를 그대로 지키는 장면               |
| 1:55–2:18 | 같은 API와 데이터에 적용되어 사람 UI에 즉시 나타나는 결과                |
| 2:18–2:40 | stable ID, evidence, revision과 `wiki_lint`로 검증 가능한 결과 확인      |
| 2:40–2:55 | 사람 UI와 AI 도구가 하나의 제품을 공유한다는 WebMCP 가치로 결론          |

영상은 3분 미만, 공개 YouTube 상태, 음성 포함이어야 한다. 한국어 음성을 사용할
경우 정확한 영문 자막과 제출 자료의 영문 번역을 함께 제공한다.

### 9.1 데모의 한 문장 이야기

```text
Liminal Wiki는 WebMCP를 통해 열린 웹페이지 자체가 현재 상태와 권한에 맞는
구조화된 도구를 AI에게 제공하는 모습을 보여준다. AI는 화면을 추측하거나 별도
자동화 계정을 사용하지 않고, 사람이 쓰는 것과 같은 제품 규칙과 API를 통해
검색하고 계획하며 승인된 변경을 적용한다. 결과는 즉시 같은 UI에 나타난다.
```

발표 전체는 다음 세 가지 WebMCP 장점을 전달한다.

1. **Page-native tools** — AI가 화면이나 DOM을 추측하지 않고, 열린 페이지가
   제공한 명시적인 제품 기능을 호출한다.
2. **Live context and permissions** — 도구는 현재 vault, 페이지 상태, 로그인 세션과
   role을 반영하며 권한이 바뀌면 발견되는 기능도 달라진다.
3. **One product, two interfaces** — 사람 UI와 AI 도구가 동일한 API, 데이터,
   승인 규칙과 version을 사용하므로 별도 자동화 사본이나 동기화가 필요 없다.

내레이션에서는 WebMCP를 단순히 한 번 언급하고 지나가지 않는다. 각 장면에서
일반 브라우저 자동화나 별도 remote MCP 연결과 무엇이 다른지 사용자 가치로
설명한다. API나 데이터베이스 내부 구조는 설명하지 않고, tool discovery, schema,
실제 호출, `plan_hash`, version과 UI 반영을 WebMCP의 효과를 증명하는 장면으로
사용한다. 발표자는 차분하고 자신 있게 말하며 실제 동작으로 주장을 입증한다.

영상에서 기능 수를 나열하는 대신 이 협업 루프 하나를 완주한다. 심사위원이
반드시 확인해야 할 장면은 다음 다섯 가지다.

1. 심사용 공개 환경은 개인정보가 없는 격리된 demo이며 실제 개인 vault가 아니다.
2. WebMCP는 별도 AI 계정이나 만능 권한이 아니라 현재 로그인 세션과 role을 쓴다.
3. 일반 브라우저 자동화가 아니라 현재 페이지가 제공한 WebMCP 도구를 호출한다.
4. `plan`과 `apply` 사이에 사람의 명시적 승인이 있다.
5. 적용 결과가 source, claim, revision 및 lint 결과로 추적된다.

### 9.2 녹화 전 준비

- judge demo용 격리 vault 이름을 `WebMCP Demo`로 통일한다.
- 여기서 `공개 demo`는 심사위원이 별도 owner 승인을 받지 않아도 접근할 수 있다는
  뜻이다. 익명 API 공개를 뜻하지 않는다. Site와 API는 ChatGPT 로그인을 요구하고,
  도구는 로그인한 심사 세션의 membership과 role을 사용한다.
- 첫 로그인에서 계정별 demo vault가 자동 생성되고, 다른 계정의 demo/private
  vault는 목록과 검색에 나타나지 않는다는 점을 확인한다.
- demo에는 `can_read`와 `can_write`만 남고, vault 생성·복원·삭제·멤버 관리·백업
  도구가 discovery에 없다는 점을 `wiki_get_context`와 tool catalog로 보여준다.
- 50 pages와 2 MiB D1 content 한도는 심사용 오남용 방지 장치로 설명하되 영상의
  핵심 협업 흐름을 방해하지 않도록 한 문장으로만 언급한다.
- 녹화 계정에는 `can_read`와 `can_write`가 있어야 하며, 화면에 개인 이메일이나
  다른 vault의 비공개 데이터가 보이지 않게 한다.
- 가능하면 로그아웃 창에서 `Sign in with ChatGPT` 경계를 2~3초 보여준 뒤,
  로그인된 demo 화면으로 전환한다. 실제 이메일이나 인증 과정은 녹화하지 않는다.
- 아래 시연에서 사용할 제목이 아직 존재하지 않는 깨끗한 seed 상태를 만든다.
  - source: `OpenScreen GitHub README — product overview`
  - entity: `OpenScreen`
- operating contract에 `source`, `concept`, `plan_before_apply`,
  `search_before_create`와 필요한 source metadata가 설정되어 있는지 확인한다.
- 정확한 라이브 URL을 지원 host에서 열고 `fetchTools()` 또는 host의 도구 목록에서
  현재 세션용 catalog를 확인한다. 영상에는 실제 발견된 도구 수를 표시하며 숫자를
  대본에 고정하지 않는다.
- `wiki_get_context`, `wiki_get_operating_contract`, `wiki_search`,
  `wiki_plan_ingest`, `wiki_apply_ingest`, `wiki_get_claims`,
  `wiki_list_revisions`, `wiki_lint`가 실제로 호출되는지 리허설한다.
- `wiki_plan_ingest`가 write-only discovery와 non-idempotent annotation으로
  표시되는지 녹화 직전 다시 확인한다.
- ChatGPT 응답 대기 구간만 잘라낼 수 있다. 도구명, 입력 승인, 성공 결과가 이어지는
  장면은 남기고, 배속했다면 화면에 배속 사실을 표시한다.

### 9.3 촬영용 source packet

아래 자료는 OpenScreen 공개 저장소 README의 내용을 이용한 고정 fixture다.
사용자가 제품을 조사하다 발견한 공개 자료를 개인 위키에 보관하는 상황을 만든다.
`retrieved_at`만
실제 녹화 시각의 ISO 8601 값으로 바꾼다. evidence fragment는 source Markdown에
정확히 존재해야 한다.

```text
Source title: OpenScreen GitHub README — product overview
Source URL: https://github.com/getopenscreen/openscreen
Retrieval status: success
Retrieved at: <RECORDING_TIME_IN_ISO_8601>
Extraction method: manual-summary-and-excerpt
Confidence: 0.95

Source Markdown:
# OpenScreen GitHub README — product overview

OpenScreen is an open-source desktop recorder designed to turn raw screen captures into polished demos and walkthroughs.

Automatic captions for voiceovers, transcribed on-device with no upload (works offline), with an editable transcript you can cut from and optional subtitle translation.

Proposed entity page:
- title: OpenScreen
- type: entity
- markdown: |
    # OpenScreen

    OpenScreen is a free, open-source desktop application for creating polished
    screen-recorded product demos. It can transcribe voiceover captions locally
    and optionally translate subtitles.

    Source: [[OpenScreen GitHub README — product overview]]

Proposed claim:
- subject: OpenScreen
- predicate: supports
- object value: on-device automatic captions for voiceovers
- evidence fragment: Automatic captions for voiceovers, transcribed on-device with no upload (works offline), with an editable transcript you can cut from and optional subtitle translation.
- confidence: 0.95
```

### 9.4 2분 55초 최종 제품 소개 대본

| 시간      | 화면과 조작                                                                                                                                                                                | 한국어 내레이션                                                                                                                                                                                                       | 영문 자막                                                                                                                                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00–0:15 | 어두운 배경에 `What if a web app could tell AI exactly what it can do?`를 띄운 뒤 Liminal Wiki와 ChatGPT 화면으로 전환한다.                                                                | 지금까지 AI는 웹앱을 바깥에서 다뤘습니다. 화면을 읽고, 버튼을 추측하고, UI가 바뀌면 다시 배워야 했죠. WebMCP는 이 관계를 뒤집습니다. 이제 열린 페이지가 AI에게 정확한 도구를 직접 제공합니다.                         | Until now, AI has operated web apps from the outside—reading screens, guessing at controls, and breaking when the UI changes. WebMCP reverses that relationship: the open page provides AI with precise tools directly.                                                  |
| 0:15–0:35 | `Liminal Wiki` 로고 뒤 로그아웃 상태의 `Sign in with ChatGPT`를 2초 보여준다. 로그인된 비식별 `WebMCP Demo`로 전환해 `editor`, 허용 capability와 제한된 tool catalog를 함께 보여준다.      | 공개 URL은 초대 없이 로그인할 수 있다는 뜻이지 익명 데이터 공개가 아닙니다. 로그인하면 계정별 격리 데모가 생기고 읽기와 쓰기만 허용됩니다. 멤버 관리, 백업과 복원 같은 관리자 기능은 UI와 WebMCP 모두에서 제외됩니다. | The public URL removes the invite requirement; it does not expose anonymous data. Sign-in creates an isolated per-account demo with read and write access only. Admin actions such as member management, backup, and restore stay unavailable in both the UI and WebMCP. |
| 0:35–0:52 | 프롬프트 1을 전송한다. 발견된 descriptor의 name, description, input schema를 짧게 보여준 뒤 `wiki_get_context`의 실제 결과와 현재 UI의 vault·role이 일치하는지 강조한다.                   | ChatGPT는 페이지가 설명한 이름과 스키마로 도구를 발견하고 실제로 호출합니다. DOM에서 텍스트를 긁어 현재 상태를 짐작하는 대신, `wiki_get_context`가 열린 공간과 허용된 작업을 구조화된 결과로 돌려줍니다.              | ChatGPT discovers tools through the names and schemas published by the page, then calls them for real. Instead of scraping the DOM to infer state, `wiki_get_context` returns the open workspace and allowed actions as structured data.                                 |
| 0:52–1:10 | `wiki_get_operating_contract`의 핵심 규칙과 `wiki_search` 결과를 연속해서 보여준다. 검색 중에는 마우스 클릭이 발생하지 않는 것을 화면에서 확인시킨다.                                      | 중요한 점은 WebMCP가 버튼 클릭을 자동화하는 기술이 아니라는 것입니다. 페이지는 ‘운영 규칙 읽기’와 ‘지식 검색’처럼 제품이 의미를 아는 작업을 제공합니다. UI 배치가 바뀌어도 이 작업 계약은 유지됩니다.                 | WebMCP is not a faster way to automate button clicks. The page exposes product-level actions such as reading workspace rules and searching knowledge. The interface can move while that action contract remains stable.                                                  |
| 1:10–1:36 | 프롬프트 2를 보낸다. `wiki_plan_ingest` 입력과 결과에서 OpenScreen source, entity, grounded claim이 하나의 typed review plan으로 묶이는 모습을 보여주고 `Ready for review`를 오버레이한다. | 이제 공개 자료를 위키에 추가해 보겠습니다. 한 번의 구조화된 호출이 source, entity와 근거 있는 claim을 검토 가능한 계획으로 반환합니다. AI와 앱이 화면 문장이 아니라 명확한 입력과 결과 계약으로 대화하는 장면입니다.  | Now I will add a public source to the wiki. One structured call returns a reviewable plan containing the source, entity, and grounded claim. The AI and the app communicate through an explicit input-and-result contract, not screen text.                              |
| 1:36–1:55 | source와 confidence를 확인한 뒤 프롬프트 3을 전송한다. `approved: true`, 동일한 `plan_hash`, 현재 version과 새 `operation_id`를 차례로 강조한다.                                           | WebMCP가 페이지 기능을 제공한다고 해서 앱의 안전장치를 우회하지는 않습니다. 같은 로그인 권한이 다시 검사되고, 명시적 승인과 plan hash, version이 검토하지 않은 변경이나 오래된 쓰기를 막습니다.                       | Exposing an action through WebMCP does not bypass the app's safeguards. The same session permission is enforced again, while explicit approval, the plan hash, and the current version prevent unreviewed or stale writes.                                               |
| 1:55–2:18 | apply 성공 직후 왼쪽 tree에 source와 OpenScreen entity가 생기는 모습을 보여준다. tool result의 stable page ID/version을 UI의 새 페이지와 revision에 연결해 강조한다.                       | 적용 결과는 별도의 AI용 데이터베이스에 저장되지 않습니다. WebMCP 도구가 사람 UI와 같은 API와 같은 데이터를 사용하기 때문에 새 페이지와 revision이 즉시 현재 화면에 나타납니다. 동기화할 두 번째 시스템이 없습니다.    | The result is not stored in a separate database for AI. Because the WebMCP tool uses the same APIs and data as the human interface, the new page and revision appear here immediately. There is no second system to synchronize.                                         |
| 2:18–2:40 | 프롬프트 4를 보낸다. `wiki_get_claims`, `wiki_list_revisions`, `wiki_lint`의 구조화된 결과에서 source ID, evidence, revision과 issue count를 차례로 보여준다.                              | 도구 결과도 다음 작업에 쓸 수 있는 stable ID와 구조를 가집니다. ChatGPT는 방금 만든 claim의 근거와 revision을 다시 따라가고, 위키 전체 품질까지 검사합니다. 이것이 단순 클릭 자동화와 제품 수준 통합의 차이입니다.    | Tool results carry stable IDs and structure that later actions can reuse. ChatGPT can trace the claim back to its evidence and revision, then audit the wiki. That is the difference between click automation and product-level integration.                             |
| 2:40–2:55 | Liminal Wiki UI와 ChatGPT tool result를 나란히 보여주고 `Page-native tools · Session-aware · One shared product`를 표시한다.                                                               | WebMCP를 사용하면 웹페이지는 AI가 조작하는 화면을 넘어, 자신의 기능과 경계를 직접 설명합니다. AI는 사용자의 실제 세션 안에서 일하고, 사람 UI와 AI 도구는 하나의 제품이 됩니다.                                        | With WebMCP, a page is no longer just a screen for AI to operate. It declares its capabilities and boundaries while AI acts within the user's real session. The human UI and AI tools become one product.                                                                |

### 9.5 화면에서 전송할 프롬프트

프롬프트는 미리 클립보드에 준비해 입력 시간을 줄인다. host가 도구 호출 전 확인을
요구하면 그 확인 화면도 사람 승인 장면의 일부로 남긴다.

**프롬프트 1 — 컨텍스트, 정책과 중복 확인**

```text
Use only the WebMCP tools provided by the Liminal Wiki page currently open.
First, tell me which workspace I am in and what permissions I have.
Then read its operating rules and check whether it already contains anything about
"OpenScreen." Do not make any changes yet.
```

기대 호출 순서:

```text
wiki_get_context
→ wiki_get_operating_contract
→ wiki_search
```

**프롬프트 2 — source-grounded 계획만 생성**

```text
Great. If there is no duplicate, use the material below to prepare an ingest plan
for this wiki. Include one source page, one entity page, and one claim linked to
exact evidence. Do not apply anything yet. Show me the proposed changes and any
warnings so I can review them first.

<PASTE THE COMPLETE SOURCE PACKET FROM SECTION 9.3 HERE>
```

기대 호출:

```text
wiki_plan_ingest
```

**프롬프트 3 — 사람이 검토한 계획 적용**

```text
I have reviewed the source, the proposed changes, the confidence score, and the
warnings. I approve this exact plan. Apply it without changing anything from the
version I just reviewed.
```

기대 호출:

```text
wiki_apply_ingest
```

화면에서 `approved: true`, 이전 결과와 동일한 `plan_hash`, 새 UUID 형식의
`operation_id`를 확인한다. plan 내용이나 hash가 달라졌다면 승인하지 말고 다시
계획한다.

**프롬프트 4 — provenance와 품질 검증**

```text
Find the "OpenScreen" page we just added. Verify its original source, exact
supporting evidence, and latest revision, then run a wiki quality check. Do not
make any further changes. Give me a concise summary of what you verified.
```

기대 호출 순서:

```text
wiki_search
→ wiki_get_claims
→ wiki_list_revisions
→ wiki_lint
```

### 9.6 촬영 성공 기준

- 심사용 공개 demo와 실제 private vault의 차이가 음성과 화면에서 명확하다.
- 로그아웃 상태에서는 sign-in 경계가 보이고, 로그인 후에는 현재 role에 맞는
  도구만 발견된다. 이메일이나 인증 정보 자체는 노출하지 않는다.
- tool call 카드나 host의 도구 상세에 `wiki_*` 이름이 읽을 수 있게 보인다.
- `wiki_get_context` 결과의 active vault와 capability가 현재 UI와 일치한다.
- demo context에서 `can_read`와 `can_write`는 true이고, vault 생성·복원·삭제·멤버
  관리·첨부·import/export·full backup capability는 false로 표시된다.
- 제한된 관리 도구가 WebMCP catalog에 없고 직접 API 호출도 같은 서버 권한 검사로
  거부된다는 점을 확인한다.
- operating contract에서 `search_before_create`와 `plan_before_apply`가 확인된다.
- 계획 결과에 `plan_id`, 64자리 `plan_hash`, source/page/claim action이 있다.
- 사람의 승인 전에는 `wiki_apply_ingest`가 호출되지 않는다.
- apply 입력에 `approved: true`, 동일한 hash와 새 `operation_id`가 보인다.
- apply 후 UI와 tool result에서 같은 page와 version을 확인한다.
- claim 결과에 source page와 evidence fragment가 연결된다.
- revision과 lint는 실제 호출 결과를 보여준다. lint issue가 0일 필요는 없으며,
  issue가 있다면 에이전트가 숨기지 않고 요약하는 편이 더 신뢰할 수 있다.
- 비밀번호, cookie, bearer token, 개인 이메일, 내부 deployment secret은 화면에
  노출하지 않는다.

### 9.7 실패 시 대체 장면

| 문제                       | 대체 방법                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 도구 discovery가 비어 있음 | 녹화를 중단하고 지원 host, 정확한 URL, 로그인 세션과 client registration 오류를 확인한다. 소스 코드 화면으로 성공 장면을 대체하지 않는다. |
| 기존 title이 이미 존재함   | demo vault를 초기 seed로 복구하거나 concept title에 녹화 날짜를 붙인다. 기존 데이터를 덮어쓰지 않는다.                                    |
| plan에 warning이 있음      | warning을 짧게 읽고 안전하면 그대로 심사 포인트로 사용한다. source metadata나 confidence 오류라면 packet을 수정하고 새 plan을 만든다.     |
| apply가 conflict를 반환함  | stale plan이 최신 상태를 덮어쓰지 못했다는 안전 장치로 짧게 설명한 뒤, 깨끗한 seed에서 본 흐름을 다시 촬영한다.                           |
| lint issue가 남음          | issue 종류와 개수를 그대로 보여준다. 데모가 만든 source/claim의 provenance 문제라면 제출 전 수정하고 재촬영한다.                          |
| 응답이 길어 3분을 넘김     | 입력 타이핑과 대기만 컷하고, tool name, 승인, 핵심 structured result는 유지한다.                                                          |

### 9.8 편집 및 업로드 체크

- 최종 러닝타임은 안전 여유를 두고 2분 55초 이하로 맞춘다.
- 1080p 이상에서 도구명, hash, version, evidence가 읽히는지 전체 화면으로
  다시 확인한다.
- 한국어 음성과 의미가 일치하는 영문 자막을 넣고 자동 자막의 `WebMCP`,
  `provenance`, `idempotent`, `Liminal Wiki` 표기를 수동 교정한다.
- 배경 음악은 음성보다 충분히 낮추거나 생략한다.
- YouTube 공개 상태를 `Public`으로 설정하고 로그아웃 창에서 재생한다.
- 영상 설명 첫 부분에 live demo URL, 공개 repository와 testing instructions를
  넣는다.
- 업로드 후 Devpost에 붙일 URL과 실제 공개 영상 URL이 같은지 확인한다.

## 10. 실행 우선순위

### 즉시

- [ ] Devpost `Join hackathon` 완료
- [ ] 제출 초안 생성 및 Project overview 저장
- [x] 저장소 루트 `LICENSE` 추가
- [x] CI server wait timeout 해결
- [x] 심사용 격리 배포의 접근 정책 결정
- [x] `wiki_plan_ingest` annotation과 권한 계약 수정

### 데모 준비

- [x] judge demo용 계정별 격리 vault 자동 생성
- [x] 비-owner 로그인 세션에서 라이브 URL 접근 확인
- [x] host `fetchTools()`와 대표 read call 기록
- [ ] 대표 ingest 흐름 완료; viewer-only role matrix 검증
- [ ] 영문 README와 testing instructions 작성
- [ ] 3분 미만 영상 촬영 및 공개 업로드

### 최종 제출

- [ ] GitHub About에 라이선스, 설명, demo URL 표시 확인
- [ ] 최종 commit의 GitHub Actions green 확인
- [ ] 라이브 URL을 로그아웃 및 지원 host에서 재확인
- [ ] Devpost 설명, repository, demo, video URL 확인
- [ ] 영문 또는 영문 번역 요건 확인
- [ ] 2026-09-04 05:00 KST 이전 최종 제출
- [ ] 2026-09-22 09:00 KST까지 라이브 앱 유지

## 11. 공식 및 프로젝트 근거

### 공식 자료

- OpenAI WebMCP Challenge: <https://openai.com/ko-KR/webmcp-challenge/>
- Devpost Overview: <https://webmcp.devpost.com/>
- Devpost Official Rules: <https://webmcp.devpost.com/rules>
- WebMCP specification repository: <https://github.com/webmachinelearning/webmcp>

### 프로젝트 자료

- 공개 저장소: <https://github.com/rca32/llmwiki-webmcp>
- 실패한 GitHub Actions run:
  <https://github.com/rca32/llmwiki-webmcp/actions/runs/33315537819>
- WebMCP 등록 코드: `site/app/site-tools.tsx`
- Sites 설정: `site/.openai/hosting.json`
- 시스템 설계와 acceptance evidence: `docs/SYSTEM_DESIGN.md`
- production Site README: `site/README.md`
- 라이선스 원본: `site/LICENSE`
