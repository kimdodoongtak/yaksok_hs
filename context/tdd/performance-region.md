# 생성·제출 지연: 검증 기록

## 2026-11-16 진단

- 작업 시작: `main`, HEAD `e56032c`. 기존 미추적 `.vscode/`, 디자인 백업·미리보기, 개발 이슈·메트릭 파일은 보존했다.
- Vercel MCP 프로젝트 조회는 기존 팀 권한 부족(403)으로 실패했다. 인증된 Vercel CLI의 같은 팀·프로젝트 읽기 API로 확인했다.
- 프로젝트 기본 지역 및 현재 운영 배포 지역: `iad1`. 운영 커밋은 로컬 HEAD와 같다.
- `neon projects get wispy-resonance-33468060 --output json`에서 `region_id=aws-ap-southeast-1`, PostgreSQL 17을 확인했다. 출력은 필요한 메타데이터만 선택했다. 기존 로컬 운영 연결은 풀링 주소이며 지역도 일치한다. 연결 문자열은 기록하지 않는다.
- 코드에서 방장 등록, 모집 시작, 시간 제출이 DB 잠금·권한·시각·데이터 읽기·쓰기를 순차 수행하는 것을 확인했다. 지역 간 왕복 누적이 주요 지연 후보다. 개별 쿼리 시간 및 6~7초 쓰기 지연은 직접 측정하지 않았다.

운영 데이터 변경 없는 HTTP GET 기준선(동일 클라이언트, 연속 요청):

| 요청 | 상태 | 전체 응답 |
| --- | --- | --- |
| 홈(CDN HIT) | 200 | 95ms |
| 존재하지 않는 형식상 유효 초대 링크, 1회 | 200 | 1,813ms |
| 같은 링크, 2회 | 200 | 480ms |
| 같은 링크, 3회 | 200 | 475ms |

- DB 조회 응답의 `x-vercel-id`에서 `icn1::iad1`을 확인했다. 첫 요청이 더 느리지만 콜드 스타트 여부를 단정하지 않는다.
- TDD 비대상: 설정 변경만 수행. RED/GREEN 및 제품 테스트 통과를 주장하지 않는다.
- 대체 검증: Docker Node.js v24.22.3 + 기존 Ajv로 실제 사용하는 모든 필드(`$schema`, `framework`, `regions`, `installCommand`, `buildCommand`)를 Vercel 공식 스키마의 원본 필드 정의로 검사, 종료 0. `sin1=ap-southeast-1` 공식 매핑과 함수별 지역 덮어쓰기 부재 확인. `git diff --check` 통과.
- 검증 도구 한계: 최초 전체 스키마 컴파일은 Draft-04 메타스키마 미등록으로 실패했다. 등록 후에도 공식 스키마의 미사용 `experimentalTriggers.retryAfterSeconds.exclusiveMinimum` 숫자 정의가 Draft-04와 충돌했다. 이를 변경·무시하지 않고 앱에서 쓰는 위 다섯 필드의 원본 정의를 각각 검증했다. 전체 스키마 통과라고 보고하지 않는다.
- 앱 소스·의존성·DB 스키마는 변경하지 않았다. 앱 린트·타입·빌드·제품 테스트는 이번 설정 변경에서 재실행하지 않았다. 실제 Vercel 설정 적용은 재배포 후 확인해야 한다.
- 운영 반영 전: 커밋·푸시·배포와 변경 후 성능 검증은 미수행.

## 후속 시간 정보 조회 실패 수정

- 사용자 승인: 커밋·푸시·운영 반영. 방장·참여자 제출 뒤 시간 정보 조회 실패를 함께 해결한다.
- 운영 요청 로그의 `/availability/state`, `/overview` GET에서 반복 HTTP 503을 확인했다. 운영 오류 로그에는 SSL 모드 경고만 있었으며 서비스가 예외를 일반 오류로 반환하므로 내부 오류 코드는 확인하지 못했다.
- `neon inspect db locks --project-id wispy-resonance-33468060 --branch production --output json`: `SELECT ... FOR UPDATE OF p`가 transactionid ShareLock을 대기(`granted=f`)하는 실제 상황 확인. 운영 DB 변경 없음.
- 읽기 두 서비스만 배타 잠금을 생략하고 `RepeatableRead`를 사용한다. 권한·세션·설정·슬롯을 동일 스냅샷으로 반환하며 쓰기 잠금과 시간 제한은 유지한다.

### RED → GREEN

모든 테스트 명령은 `docker compose exec -T tools` 아래 Node.js 24에서 로컬 격리 `sdd_test`를 대상으로 실행했다.

1. `npm run test:integration -- src/lib/candidates/candidates.integration.test.ts -t '진행 중인 쓰기 잠금'`
   - RED exit 1: 독립 연결의 취소 미커밋 잠금을 유지하자 방장·참여자 조회 4개가 2초 내 완료되지 않아 `expected 'blocked' not to be 'blocked'`로 실패.
   - GREEN exit 0: 두 read 경로만 잠금 생략 후 같은 테스트 통과(테스트 파일 208ms). 미커밋 취소는 노출하지 않고 커밋 뒤 새 조회는 두 역할 모두 취소 오류를 반환한다. 이 수치는 로컬 테스트 실행 시간이며 운영 쓰기 지연 개선 수치가 아니다.
2. `npm run test:integration -- src/lib/candidates/candidates.integration.test.ts -t '같은 시점'`
   - RED exit 1: 잠금만 제거한 상태에서 실제 다른 연결이 조회 도중 설정·슬롯 변경을 커밋하자 기존 소요 시간(120분)과 새 슬롯(00:30)/버전(1)이 섞여 두 테스트 실패.
   - GREEN: 읽기 트랜잭션에 `RepeatableRead` 적용 후 두 테스트 통과. 같은 조회는 이전 설정·슬롯을 일관되게 반환하고 다음 조회는 새 설정·슬롯을 반환한다.

### 회귀 진행

- 최초 관련 DB 48개 실행: 새 테스트 포함 47개 통과, 기존 명단 순서 1개 실패. 테스트 데이터의 방장·참여자 생성 시각이 같은 밀리초에 들어가 UUID 순서가 우선된 것이 원인이다. 기대값을 완화하지 않고 fixture의 생성 시각을 1ms 간격으로 고정했다.
- 전체 단위: 43개 통과, exit 0.
- 두 브라우저 동시 제출·자동 갱신·새로고침 후 유지 검증을 사후 회귀로 추가했다. DB 수준 실패 재현과 구분한다.
- `npm run test:integration`: 전체 실제 DB 93개 통과, exit 0. 최대 30명·90일·129,600슬롯 집계도 통과(해당 조회 674.8ms, 로컬 측정).
- `npm run test:browser -- e2e/availability.spec.ts e2e/candidates.spec.ts`: Chromium 42개 통과(1.4분), exit 0. 별도 방장·모바일 참여자 컨텍스트에서 동시에 2시간을 제출하고, 두 화면 집계 2명·본인 제출 상태·주기적 GET 성공·새로고침 뒤 총 8개 슬롯 유지를 확인했다.
- `npm run lint`: exit 0.
- `npm run typecheck`: exit 0.
- `docker compose exec -T -e INVITATION_BROWSER_TEST=1 tools npm run build`: exit 0, Next.js 16.4.3 / Prisma 7.10.1. 이 변수는 출력 디렉터리만 `.next-browser`로 분리하며 앱 동작·DB 설정을 바꾸지 않는다. 기존 개발 서버의 `.next`와 충돌하지 않도록 브라우저 종료 후 실행했다. Docker 주입 DB는 로컬이다.
- `git diff --check`, 신규 문서 상대 링크 확인 통과. 변경 범위 검토에서 쓰기 경로의 `requireParticipantSession` 호출은 기본 잠금 유지, 잠금 생략은 두 읽기 서비스에만 적용되는 것을 확인했다.
- 운영 반영 승인에 따라 수정 파일만 커밋·푸시할 준비를 마쳤다. 새 배포와 변경 후 운영 응답은 아직 미검증이다.
