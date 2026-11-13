# 약속 설정과 모집 시작

## 식별자와 상태

- 스펙 ID: 002-promise-settings
- 상태: 확인 필요
- 작성 기준: 2026-11-05, 제품 구현·검증 전 초안.
- 요구사항: REQ-007~008, REQ-029. 흐름: FLOW-004. 식별자는 [분해 계획](../spec-plan.md)의 분석용 ID다.

## 근거 자료

- DOC-001 §4 STATE-03-01·TIME-01-01·TIME-05-02·TIME-06-02·TIME-13-02; DOC-002 §3.2·4.2·5·6.1~6.2·8.2·11.
- DOC-001: [PRD](../inputs/prd.md), 버전 미상. DOC-002: [ERD](../inputs/ERD.md), 문서상 작성일 2026-09-23. DOC-003: [Figma 참고 이미지](../inputs/피그마.png), 버전 미상.
- PRD·ERD 전체와 제공 이미지 확인. Figma 링크·node ID·원본 컴포넌트 속성은 미제공이며 MCP 조회는 수행하지 않았다. 별도 비즈니스 규칙·API 문서는 사용자에게 존재하지만 미제공·미확인이다.
- 충돌은 2026-11-05 사용자 결정에 따라 ERD를 우선한다. ERD에 없는 비충돌 PRD 규칙은 유지한다. 제안·미정은 원본 요구사항과 구분한다.
- 디자인 확인 범위: DOC-003의 DayCell·MonthCalendar를 날짜 선택 참고로 사용한다. 전체 설정 폼과 모바일 배치는 미제공.

## 사용자와 문제

방장이 정원·시간 범위·소요 시간·마감을 정하고 참여자에게 공유할 준비를 마친다.

## 목표와 범위

draft 설정 입력과 collecting 시작, 공유 링크 복사. collecting 이후 재설정·재조율은 007에서 구현한다.

## 선행 작업

- [001-invitation-and-host](001-invitation-and-host-spec.md)

001의 draft 약속, 방장 세션, 만료 검사와 마이그레이션이 필요하다.

## 사용자 흐름

방장 설정 화면 → 기본 하루 09:00~24:00·소요 120분 표시 → 필수값 입력 → 모집 시작 → collecting 표시와 초대 링크 복사. 잘못된 값은 입력 위치에 오류를 표시하고 수정 후 재시도한다. 만료·권한 변경 시 최신 상태로 이동한다.

## 수용 기준

- [ ] AC-1: 정원·날짜 범위·하루 시간 범위·소요 시간·응답 마감이 모두 유효할 때 방장만 draft를 collecting으로 변경한다. 누락·권한 없음·초안 또는 초대 링크 만료는 모집을 시작하지 않는다. 2026-11-13 사용자 결정에 따라 정상 설정 완료 시 기존 방장 세션을 응답 마감(voting_deadline_at) 후 7일까지 연장하고 DB 만료와 쿠키 만료를 일치시킨다. 모집 시작과 세션 갱신의 부분 저장이 없어야 한다.
- [ ] AC-2: 정원은 방장 포함 2~30명이며 현재 active 인원보다 작을 수 없다. 1·31명은 거절하고 2·30명은 허용한다.
- [ ] AC-3: 일일 시작은 0~1410분, 종료는 30~1440분이며 둘 다 30분 배수이고 시작<종료다. 종료 24:00은 1440으로 저장한다. 소요 시간은 30분 이상·30분 배수·일일 범위 이하다.
- [ ] AC-4: Asia/Seoul 기준 시작일≤종료일이고 양끝 포함 최대 90일이다. PRD의 오늘부터 3개월 종료 한계·시작일 허용 범위의 세부 적용은 OPEN-05 확정 후 경계 테스트로 고정한다.
- [ ] AC-5: 잠금 후 서버 시각보다 미래인 마감만 허용한다. 마감이 선택 첫날보다 반드시 앞설 필요는 없다. 마감 후 유효 시작점이 남아야 하는지 여부와 기본값은 OPEN-06에서 결정한다.
- [ ] AC-6: 정상 시작 시 만료되지 않은 기존 초대 링크로 collecting 진입이 가능하다. 링크 만료는 001의 확정 정책을 따라 방장·유효 세션도 차단하고 “만료된 약속입니다”만 표시한다. 설정 저장 경쟁에서는 최신 서버 상태를 확인하고 중복 시작이나 만료 draft의 모집 시작을 막는다.
- [ ] AC-7: 모바일에서 필수 입력·오류·모집 시작·링크 복사가 가능하다. 달력 선택·비활성·오늘 상태는 참고 이미지와 비교하고 미제공 화면 구성은 제안으로 검수한다.

각 AC의 근거와 확인 방법은 아래 TDD 적용 계획에 대응한다. OPEN 항목이 포함된 AC는 해당 결정 전 완료 처리하지 않는다.

## 데이터와 인터페이스

001의 promises 설정 필드를 사용한다. 저장할 필드: participant_limit, date_range_start/end, daily_start/end_minute, duration_minutes, voting_deadline_at, status. DB 제약은 ERD §4.2와 일치시킨다.

제안: Server Action startCollection({inviteToken,settings}), settings 날짜는 YYYY-MM-DD, 시간은 HH:mm(종료만 24:00), 마감은 시간대가 명시된 시점으로 받는다. 서버가 KST 경계로 검증·변환한다. 변경 권한은 세션의 약속·host 여부로 확인한다. 입력 실패는 구조화된 필드 오류로 반환하며 HTTP 경계가 있을 때의 422와 도메인 오류를 구분한다.

공통 잠금·서버 시각·오류 계약·DB 테스트 기준은 [분해 계획](../spec-plan.md)의 공통 구현·검증 계약을 따른다. 참여자 인증이 필요한 경계에서는 서버가 약속 소속·세션·현재 역할·상태를 검사한다. 공개 링크 안내와 외부 챗봇은 각 경계의 공개 범위·호출 검증을 적용한다. 다른 참여자의 민감 정보를 오류에 포함하지 않는다.

## 구현 계획

설정 검증 공개 함수 → 서버 변경·잠금 → 모집 폼·달력·링크 복사 순서로 구현한다. 예정 apps/web/src/lib/promise-settings/, src/actions/promise-settings.ts, src/components/promise-settings/. 해석되지 않은 제품 경계를 테스트 기대값으로 먼저 고정하지 않는다.

한 동작의 실패 assertion을 실제 확인한 뒤 최소 구현·회귀 검증을 반복한다. 테스트 도구 오류나 DB 연결 실패는 RED로 인정하지 않는다.

## 검증 계획

- AC별 검증 경계·원본 근거는 아래 표를 따른다. 아직 테스트 파일·제품 기능을 생성하지 않았다.
- 단위 테스트 예정 명령: 프로젝트 루트에서 docker compose exec tools npm run test -- src/lib/promise-settings/promise-settings.test.ts.
- DB 통합 예정 명령: docker compose exec tools npm run test:integration -- src/lib/promise-settings/promise-settings.integration.test.ts. test:integration은 현재 없으며 001에서 분리 설정을 추가할 계획이다. DB 검증 항목이 없는 AC에 억지로 통합 테스트를 만들지 않는다.
- DB 변경이 있으면 전용 테스트 DB 보호 확인 → 로컬 마이그레이션 작성 → Client 생성 → 빈 테스트 DB에 기존 마이그레이션 적용 → 실제 제약·트랜잭션 검증 순서로 진행한다. 운영 적용은 별도 배포 요청 시 db:deploy로만 한다.
- 격리: TEST_DATABASE_URL과 테스트 DB 이름·로컬 호스트 허용 목록을 검사하고 개발·운영 URL을 거절한다. 동시성은 독립 연결과 동시 시작 장벽을 사용한다. 상세 구성은 분해 계획에 정의한다.
- 브라우저 동작·오류 복구·모바일을 실제 확인한다. 이미지가 있는 요소는 원본 1280×3042 참고 시트를 사용한다. 제품 화면 검수 크기는 390×844와 1280×800을 제안하며 디자인 원본 크기로 주장하지 않는다.
- 최종 검증: 관련 단위·DB·브라우저 회귀, Docker Node.js 24의 npm run lint, npm run typecheck, npm run build. 필요한 검증을 실행하지 못하면 미검증으로 남긴다.

## 미정 사항

OPEN-05 날짜·월말 경계, OPEN-06 마감 기본값·마감 이후 시간 여유 정책. 정원 2~30과 30분 단위는 ERD 기준으로 확정.

OPEN 항목의 제안은 [분해 계획](../spec-plan.md)에 있으며 사용자 확정 전 제품 규칙으로 고정하지 않는다.

## 결과

모든 AC 미검증. 문서 초안만 작성했으며 앱 구현·DB 변경·RED/GREEN 실행·외부 연동은 수행하지 않았다.

## TDD 적용 계획

| AC | TDD 구분·이유 | 공개 경계·수준 | 기대값의 원본 근거 | 예정 테스트 파일 또는 확인 방법 |
| --- | --- | --- | --- | --- |
| AC-1 | 필수 | 단위·실제 DB | DOC-001 §4 STATE-03-01; DOC-002 §6·8.2 | src/lib/promise-settings/promise-settings.test.ts / src/lib/promise-settings/promise-settings.integration.test.ts |
| AC-2 | 필수 | 단위·실제 DB | DOC-002 §3.2·4.2·6.3·11 | src/lib/promise-settings/promise-settings.test.ts / src/lib/promise-settings/promise-settings.integration.test.ts |
| AC-3 | 필수 | 단위·실제 DB | DOC-002 §3.2·4.2·5.1 | src/lib/promise-settings/promise-settings.test.ts / src/lib/promise-settings/promise-settings.integration.test.ts |
| AC-4 | 필수 | 단위·실제 DB | DOC-001 §4 STATE-03-01; DOC-002 §4.2 | src/lib/promise-settings/promise-settings.test.ts / src/lib/promise-settings/promise-settings.integration.test.ts |
| AC-5 | 필수 | 시간 단위·서비스 | DOC-002 §5.2·8.2; DOC-001 TIME-13-02 | src/lib/promise-settings/promise-settings.test.ts |
| AC-6 | 필수 | 실제 DB 동시성 | DOC-002 §6·8.2·10 | src/lib/promise-settings/promise-settings.test.ts / src/lib/promise-settings/promise-settings.integration.test.ts |
| AC-7 | 동작은 필수, 색상·배치 비교는 비대상 | 브라우저·시각 | DOC-001 §5; DOC-003 DayCell·MonthCalendar | src/lib/promise-settings/promise-settings.test.ts / 해당 기능 브라우저 시나리오 |

- 실제 실행 기록은 구현 시작 시 context/tdd/002-promise-settings.md에 작성한다. 현재는 기록 파일을 만들지 않는다.
- 공개 경계는 데이터 읽기·변경 서비스와 사용자 조작이다. 구현 내부 구조를 복제하는 테스트를 만들지 않는다.
- 브라우저 자동화 도구는 아직 없다. 004에서 Playwright 도입을 제안하고, 이전 단계의 실제 수동 브라우저 확인과 구분한다. 색상·간격은 별도 시각 검수한다.

