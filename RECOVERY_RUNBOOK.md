# Liminal Wiki 복구 및 롤백 런북

이 문서는 애플리케이션 회귀, 페이지 데이터 손상, Site 영구 삭제를 서로 다른 장애로 취급한다. 애플리케이션 버전 롤백은 D1/R2 데이터를 되감지 않으며, 데이터 복구는 리비전 또는 외부에 보관한 full backup을 사용한다.

## 복구 전 공통 원칙

1. 쓰기 주체와 시간을 기록하고 가능하면 공유 editor의 쓰기를 잠시 중단한다.
2. Site 삭제 또는 파괴적 재배포를 하지 않는다.
3. 읽기가 가능하면 owner가 즉시 full backup을 내려받고 모든 part의 checksum 확인과 ACK 완료 여부를 운영 화면에서 확인한다.
4. 감사 로그의 request ID, actor, operation, target, 발생 시각을 보존한다.
5. 복구 후에는 UI와 WebMCP 양쪽에서 같은 데이터를 읽어 검증한다.

## 시나리오 A: 애플리케이션 회귀

증상 예: 배포 직후 화면이 열리지 않거나 API가 5xx를 반환하지만 D1/R2 데이터 자체는 손상되지 않았다.

1. Sites의 배포 이력에서 직전 정상 버전과 당시 소스 커밋을 확인한다.
2. 가능하면 Sites 버전 롤백을 사용한다. 롤백 기능을 사용할 수 없으면 직전 정상 커밋을 새 버전으로 재배포한다.
3. 데이터 migration을 역방향으로 실행하지 않는다. migration은 append-only이고 구버전 앱이 현재 schema와 호환되는지 먼저 확인한다.
4. 다음 smoke check를 순서대로 수행한다.
   - 로그인한 owner가 Site를 열 수 있다.
   - `/api/session/capabilities`가 owner 권한을 반환한다.
   - 기존 페이지를 읽고 검색할 수 있다.
   - 복구 가능한 테스트 페이지를 생성·수정·soft delete·restore할 수 있다.
   - built-in browser에서 `webmcp.fetchTools()`로 도구를 발견하고 read 호출 한 건과 복구 가능한 write 호출 한 건을 실행한다.
5. 원인 커밋과 롤백한 Sites 버전을 감사 기록 또는 운영 기록에 남긴다.

## 시나리오 B: 페이지 또는 첨부 데이터 문제

### 페이지 본문

1. 해당 페이지의 리비전 목록에서 정상 스냅샷을 확인한다.
2. 복구 전에 현재 본문과 version을 별도로 보존한다.
3. UI의 리비전 복구 또는 `POST /api/pages/{pageId}/restore`를 사용한다.
4. 복구는 과거 version으로 되감지 않고 정상 스냅샷을 최신 version + 1로 저장해야 한다.
5. 페이지 본문, 위키링크, backlinks, 검색 결과와 감사 이벤트를 확인한다.

### Soft-deleted 페이지 또는 첨부

1. 운영 UI의 휴지통에서 삭제 시각과 actor를 확인한다.
2. 보존 기간 내라면 restore를 실행한다. slug 충돌은 덮어쓰지 말고 새 slug를 지정한다.
3. 첨부는 복원 후 다운로드하여 기록된 SHA-256과 비교한다.
4. purge가 완료된 객체는 Site 내부에서 복구 가능하다고 주장하지 않는다. 필요한 경우 외부 full backup 복원 절차로 전환한다.

## 시나리오 C: Site 영구 삭제 또는 전체 데이터 손실

복구 지점은 Sites 밖에 저장하고 checksum을 확인한 마지막 full backup이다. Site 내부 backup 상태만으로는 영구 삭제 복구를 보장하지 않는다.

1. 마지막 full backup의 ZIP 또는 모든 분할 part, manifest, 각 part SHA-256을 확보한다.
2. 원본 Site와 다른 새 owner-only Site를 만든다. 빈 active wiki를 먼저 만들지 않는다.
3. 새 Site의 bootstrap owner가 복구 담당자와 일치하는지 확인한다.
4. 운영 화면에서 backup을 선택하고 import preview의 다음 값을 원본 기록과 비교한다.
   - schema version과 export 시각
   - 페이지·첨부·리비전 수
   - 전체 byte와 part 수
   - member reference 포함 여부
5. 모든 part를 업로드한다. 중복, 누락, 순서, 크기, checksum 검증이 하나라도 실패하면 commit하지 않는다.
6. commit 후 현재 사용자가 새 owner인지 확인한다. members-reference가 있어도 원래 멤버를 자동 활성화하지 않고 owner가 별도로 재초대한다.
7. 다음 복원 검증표를 완료한다.
   - 페이지 ID, 제목, Markdown과 tree parent가 manifest와 일치한다.
   - 링크 수와 대표 backlinks가 일치한다.
   - 첨부 수와 각 SHA-256이 일치한다.
   - full backup의 보존 리비전이 조회되고 대표 리비전을 새 version으로 복구할 수 있다.
   - 감사 이벤트와 backup policy metadata가 존재한다.
   - WebMCP 도구 discovery와 read/write smoke가 통과한다.
8. 새 Site URL, 복원한 backup run ID, 검증 결과와 데이터 손실 구간(RPO)을 기록한다.
9. 검증 완료 전에는 공유 editor를 활성화하지 않는다.

## Full backup 운영 주기

- pilot 중 적어도 7일마다 full backup을 Sites 밖에 저장한다.
- 운영 화면의 7일 초과 경고를 해제하는 조건은 full backup 생성만이 아니라 모든 part 다운로드, checksum 확인, ACK 완료다.
- 공유 editor를 처음 추가하기 전에 빈 Site restore drill을 1회 완료한다.
- 분기마다 또는 schema 변경 전에 restore drill을 반복한다.
- backup 파일에는 위키 본문과 선택적으로 멤버 이메일 참고 정보가 포함될 수 있으므로 접근 제어된 저장소에 둔다.

## 복구 완료 기록

다음 값을 한 묶음으로 남긴다.

- incident 시작·종료 시각과 담당자
- 영향받은 Site URL과 app version/commit
- backup run ID, manifest hash, part checksum 검증 결과
- 복원 전후 페이지·첨부·리비전 수
- UI, API, WebMCP smoke 결과
- 알려진 데이터 손실 범위와 후속 조치
