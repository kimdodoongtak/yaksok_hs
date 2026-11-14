# TDD 실행 기록: 003-participant-access

- 스펙: [003](../features/003-participant-access-spec.md)
- 기준점: main / 69cc9d365a3d214b274fc6195afa58afec90ea7d. 기존 정책 문서 6개 변경과 사용자 `.vscode/` 보존.
- 상태: 2026-11-14 정식 검토 R1 보완 및 최종 회귀 통과. 사용자 완료 요청을 반영해 현재 기능은 완료다. 아래 기록은 단계별 실행 이력이다.
- 필수: 스펙 AC-1~9의 서비스·실제 PostgreSQL·브라우저 경계. 정적 스타일은 비대상이며 시각 검수한다.
- DB: 허용된 로컬 sdd_test만 기존 실행기로 검증한다. 개발 DB 초기화·운영 변경 없음.

## 기술 설계

- 기존 닉네임 정규화·scrypt·쿠키를 재사용한다. 신규 참여는 마감+7일, 재인증은 성공+7일이며 링크 만료가 우선이다.
- 약속 행 잠금 이후 현재 서버 시각·정원·상태를 확인한다. 세션과 참여자 생성은 한 트랜잭션이다.
- PIN 제한은 보안용 공유 테이블에 정규화 닉네임별 실패와 IP 요청 예산을 저장한다. 별도 외부 인프라는 추가하지 않는다. IP 요청 예산은 기술 방어값이며 사용자 확정 5회/10분과 구분한다.
- PIN 변경은 인증된 본인 + 현재 PIN 검증, 기존 모든 기기의 세션 폐기 후 재로그인으로 연결한다.

## 반복 기록

실제 실행 명령의 공통 접두사는 `docker compose exec tools`다. 결과가 없는 단계는 미검증이다.

| 동작 | RED | GREEN·회귀 |
| --- | --- | --- |

## 최종 검증

| 검증 | 실제 명령·행동 | 결과 |
| --- | --- | --- |
| 전체 단위 | `docker compose exec tools npm run test` | 14개 통과, 종료 0 |
| 전체 실제 DB | `docker compose exec tools npm run test:integration` | 36개 통과(003 14개), 종료 0 |
| 전체 브라우저 | `docker compose exec tools npm run test:browser` | Chromium 12개 통과(003 3개), 종료 0 |
| 린트 | `docker compose exec tools npm run lint` | 종료 0 |
| 타입 | `docker compose exec tools npm run typecheck` | 최종 종료 0. E2E 헤더 객체 TS7053을 Record 타입 선언으로 수정 후 재실행 |
| 빌드 | `docker compose exec tools npm run build` | 종료 0. 개발 서버 중지·브라우저 종료 후 순차 실행 |
| 시각 검수 | 참여 폼 320·393·1280, 본인 상태·PIN 변경 393 PNG | 가로 넘침 없음, 직접 이미지 확인 |

운영 배포·실제 iPhone Safari는 수행하지 않았다. 코드 변경 뒤 검증을 완료했으며 마지막 타입 수정은 테스트의 타입 표기만 변경했다. 개발 서버는 빌드 후 다시 실행했다.

## 2026-11-14 구현 중 실행 근거

DB 명령: `npm run test:integration -- src/lib/participant-access/participant-access.integration.test.ts`.

| 순서·AC | RED (모두 종료 1) | GREEN (같은 DB 명령, 종료 0) |
| --- | --- | --- |
| 1 / AC-1·2 등록 | 등록 성공 기대 true, 스텁 false | 1개 통과, 참여자·세션 동시 저장 |
| 2 / AC-1 마지막 자리 경쟁 | 성공 1명 기대, 실제 2명 | 2개 통과, 독립 연결·동시 해시 장벽 후 약속 행 잠금 |
| 3 / AC-1·2·4 상태 경계 | 취소 거절 기대, 실제 등록 성공 | 3개 통과. 중간 fixture의 withdrawn 오기는 ERD cancelled로 수정했으며 그 제약 오류는 RED로 세지 않음 |
| 4 / AC-3·6 재인증 | 성공 true 기대, 스텁 false | 4개 통과, 성공 시각+7일·독립 세션 |
| 5 / AC-5 공유 실패 제한 | 5회에서 PIN_LOCKED 기대, 실제 INVALID_CREDENTIALS | 5개 통과, 10분 직전/정각·성공 초기화·다른 연결 |
| 6 / AC-4 조회·로그아웃 | 본인 조회 성공 기대, 스텁 UNAVAILABLE | 6개 통과, 타 약속 차단·현재 세션만 삭제·취소/링크 만료 우선 |
| 7 / AC-9 PIN 변경 | 잘못된 현재 PIN의 INVALID_CREDENTIALS 기대, 스텁 UNAVAILABLE | 7개 통과, 실패 보존·기존 전체 세션 폐기·인증과 제한 공유 |
| 8 / AC-5 IP 예산 | 마지막 요청 예산 1개 기대, 2개 허용 | 8개 통과, 원자적 공유 제한·창 끝 초기화 |
| 9 / AC-6 출처/IP | 외부 Origin 허용 및 위조 전달 IP 신뢰로 단위 2개 실패 | `npm run test -- src/lib/participant-access/participant-access.test.ts` 2개 통과 |

- 로컬 `db:migrate -- --name participant_auth_attempts`, `db:generate` 종료 0. 마이그레이션 `20261114074409_participant_auth_attempts`를 전용 테스트 DB에도 적용했다.
- IP 기술 방어값: 모든 약속의 등록·로그인·PIN 변경 요청을 IP당 고정 10분 창에서 30회 허용(성공도 포함). 31번째부터 창 종료까지 거절하고 재시도로 창 연장 없음. 사용자 계정별 연속 실패 제한과 별개다.
- IP는 Vercel 환경에서만 `x-vercel-forwarded-for`를 신뢰하며 유효 IP 한 개를 정규화한다. 그 외/누락/이상값은 `unknown` 공유 예산으로 처리한다. 로컬의 임의 전달 헤더로 우회할 수 없다. [Vercel 공식 요청 헤더](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for) 확인, 실제 Vercel 배포는 미검증.


## 화면 연결·추가 회귀

- `npm run test:browser -- e2e/participant-access.spec.ts`: 최초 RED 종료 1, “함께 만날까요?” 화면 없음. UI 연결 후 잘못된 PIN 뒤 닉네임이 비워지는 동작을 브라우저에서 발견하고 제어 입력으로 수정했다. 닉네임 유지 assertion을 추가한 뒤 참여→로그아웃→재로그인→PIN 변경→새 PIN 로그인 GREEN 종료 0.
- 중간 브라우저의 alert 중복 선택은 Next 라우트 알림과 제품 알림을 구분하지 못한 테스트 문제였다. main 범위로 선택자를 좁혔으며 제품 RED로 세지 않는다.
- 이후 단독 브라우저 3개 통과: 위 흐름, 정원/마감·5회 차단/고정 재시도 시각·취소/만료 공개 범위, 외부 Origin/Origin 누락 요청 거절. 위조 요청 시 Next의 거절 오류 로그와 테스트가 차단한 요청의 브라우저 오류는 예상된 검증 결과다.
- 기존 동작의 사후 회귀 5개 추가: 동시 실패·없는 닉네임 동일 제한, 탈퇴/내보내기·현재 역할, 세션 INSERT 실패 시 신규 참여자 롤백, 세션 DELETE 실패 시 PIN 변경 롤백, 세션 만료 직전·링크 만료 정각. 모두 첫 실행 통과이며 별도 RED를 주장하지 않는다.
- 기존 방장 경계의 취소 우선순위 누락: RED 종료 1, `PROMISE_CANCELLED` 대신 `NOT_DRAFT`. 001 초안 나가기/방장 등록, 002 모집 시작의 취소 검사와 Action 안내를 보완한 뒤 전체 DB 36개 GREEN 종료 0.
- 기존 보안 회귀는 실제 scrypt 검증, 운영 Secure·HttpOnly·SameSite·약속별 쿠키 범위, 격리 DB 보호를 포함한다.
- 320·393·1280px 가로 넘침 없음. 393·320 참여 폼과 393 PIN 변경 화면을 PNG로 직접 검수했다. Figma 참고 이미지의 파란 강조색·옅은 선택 배경·입력 테두리를 따랐다. 실제 기기의 Safari는 미검증이다.


## AC와 검증 연결

| AC | 실제 근거 |
| --- | --- |
| 1·2 | 등록·정원 경쟁·마감/초안/취소·중복/탈퇴 닉네임 DB 테스트, 기존 닉네임 단위 회귀 |
| 3 | 재로그인 독립 세션·타 약속 세션 거절·현재 역할 DB 테스트, 실제 scrypt 브라우저 로그인 |
| 4 | 현재 기기 로그아웃·만료 직전/정각·취소/링크 만료 DB 테스트, 공개 GET·UI 회귀, 기존 방장 진입점 취소 우선 |
| 5 | 연속 5회·10분 직전/정각·성공 초기화·동시 실패·다중 연결·없는 이름·IP 예산 DB 및 브라우저 차단 안내 |
| 6 | 재로그인 7일 DB·운영 쿠키 단위 회귀·브라우저 쿠키/Origin 검증 |
| 7 | 비활성 참여자 세션·재로그인/PIN 변경 거절 DB, 찾기/복구 진입점 없음 |
| 8 | Chromium 003 3개와 320·393·1280 시각 검수. 정적 스타일은 TDD 비대상 |
| 9 | 현재 PIN 실패 보존·동일 실패 제한·전체 세션 폐기·강제 저장 실패 롤백 DB, 변경 후 새 PIN 브라우저 로그인 |

## 제한과 후속 작업

- 004 시간 선택·제출, 007 재조율 세션 정책, 008 실제 탈퇴/위임, 009 취소 실행은 후속 범위다. 003은 해당 상태의 접근 차단을 검증했다.
- 현재 PIN 변경 후 세션은 전부 삭제한다. 초기 등록/설정 완료 세션과 재로그인 세션의 만료 규칙을 구분했다.
- 보안 카운터는 로그인 성공 또는 IP 창 재시도 때 초기화한다. 만료된 전체 카운터의 정기 물리 정리는 아직 없다.
- 정식 `feature 검토`·`feature 테스트`·`feature 완료`, 커밋·푸시·Notion 기록·운영 배포는 이번에 수행하지 않았다.

## 2026-11-14 후속 수정 — 같은 PIN과 화면 문구

- 사용자 요청: 현재 PIN과 같은 PIN 변경 금지, 감성 문구 제거. [수정 기록](../fixes/003-same-pin-and-copy.md).
- RED: `docker compose exec tools npm run test:integration -- src/lib/participant-access/participant-access.integration.test.ts`, 종료 1. SAME_PIN 거절 기대, 실제 ok:true. 기존 세션 폐기까지 발생하던 동작을 재현했다.
- GREEN: 같은 명령 종료 0, 003 DB 15개 통과. 현재 PIN 검증 후 동일 PIN을 거절하고 PIN·두 기기 세션 보존, 잘못된 현재 PIN 우선 처리를 확인했다.
- 정적 문구 변경은 TDD 비대상. 기존 브라우저 시나리오의 제목을 수정하고 동일 PIN 안내→다른 PIN 변경 시나리오를 추가했다.

- 후속 검증: 003 브라우저 3개·린트·타입 검사 모두 종료 0. 393px 참여 화면 PNG에서 표어 제거와 일반 문구를 직접 확인했다. 이번 소규모 수정에서는 전체 회귀·운영 빌드는 반복하지 않았으며 위 전체 검증 표는 최초 구현 시점의 기록이다.


## 2026-11-14 참여자 화면 규격 통일

사용자 요청으로 약속 설정 화면의 규격을 참여·로그인 화면에 적용했다. 제목은 24→20px, 입력 높이와 주요 버튼 최소 높이는 48→46px, 입력 좌우 패딩은 12→10px로 조정했다. 공통 글꼴·색상·입력 글씨 16px·버튼 글씨 14px/600을 유지한다. 참여 화면 카드의 최대 너비는 576px, 모서리는 12px, 내부 여백은 480px 미만 16px·그 이상 20px로 설정 카드와 맞췄다. 설명·탭·폼 간격도 조정하고 중앙 배치는 유지했다. 공유 CSS를 사용하는 PIN 변경 입력·버튼에도 같은 규격이 적용된다.

정적 스타일 변경으로 TDD 비대상이다. 기존 브라우저 흐름에 로그인 모드의 320·393·1280px 캡처를 추가해 직접 확인했다. Docker Node.js 24에서 `npm run test:browser -- e2e/participant-access.spec.ts` 3개 통과, `npm run lint` 및 `npm run typecheck` 종료 0. 로그인·PIN 변경·접근 제한 회귀를 확인했다. DB·전체 회귀·운영 빌드는 스타일 변경 범위여서 반복하지 않았다.

## 2026-11-14 정식 검토

기존 003 실제 DB 테스트 15개를 재실행해 종료 0을 확인했다. 코드·기존 테스트 수정 없이 임시 Playwright 스크립트로 정원 open→full 전환을 검수했고, 로그인 폼은 보이지만 탭 aria-pressed=false인 R1을 재현했다. 재현 및 AC별 판단은 [검토 기록](../fixes/003-participant-access-review.md)에 있다. 신규 영구 회귀 테스트와 수정 전후 RED/GREEN은 후속 구현에서 수행한다. 전체 회귀·빌드를 이번 검토에서 새로 통과했다고 주장하지 않는다.

## 2026-11-14 검토 R1 보완 시작

기준 main / 69cc9d365a3d214b274fc6195afa58afec90ea7d. 기존 003 구현·002 화면 수정 및 사용자 `.vscode/`를 보존한다. AC-8의 공개 브라우저 상태를 대상으로, 열린 최초 참여 화면에서 정원이 차거나 응답 마감이 지나면 로그인 탭과 폼이 함께 전환되어 기존 참여자가 로그인할 수 있어야 한다. 상태 전환 오류이므로 TDD 대상으로 실제 RED 후 수정한다.

- RED: `docker compose exec tools npm run test:browser -- e2e/participant-access.spec.ts --grep '참여 화면을 열어 둔 사이'`, 종료 1. 정원 도달·응답 마감 2개 모두 로그인 폼 표시 후 `aria-pressed` 기대 true / 실제 false로 실패했다. 실제 DB 변경과 5초 상태 조회를 사용했고 새로고침·상태 응답 mock은 사용하지 않았다.
- 최소 수정: 등록 가능한 상태에서만 사용자의 탭 선택을 적용하고, 그 외 상태는 공통 activeMode=login을 탭·폼·폼 key에 적용했다.

- GREEN: `docker compose exec tools npm run test:browser -- e2e/participant-access.spec.ts`, 종료 0, 5개 통과(기존 3개 + 새 전환 2개). 정원 도달·마감 뒤 탭 선택과 실제 기존 방장 로그인 성공, 참여자 수 보존을 확인했다.
- Docker `npm run lint`, `npm run typecheck` 각각 종료 0. 393×852 정원 전환 PNG에서 선택 강조를 직접 확인했다.
- 상태 전환 기준만 통일하는 최소 수정으로 추가 리팩터링은 하지 않았다. DB·인증 서비스는 변경하지 않아 이전 검토의 DB 15개 결과를 근거로 유지하며 이번에는 재실행하지 않았다. 전체 회귀·빌드는 정식 테스트 단계에서 수행한다.
- 분해 계획 FLOW-006·OPEN-02/03/09/10의 이미 구현된 003 항목에 남아 있던 “구현 전” 문구도 동기화했다. 후속 007·008·009의 미구현 범위는 유지했다.


## 2026-11-14 정식 feature 테스트 — 최종 회귀

검토 R1 보완과 최근 002/003 UI 변경이 포함된 작업 트리에서 실행했다. Docker Node.js v24.22.3 기준이며 제품 코드 수정 없이 검증했다. 기존 동작별 RED/GREEN과 사후 회귀 구분을 재확인했다.

| 검증 | 명령 (루트에서 실행) | 결과 |
| --- | --- | --- |
| 전체 단위 | `docker compose exec tools npm run test` | 14개 통과, 종료 0 |
| 전체 실제 DB | `docker compose exec tools npm run test:integration` | 37개 통과(001 17·002 5·003 15), 종료 0 |
| 전체 브라우저 | `docker compose exec tools npm run test:browser` | Chromium 15개 통과(001 6·002 4·003 5), 종료 0 |
| 린트 | `docker compose exec tools npm run lint` | 종료 0 |
| 타입 검사 | `docker compose exec tools npm run typecheck` | 종료 0 |
| 운영 빌드 | `docker compose exec tools npm run build` | Prisma Client 생성·Next.js 빌드 성공, 종료 0 |
| 개발 서버 복구 | 개발 서버 재시작 후 호스트 `http://localhost:3001` 조회 | HTTP 200 |

- DB는 격리 sdd_test·비관리자 역할 보호를 통과했고 4개 마이그레이션 모두 적용된 상태였다. 개발 DB 초기화·운영 DB 변경 없음.
- 통합→브라우저→타입→빌드를 순차 실행했다. 빌드 전에 식별한 로컬 개발 서버만 SIGTERM으로 중지하고 성공 후 다시 시작했다. 컨테이너에 ps가 없어 /proc의 Next 실행 인자로 PID를 확인했다.
- 001/003의 외부 Origin 거절 로그와 003의 캡처용 차단 응답에 따른 브라우저 오류는 의도한 출처 방어 테스트 결과다. 모든 브라우저 assertion은 통과했다.
- 기존 320·393·1280px 가로 넘침 검증 및 화면 캡처를 재실행했다. 393×700 설정 주요 입력과 다음 버튼 표시 검증도 통과했다. 이번에는 마감 후 로그인 탭 선택 강조 PNG를 직접 추가 확인했으며 직전 참여·로그인·정원 전환 시각 검수와 연결한다.
- 수용 기준 AC-1~9의 로컬 구현·검증 근거가 갖춰졌고 R1의 정원 도달·응답 마감 재현 2개가 전체 회귀에 포함됐다. 새 제품 동작 누락이나 추가 실패는 발견하지 못했다.
- 실제 iPhone Safari·Vercel/Neon 배포는 미검증이다. 운영 헤더·HTTPS 쿠키 확인 및 만료 보안 카운터 정기 물리 정리는 기존 후속 항목으로 유지한다.
- 이번 요청은 테스트 단계다. 상태는 검토 중, 다음은 `$feature 완료`. 커밋·푸시·Notion 기록·배포는 수행하지 않았다.

## 2026-11-14 완료 확인

사용자 `$feature 완료` 요청으로 AC별 실제 RED/GREEN, 사후 회귀 구분, 정적 UI 대체 검수 및 위 최종 14/37/15개·린트·타입·빌드 통과 근거를 확인했다. 수용 기준 내 미해결 결함 없음. 상태와 기능 후보 목록을 완료로 동기화하고 기존 완료 이력을 보존한 채 003을 추가했다. 이번 단계는 문서 변경만 수행했으며 테스트를 재실행하지 않았다. 문서 링크·중복 이력·git diff --check를 확인했다. 실제 Safari·운영 배포 검증과 보안 카운터 정기 정리는 후속 항목이며 커밋·푸시·Notion 갱신은 수행하지 않았다.
