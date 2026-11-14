# 설정 변경과 재조율

## 식별자와 상태

- 스펙 ID: 007-rescheduling
- 상태: 완료 — 2026-11-15 사용자 요청
- 작성 기준: 2026-11-05 초안, 2026-11-15 사용자 불러오기 요청과 OPEN-03·12 결정 반영. 같은 날 구현 시작 및 실행 근거 반영.
- 요구사항: REQ-020~021, REQ-027, REQ-034. 흐름: FLOW-012. 식별자는 [분해 계획](../spec-plan.md)의 분석용 ID다.

## 근거 자료

- DOC-001 §4 STATE-01-02·STATE-09-01; DOC-002 §6.3·8.2·11.
- DOC-001: [PRD](../inputs/prd.md), 버전 미상. DOC-002: [ERD](../inputs/ERD.md), 문서상 작성일 2026-09-23. DOC-003: [Figma 참고 이미지](../inputs/피그마.png), 버전 미상.
- PRD·ERD 전체와 제공 이미지 확인. Figma 링크·node ID·원본 컴포넌트 속성은 미제공이며 MCP 조회는 수행하지 않았다. 별도 비즈니스 규칙·API 문서는 사용자에게 존재하지만 미제공·미확인이다.
- 충돌은 2026-11-05 사용자 결정에 따라 ERD를 우선한다. ERD에 없는 비충돌 PRD 규칙은 유지한다. 제안·미정은 원본 요구사항과 구분한다.
- 디자인 확인 범위: 설정 변경·재제출 안내 화면 미제공. 002 설정 폼과 DOC-003 달력을 재사용하는 제안.

## 사용자와 문제

방장이 모집 조건을 바꾸거나 확정 이후 다시 응답을 받아 약속을 재조율한다.

## 목표와 범위

collecting 재설정, closed·confirmed 재조율, 범위별 슬롯·제출 상태·버전 처리. 이전 확정·후보 이력 보존과 취소 약속 복원은 제외한다.

## 선행 작업

- [006-confirmation](006-confirmation-spec.md)

006까지의 상태·확정 필드와 004의 응답 버전이 있어야 재조율 결과를 검증할 수 있다.

## 사용자 흐름

방장 설정 변경 또는 재조율 → 변경 내용과 재제출 영향 안내 → 설정 검증 → 원자적 갱신 → collecting 화면. 범위 확대·이동 시 참여자에게 재제출 필요를 안내하고 다른 열린 화면은 폴링으로 동기화한다.

## 수용 기준

- [x] AC-1: collecting·마감 전 방장의 재설정은 collecting을 유지한다. closed·confirmed의 재조율은 새 미래 마감을 검증하고 collecting으로 전환한다. cancelled·일반 참여자 요청은 거절한다.
- [x] AC-2: confirmed 재조율 시 confirmed_start_at을 NULL로 지우고 모든 관련 변경을 함께 커밋한다. 이전 확정·후보 이력은 별도 저장하지 않는다.
- [x] AC-3: 범위가 줄기만 하면 active 참여자의 범위 밖 슬롯만 삭제하고 제출 상태는 유지한다. 실제 삭제가 발생한 active 참여자의 availability_version만 1 증가시킨다. 탈퇴자의 기록은 변경하지 않는다.
- [x] AC-4: 새 선택 가능 슬롯이 하나라도 생기는 확대·이동이면 active 참여자의 범위 밖 슬롯을 제거하고 모든 active 참여자의 제출 시각을 NULL, 버전을 +1로 변경한다. 이미 미제출인 참여자도 증가한다.
- [x] AC-5: 범위가 같고 소요 시간만 바뀌면 슬롯·제출 상태·버전을 유지하며 후보만 다시 계산한다. confirmed 상태의 직접 소요 시간 변경은 허용하지 않는다.
- [x] AC-6: 정원 2~30 및 active 인원 이상, 날짜·시간·소요·마감 검증을 002와 공유한다. 동시 설정 요청은 약속 잠금 획득 순서대로 최신 상태에 적용하고 전용 설정 버전 컬럼은 만들지 않는다.
- [x] AC-7: 변경 후 열린 다른 기기에서 settings·본인 버전을 비교해 최신 입력과 재제출 안내를 표시한다. 처리 실패 시 변경 이전 데이터가 남고 재시도가 가능하다.

각 AC의 근거와 확인 방법은 아래 TDD 적용 계획에 대응한다. OPEN 항목이 포함된 AC는 해당 결정 전 완료 처리하지 않는다.

## 데이터와 인터페이스

Server Action `changePromiseSettings(inviteToken, expectedParticipantId, mode, settings, confirmedImpact, confirmedClear)`로 reset/reopen을 구분한다. `/p/[inviteToken]/settings/edit`에서 기존 002 폼을 재사용하고 영향 확인 후 실행한다. 002 설정 검증과 004 버전·슬롯 저장 규칙을 사용한다. 축소 판정은 전체 허용 슬롯 집합의 포함관계로 하고 날짜 문자열만 비교하지 않는다. 범위 변경은 현재 active 참여자의 응답에만 적용한다. 탈퇴자의 슬롯·제출 상태·버전은 보존하며 화면·인원·후보·확정 참석자 집계에서는 제외한다(OPEN-12 확정).

공통 잠금·서버 시각·오류 계약·DB 테스트 기준은 [분해 계획](../spec-plan.md)의 공통 구현·검증 계약을 따른다. 참여자 인증이 필요한 경계에서는 서버가 약속 소속·세션·현재 역할·상태를 검사한다. 공개 링크 안내와 외부 챗봇은 각 경계의 공개 범위·호출 검증을 적용한다. 다른 참여자의 민감 정보를 오류에 포함하지 않는다.

## 구현 계획

범위 차이 계산 순수 함수 → 상태별 트랜잭션 → 제출·설정 경쟁 → 폼 영향 안내·폴링 순서. 구현 경로는 apps/web/src/lib/rescheduling/, src/actions/rescheduling.ts, src/components/promise-settings/. 상태 전환 거절과 마감 갱신이 충돌하지 않도록 공통 서비스 경계를 사용한다.

한 동작의 실패 assertion을 실제 확인한 뒤 최소 구현·회귀 검증을 반복한다. 테스트 도구 오류나 DB 연결 실패는 RED로 인정하지 않는다.

## 검증 계획

- AC별 검증 경계·원본 근거는 아래 표를 따른다. 실제 실행은 [007 TDD 기록](../tdd/007-rescheduling.md)에 남겼다.
- 단위 테스트 명령: 프로젝트 루트에서 docker compose exec tools npm run test -- src/lib/rescheduling/rescheduling.test.ts.
- DB 통합 명령: docker compose exec tools npm run test:integration -- src/lib/rescheduling/rescheduling.integration.test.ts. 001에서 도입하고 006까지 사용한 격리 PostgreSQL 통합 테스트 구성을 재사용한다. DB 검증 항목이 없는 AC에 억지로 통합 테스트를 만들지 않는다.
- DB 변경이 있으면 전용 테스트 DB 보호 확인 → 로컬 마이그레이션 작성 → Client 생성 → 빈 테스트 DB에 기존 마이그레이션 적용 → 실제 제약·트랜잭션 검증 순서로 진행한다. 운영 적용은 별도 배포 요청 시 db:deploy로만 한다.
- 격리: TEST_DATABASE_URL과 테스트 DB 이름·로컬 호스트 허용 목록을 검사하고 개발·운영 URL을 거절한다. 동시성은 독립 연결과 동시 시작 장벽을 사용한다. 상세 구성은 분해 계획에 정의한다.
- 브라우저 동작·오류 복구·모바일을 실제 확인한다. 이미지가 있는 요소는 원본 1280×3042 참고 시트를 사용한다. 제품 화면 검수 크기는 사용자 기준 393×852·320px·1280×800을 사용하며 디자인 원본 크기로 주장하지 않는다.
- 최종 검증: 관련 단위·DB·브라우저 회귀, Docker Node.js 24의 npm run lint, npm run typecheck, npm run build. 필요한 검증을 실행하지 못하면 미검증으로 남긴다.

## 미정 사항

현재 구현을 막는 미정 정책은 없다. 002에서 확정한 OPEN-05·06의 날짜·마감 검증을 공유한다. OPEN-03은 기존 세션 유지기간 변경 없음, OPEN-12는 탈퇴자 기록 보존으로 확정했다. 과거 저장 슬롯의 일반 재제출 보존과 범위 축소 삭제는 서로 다른 작업으로 구분한다.

OPEN 항목의 제안은 [분해 계획](../spec-plan.md)에 있으며 사용자 확정 전 제품 규칙으로 고정하지 않는다.

## 결과

방장 재설정·재조율, 범위별 active 응답 처리, 세션·탈퇴자 기록 보존, 영향 확인 폼과 다른 화면 동기화를 구현했다. R1(오래된 영향 안내)을 보완하고 정식 재검토를 통과했다. [검토 기록](../fixes/007-rescheduling-review.md).

최종 Docker Node.js 24 검증: 단위 23개·실제 DB 74개(007 11개)·Chromium 59개(007 7개)·린트·타입 검사·운영 빌드 모두 종료 0. 320·393·1280px 캡처와 반응형 동작을 확인했다. 실제 iPhone Safari·운영 배포는 미검증이며 스키마 변경·커밋·푸시·외부 기록 갱신은 수행하지 않았다. 2026-11-15 사용자 요청으로 완료 처리했다. 후속 초대 봉투 변경은 사용자 요청으로 원복했으며 이번 완료 범위에 포함하지 않는다.

## TDD 적용 계획

| AC | TDD 구분·이유 | 공개 경계·수준 | 기대값의 원본 근거 | 테스트 파일 또는 확인 방법 |
| --- | --- | --- | --- | --- |
| AC-1 | 필수 | 단위·실제 DB | DOC-002 §6.3·8.2 | src/lib/rescheduling/rescheduling.test.ts / src/lib/rescheduling/rescheduling.integration.test.ts |
| AC-2 | 필수 | 실제 DB | DOC-002 §6.3 | src/lib/rescheduling/rescheduling.test.ts / src/lib/rescheduling/rescheduling.integration.test.ts |
| AC-3 | 필수 | 집합 단위·실제 DB | DOC-002 §6.3·8.2·11 | src/lib/rescheduling/rescheduling.test.ts / src/lib/rescheduling/rescheduling.integration.test.ts |
| AC-4 | 필수 | 집합 단위·실제 DB | DOC-002 §6.3·8.2·11 | src/lib/rescheduling/rescheduling.test.ts / src/lib/rescheduling/rescheduling.integration.test.ts |
| AC-5 | 필수 | 단위·실제 DB | DOC-002 §6.3·11 | src/lib/rescheduling/rescheduling.test.ts / src/lib/rescheduling/rescheduling.integration.test.ts |
| AC-6 | 필수 | 실제 DB 동시성 | DOC-002 §6.3·8.2 | src/lib/rescheduling/rescheduling.test.ts / src/lib/rescheduling/rescheduling.integration.test.ts |
| AC-7 | 필수 | 실제 DB·브라우저 | DOC-002 §8.2 | src/lib/rescheduling/rescheduling.test.ts / src/lib/rescheduling/rescheduling.integration.test.ts / 해당 기능 브라우저 시나리오 |

- 실제 실행 기록: [007-rescheduling.md](../tdd/007-rescheduling.md). RED·GREEN·사후 검증·시각 검수를 구분한다.
- 공개 경계는 데이터 읽기·변경 서비스와 사용자 조작이다. 구현 내부 구조를 복제하는 테스트를 만들지 않는다.
- 기존 Playwright와 `npm run test:browser`를 재사용하며 `e2e/rescheduling.spec.ts`에 설정 변경·재조율·다른 열린 화면 동기화·오류 복구 흐름을 검증한다. 색상·간격은 별도 시각 검수한다.


## 2026-11-15 불러오기와 확정 정책

- 선행 006은 정식 검토·최종 회귀 후 완료됐다. 불러오기 당시 006 변경은 미커밋 상태였고, 후속 사용자 요청으로 `2b67c09`에 커밋·푸시했다. 007 불러오기·정책 문서 변경은 해당 커밋에서 제외하고 작업 폴더에 보존했다.
- OPEN-03 확정: 모집 중 마감 변경·재조율로 기존 세션 만료 시각을 연장하거나 단축하지 않는다. 이미 만료된 세션은 되살리지 않는다. 만료된 사용자는 다시 로그인하고, 재로그인 성공 시점부터 7일이라는 기존 정책을 따른다. 링크 자체 만료는 언제나 우선한다.
- OPEN-12 확정: 범위 변경에 따른 슬롯 삭제·제출 초기화·버전 갱신은 active 참여자에게만 적용한다. 탈퇴자 기록은 DB에 보존하되 화면과 모든 현재 집계에서 제외한다. 재참여·응답 복원 기능을 추가하지 않는다.
- OPEN-03 검증: 재설정/재조율 전후 유효·만료 세션의 만료 시각이 그대로인지 실제 DB에서 확인한다. OPEN-12 검증: 축소·확대 시 active 응답의 변화와 탈퇴자 슬롯·제출 시각·버전 보존을 대조한다.
- 정원 2~30·현재 인원 이상, KST 오늘 포함 이후 시작, 종료 달력 3개월 이내·양끝 포함 90일, 미래 마감과 소요 시간 전체가 들어가는 시작점 잔여 조건은 기존 확정 정책을 따른다.
- 불러오기 당시에는 문서만 갱신했다. 후속 `$feature 시작`에서 제품 구현과 실제 테스트를 수행하고 TDD 기록을 생성했다.


## R1 보완 계약

확인 창에서 안내한 범위 영향(same/shrink/expand)과 확정 해제 여부를 저장 요청에 포함한다. 서버는 공통 약속 잠금 안에서 최신 설정·상태와 비교한다. 안내 내용과 실제 영향이 다르면 `IMPACT_CHANGED`와 최신 영향을 반환하고 응답·설정·확정을 변경하지 않는다. 화면은 사용자 입력을 유지하면서 최신 안내로 바꾸고, 다시 확인하면 저장한다. 확인 창 이후 다른 요청이 발생해도 저장마다 같은 검사를 수행한다. 같은 영향으로 확인된 요청은 기존 AC-6대로 최신 상태에 순서대로 적용하며 전용 설정 버전 컬럼은 만들지 않는다. 기존 자동 마감 상태 반영은 유지한다.
