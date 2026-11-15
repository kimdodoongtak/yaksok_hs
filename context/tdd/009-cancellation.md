# TDD 실행 기록: 009-cancellation

- 스펙: [009-cancellation-spec.md](../features/009-cancellation-spec.md). AC별 원본 근거와 테스트 경계는 스펙의 TDD 표에 대응한다.
- 시작 기준: main `b5a2d8a`. 기존 009 불러오기 문서와 사용자 `.vscode/`를 보존한다.
- 신규 권한·상태 전이·보존·원자성은 실제 격리 PostgreSQL 서비스 경계, HTTP 계약·열린 화면·오류 복구는 Playwright에서 검증한다. 기존 동작의 사후 회귀와 신규 RED/GREEN을 구분한다.
- CSS는 TDD 비대상이며 320/393/1280px 화면으로 검수한다. 모든 명령은 Docker Node.js 24에서 실행한다.

## 동작별 RED/GREEN

- 권한: DB RED exit 1(UNAUTHORIZED 기대 / UNAVAILABLE 스텁). 공통 잠금·세션·본인 ID·현재 host 확인 후 GREEN 1개 exit 0.
- 상태별 취소·보존: DB RED exit 1(ok:true 기대 / STATE_CHANGED). 008 취소 트랜잭션 연결 후 GREEN 2개 exit 0. draft/collecting/closed/confirmed의 기록·세션 행 보존과 반복 요청의 취소 시각 불변을 확인했다.
- 명령: `npm run test:integration -- src/lib/cancellation/cancellation.integration.test.ts`.

- HTTP 계약: 브라우저 RED exit 1(409 기대 / availability/state의 400). 4개 상세 조회 및 투표 HTTP의 취소 응답을 409로 보완한 후 GREEN 1개 exit 0. 취소·미인증/만료 세션·링크 만료 조합과 공개 최소 조회를 확인했다.
- 명시적 취소 UI: RED exit 1(참여자 화면의 약속 취소 버튼 없음). 확인/처리 중/실패/완료와 열린 시간표·설정 편집 화면 동기화를 연결한 뒤 GREEN 2개 exit 0.
- 초안 취소 UI: RED exit 1(설정 화면에 약속 취소 버튼 없음). 기존 초안 나가기와 별도 확인 흐름을 연결하고 본인 식별값을 서버에서 재검증하도록 했다.
- 후속 DB 롤백·오류 우선순위·기존 진입점 차단·경쟁 테스트는 구현 후 사후 검증으로 구분한다.

- 초안 취소 연결 후 009 브라우저 3개 GREEN exit 0.
- 늦은 조회 경계: 최초 관찰 테스트는 기본 10초 assertion 대기 중 다음 폴링이 화면을 복구해 통과했다. 이전 응답 처리 직후의 화면을 검사하도록 보완해 유효 RED exit 1(취소 후 ‘약속 설정’이 visible)을 확인했다. 취소 완료 때 요청 기준을 무효화하고 늦은 응답·오류를 무시한 뒤 동일 테스트 GREEN 1개 exit 0. 공개 취소 화면은 이후 링크 만료를 계속 확인한다.
- 추가 마감/확정 취소·응답 유실 재시도·외부 Origin 검증은 기존 구현에 대한 사후 회귀다.

## 2026-11-15 구현 후 전체 회귀

모든 npm 명령은 프로젝트 루트에서 `docker compose exec -T tools`를 앞에 붙여 Docker Node.js 24에서 실행했다. DB 통합·브라우저, 브라우저·타입/빌드는 순차 실행했다.

| 검증 | 명령·확인 방법 | 실제 결과 |
| --- | --- | --- |
| 전체 단위 | `npm run test` | 10개 파일·23개 통과, exit 0 |
| 전체 실제 PostgreSQL | `npm run test:integration` | 9개 파일·90개 통과, exit 0. 009 6개 포함 |
| 전체 Chromium | `npm run test:browser` | 전체 실행 종료 후 Playwright `test-results/.last-run.json`의 status=passed, failedTests=[] 확인. `--list`로 9개 파일·72개 대상 확인(009 8개). 터미널 최종 출력은 대화 요약으로 유실되어 프로세스 종료와 결과 파일로 판정했다 |
| 린트 | `npm run lint` | exit 0 |
| 타입 | `npm run typecheck` | exit 0 |
| 운영 빌드 | 개발 서버 중지 후 `npm run build` | exit 0 |
| 개발 화면 복구 | 개발 서버 재시작 후 localhost:3001 조회 | HTTP 200 |
| 화면 | cancellation-320/393/1280.png 직접 검수 | 확인 창·버튼·문구 배치 확인, 가로 넘침 없음. 전체 페이지 캡처의 배경은 스크롤된 viewport 기준이며 실제 기기 Safari 검증은 아님 |

- 신규 DB 6개: 권한·소속·만료, 4개 상태 취소와 모든 기록 보존, 세션 갱신 실패의 원자 롤백, 오류 우선순위, 기존 읽기/변경 경계 차단, 독립 연결의 중복 취소·시간 제출 경쟁.
- 신규 브라우저 8개: 취소 HTTP 409/최소 조회, 모집 중 확인·실패·중복 방지와 열린 화면, 초안 취소·3개 너비, 늦은 초안 조회 차단, 마감/확정 상태별 취소, 성공 응답 유실 재시도, Origin 거절.
- 008 취소 트랜잭션과 기존 접근 차단 재사용의 추가 검증은 사후 회귀이며 신규 RED 이력으로 주장하지 않는다. 009는 스키마·마이그레이션·의존성을 추가하지 않았다.
- 실제 iPhone Safari·운영 Neon/Vercel·다중 사용자 부하는 미검증이다. 이전 기능에서 관찰한 간헐 로그의 해결을 주장하지 않는다.

## 2026-11-15 정식 검토

- [검토 기록](../fixes/009-cancellation-review.md). 제품 코드는 변경하지 않았다.
- R1: 참여자 관리에서 명시적 취소 완료 후 링크를 만료시키면 공개 API는 expired이지만 열린 화면에는 취소 안내가 남았다. 임시 브라우저 재현 1개 exit 1(만료 heading 없음, 7초 timeout). GREEN은 아직 없다.
- `docker compose exec -T tools npm run test:integration -- src/lib/cancellation/cancellation.integration.test.ts`: 기존 6개 통과, exit 0.
- 임시 재현 파일은 격리 DB 정리 후 제거했고, 재현 절차·원인·기대값은 검토 기록에 보존했다. 후속 구현에서 영구 회귀 테스트를 추가해야 한다. 기존 전체 회귀 통과 이력은 R1을 검증한 것으로 소급하지 않는다.
- `docker compose exec -T tools npm run test:browser -- e2e/cancellation.spec.ts`: 기존 009 브라우저 8개 통과, exit 0. 이번 검토에서는 전체 회귀·린트·타입·빌드를 다시 실행하지 않았다.

## 2026-11-15 R1 보완 시작

- 기준: main `b5a2d8a`, 기존 009 구현·검토 문서 및 사용자 `.vscode/` 보존. AC-4 링크 만료 우선순위와 검토 R1을 대상으로 한다.
- 영구 브라우저 회귀를 먼저 추가해 실제 RED 확인 후 수정한다. 서버·DB 스키마 변경은 계획하지 않는다.
- 영구 회귀 RED: `docker compose exec -T tools npm run test:browser -- e2e/cancellation.spec.ts -g "취소 완료 화면도"`, exit 1. 늦은 참여자 상세 응답 차단은 통과했지만 만료 heading이 7초 안에 나타나지 않아 실패했다.
- 최소 수정: 참여자 관리의 명시적 취소 완료 분기에서 기존 `LiveInvitation`을 cancelled 상태로 재사용한다. 상세 polling 중지·늦은 응답 무시는 유지하고, 공개 최소 상태 조회의 5초 polling·탭 복귀 갱신으로 만료를 감지한다.
- 병행한 전체 단위 `npm run test` 23개·`npm run lint`는 각각 exit 0. 브라우저 종료 후 타입·빌드를 순서대로 검증한다. 이번 보완은 클라이언트 연결만 변경하므로 DB 통합 재실행은 하지 않는다.
- GREEN·관련 회귀: `docker compose exec -T tools npm run test:browser -- e2e/cancellation.spec.ts e2e/participant-management.spec.ts`, 14개 통과, exit 0(009 9개 + 008 5개). R1 만료 전환·늦은 상세 응답 차단, 기존 초안 취소·응답 유실 재시도·참여자 관리가 포함된다.
- 브라우저 종료 후 `npm run typecheck` exit 0, 개발 서버 중지 후 `npm run build` exit 0. 전체 브라우저·DB 통합은 이번 보완에서 재실행하지 않았다. 외부 운영·실제 iPhone Safari는 미검증으로 유지한다.
- 개발 서버를 다시 실행하고 localhost:3001 HTTP 200을 확인했다. 문서 링크·`git diff --check`도 통과했다.

## 2026-11-15 최종 테스트

- 기준: main `b5a2d8a`의 009 미커밋 구현 및 R1 보완. 기존 AC·RED/GREEN·사후 회귀 구분을 확인했다. 검증 단계이며 새 제품 코드 변경 없이 수행한다.
- 모든 npm 명령은 `docker compose exec -T tools`로 실행한다. 실제 DB와 브라우저는 순차 실행하고 브라우저 완료 후 타입·빌드를 진행한다.
- `npm run test`: 단위 10개 파일·23개 통과, exit 0.
- `npm run lint`: exit 0.
- `npm run test:integration`: 실제 격리 PostgreSQL 9개 파일·90개 통과, exit 0. 테스트 DB의 기존 5개 마이그레이션 적용 상태 확인. 009 6개 포함, DB 대역 아님.
- 런타임 `node --version`: v24.22.3. 이번 실행의 cancellation-320/393/1280.png를 직접 확인해 확인 창·버튼·문구 배치와 가로 넘침 없음을 검수했다. 전체 페이지 캡처의 backdrop은 스크롤된 viewport 기준이다.
- 관찰 로그: confirmation의 후보 페이지 전환 중 기존 `The destination stream errored while writing data` 로그가 한 번 발생했지만 해당 테스트는 통과했다. 해결됐다고 주장하지 않는다. 외부 Origin 불일치 로그는 보안 거절 시나리오의 의도된 결과다.
- `npm run test:browser`: 전체 Chromium 73개 통과, exit 0(3.9분). 009 9개 및 R1 영구 회귀를 포함한다.
- participant-access 출처 재전송 테스트의 `unexpected response` 로그는 요청 캡처를 위해 명시적으로 HTTP 400 `blocked for origin replay`를 응답하는 코드와 연결된다. 해당 테스트와 전체 실행은 통과했다.
- 브라우저 종료 후 `npm run typecheck` exit 0, 개발 서버 중지 후 `npm run build` exit 0.
- AC-1~6과 실제 RED/GREEN·기존 동작의 사후 회귀 근거를 대조했다. R1은 최종 전체 회귀에서도 통과했고 새 미충족 항목은 발견하지 못했다. 제품 코드 추가 수정 없이 검증을 완료했다.
- 실제 iPhone Safari·운영 Neon/Vercel·다중 사용자 부하는 미검증이다. 커밋·푸시·Notion·배포·기능 완료 처리는 수행하지 않았다.
- 개발 서버 재시작 후 localhost:3001 HTTP 200. 최종 문서 링크와 `git diff --check` 통과.

## 2026-11-15 완료 기록

사용자 완료 요청에 따라 AC-1~6, 동작별 RED/GREEN과 사후 회귀 구분, R1 해소, 최종 단위 23개·DB 90개·Chromium 73개·린트·타입·빌드 exit 0 근거를 확인하고 완료했다. 이번 단계는 문서 정리이며 검증을 다시 실행한 것으로 기록하지 않는다. 미검증 운영 환경과 기존 관찰 로그는 위 기록대로 남긴다.
