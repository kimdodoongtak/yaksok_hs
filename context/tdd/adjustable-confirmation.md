# 시작·종료 조절 검증

2026-11-25. [스펙](../features/adjustable-confirmation-spec.md). 로컬 연결·검증 완료.

기존 확정은 시작만 저장하고 설정 소요 시간으로 종료를 계산한다. 최소 길이를 보존하면서 더 긴 약속을 확정하려면 실제 종료 별도 저장이 필요하다. 기존 데이터·사용자 로컬 변경을 보존한다. DB 테스트는 가드가 있는 sdd_test에서만 실행하며 브라우저와 순차 실행한다.

## 중간 검증과 범위 변경

- DB RED: 기존 종료가 90분 요청에도 60분으로 계산되는 실패 확인. 추가 검증에서 종료 입력 무시·같은 시작/다른 종료 동시 성공·재조율 종료 미해제가 실패했다. 기존 명단 순서 검사 1개는 fixture 생성 시각이 같아 ID 정렬로 순서가 달라지는 문제였으며 명시적 생성 시각을 줬다.
- 저장 구현 후 격리 DB 전체 98/98 통과. 업다운 UI RED는 `선택한 시작 시간`이 없어 실패했다. 린트 통과.
- 관련 브라우저는 36/39 통과. 후보/확정/재조율은 통과했으며 설정 3개 실패: 기존 소요→최소 요약 문구 기대 2개, 설명 추가로 393×700에서 다음 버튼 하단 721px가 된 배치 1개. 사용자가 UI만 먼저 보겠다고 범위를 좁혀 추가 저장 개발·전체 검증 완료 처리를 보류했다. 타입/빌드 최종 검증 전이며 완료로 기록하지 않는다.
- 로컬 migration `20261124180219_confirmed_end_time` 적용 상태, 운영 미적용. 사용자는 DB 추가 사실을 설명받았으며 현재 추가 진행은 UI 미리보기로 한정한다.

## 실제 저장 연결 재개 — 2026-11-25

사용자가 업다운 시안을 확인하고 ‘연결 해’로 실제 저장 연결을 승인했다. 기존 마이그레이션과 저장 구현을 이어서 검토했다. 새로운 DB 변경은 추가하지 않았다.

- 실제 RED 로그: `/tmp/yaksok-adjust-db-red.log`(기존 종료 60분으로 회귀), `/tmp/yaksok-adjust-boundaries-red.log`(종료 경계/동시 확정/재조율), `/tmp/yaksok-adjust-ui-red.log`(업다운 UI 없음). 이전 실행을 소급하지 않고 당시 결과를 유지한다.
- 설정 브라우저의 문구 기대 2개는 승인된 ‘최소’로 맞췄다. 짧은 화면 배치 실패는 도움말과 카드 여백을 줄여 입력칸 크기·버튼 크기를 유지하면서 해결했다. 기존 393×700 검사를 그대로 통과시켰다.
- `docker compose exec tools npm run test:browser -- confirmation.spec.ts promise-settings.spec.ts rescheduling.spec.ts`: 26/26, 종료 0. 실제 시작/종료 DB 값, 새로고침 뒤 실제 길이, 재조율, 변경 실패 재시도, pending 중 중복 방지, 44px 조절 버튼·반경 12px 가장자리 탭·버튼에서 시작한 스크롤 확인. 이전 동일 후보 코드 브라우저 13개와 합쳐 관련 39개 수용 기준을 확인했다.
- `docker compose exec tools npm run test:integration -- src/lib/confirmation/confirmation.integration.test.ts src/lib/rescheduling/rescheduling.integration.test.ts`: 22/22, 종료 0. 기존 전체 DB 98/98 이후 fixture의 생성 시각을 고정한 변경까지 재확인했다.
- `docker compose exec tools npm test`: 60/60, 종료 0. `npm run lint`, `npm run typecheck`, `git diff --check`: 종료 0.
- 320·393·1280px 조절 창 및 393×700px 설정 캡처 확인. 실제 휴대전화/Safari는 미검증.

## 완료

- `docker compose exec -e INVITATION_BROWSER_TEST=1 tools npm run build`: 종료 0. 빌드 전에 개발 서버를 중지하고 완료 후 재시작해 이전 HMR 반복 갱신을 피했다.
- 실제 5인 데모 후보에서 로그인 후 09~13 기본값, 09:30~13 조절·실제 확정 버튼 노출을 확인했다. 8초간 선택 유지·HMR restart 0회. 사용자가 시험할 데모는 확정하지 않고 창을 닫았다. 실제 DB 저장은 격리 E2E에서 검증했다.
- 관련 브라우저 39개 수용 기준, 단위 60/60, 전체 DB 98/98 후 관련 22/22 재확인, 린트·타입·빌드·diff 통과. 실제 Safari/휴대전화는 미검증. 로컬만 반영, 커밋·푸시·운영 DB 변경·배포 없음.


## 전체 검토와 배포 호환 보완 — 2026-11-25

사용자의 전체 테스트·검토·커밋·푸시·배포 요청으로 운영 적용을 승인받았다. 아래 로컬 보류는 과거 이력이다.

- 전체 Docker Node.js 24 단위 60/60, DB 98/98, Chromium 130/130(4.3분), 린트·타입·Prisma 스키마·운영 빌드·diff 검사 종료 0. 새 호환 수정 뒤 전체 DB는 99/99, 최종 린트·빌드도 종료 0.
- 운영 복사 Neon 브랜치 `br-sweet-unit-aza5ntiw`에서 첫 마이그레이션 적용 후 약속 15건과 기존 확정 2건의 시작+기존 길이 보존을 확인했다. 구버전 재조율 SQL은 `23514 / ck_promise_confirmed_end`로 실패했다. 운영은 이 재현에 사용하지 않았다.
- 실제 RED: `npm run test:integration -- src/lib/rescheduling/rescheduling.integration.test.ts -t '이전 앱이'` 종료 1, 새 회귀 1개 실패. `/tmp/yaksok-release-compat-red.log`.
- 최소 수정: 기존 적용 이력을 고치지 않고 `20261125033000_confirmed_end_reopen_compat` 후속 SQL 마이그레이션을 추가했다. 시작이 값→NULL로 해제될 때만 종료도 NULL로 만드는 BEFORE UPDATE 트리거다. 새 확정·취소는 영향을 받지 않으며 종료 제약도 유지한다.
- GREEN: 전체 DB 99/99 종료 0(`/tmp/yaksok-release-db-green.log`). 이전 앱 재조율·재확정, 기존 선택 보존, 새 앱 최소 길이 제약을 검사했다. 복사 브랜치에서도 같은 구버전 SQL이 통과했고 시험 변경은 ROLLBACK했다.
- 320px 조절 창·1280px 후보 명단·393px 히트맵 네 단계/설정 화면을 캡처로 확인했다. 넓은 접촉 반경의 가장자리 탭과 버튼/후보에서 시작하는 터치 스크롤은 Chromium E2E로 확인했다. 실기기 휴대전화·Safari는 미검증이다.
- `npm audit`은 기존과 같은 11개(보통 8·높음 3), 종료 1. 높은 항목은 Prisma 개발 도구의 effect 의존 경로이며 자동 수정은 Prisma 6으로 주 버전을 바꾸므로 이번 릴리스에 섞지 않았다. 경고를 해결 완료로 보지 않는다.

| 수용 기준 | 충족 여부 | 근거 | 남은 작업 |
| --- | --- | --- | --- |
| 동일 명단 연속 후보·묶음 페이지 | 충족 | 단위/DB 범위·간격·날짜·인원/명단 검사 | 없음 |
| 후보 명단과 최신 응답 반영 | 충족 | 명단 터치/폴링/소멸 브라우저 검사 | 없음 |
| 최소 길이와 실제 시작·종료 확정 | 충족 | DB 저장/동시성·권한·경계 및 새로고침 결과 | 없음 |
| 재조율 및 이전 앱 호환 | 충족 | RED→GREEN, DB 99개 및 Neon 복사본 검사 | 없음 |
| 모바일 크기·터치·스크롤 | 에뮬레이션 충족 | 전체 Chromium 130개와 화면 캡처 | 실기기/Safari |
| 색상 단계·최소 소요 시간 문구 | 충족 | 범례/설정 캡처와 기존 회귀 | 없음 |

로그: `/tmp/yaksok-release-{unit,db-green,browser,lint-final,types,schema,build}.log`.

- 마지막 호환 변경 뒤 `npm run test:browser -- confirmation.spec.ts rescheduling.spec.ts`: 15/15, 종료 0(32.7초). 전체 130개 실행 뒤 DB 호환 변경 영향 범위만 재검증했다.
- 운영 `npm run db:deploy`와 `npm run db:status`: 종료 0. 두 마이그레이션 적용, 약속 15건·기존 확정 2건과 기존 확정 시작/길이 보존을 읽기 조회로 확인했다. 운영 데이터로 제품 테스트나 시드를 실행하지 않았다.
- 로컬 개발 서버는 빌드 후 재시작했고 30인 데모는 확정하지 않고 유지한다. main 커밋·푸시 및 Vercel READY 확인은 배포 단계에서 수행한다.
