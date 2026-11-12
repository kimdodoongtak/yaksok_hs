# 방장 일정 확정과 결과 공유

## 식별자와 상태

- 스펙 ID: 006-confirmation
- 상태: 확인 필요
- 작성 기준: 2026-11-05, 제품 구현·검증 전 초안.
- 요구사항: REQ-018~019, REQ-029. 흐름: FLOW-011. 식별자는 [분해 계획](../spec-plan.md)의 분석용 ID다.

## 근거 자료

- DOC-001 §4 RESULT-11-01·RESULT-12-01 및 확정 결과 링크 공유, §8; DOC-002 §3.2·6.2·7.2·8.2·11.
- DOC-001: [PRD](../inputs/prd.md), 버전 미상. DOC-002: [ERD](../inputs/ERD.md), 문서상 작성일 2026-09-23. DOC-003: [Figma 참고 이미지](../inputs/피그마.png), 버전 미상.
- PRD·ERD 전체와 제공 이미지 확인. Figma 링크·node ID·원본 컴포넌트 속성은 미제공이며 MCP 조회는 수행하지 않았다. 별도 비즈니스 규칙·API 문서는 사용자에게 존재하지만 미제공·미확인이다.
- 충돌은 2026-11-05 사용자 결정에 따라 ERD를 우선한다. ERD에 없는 비충돌 PRD 규칙은 유지한다. 제안·미정은 원본 요구사항과 구분한다.
- 디자인 확인 범위: 후보 선택·확정 확인·결과 공유 화면 미제공. 결과 시간·참석자·오류·재조회 경로를 새 화면안으로 제안한다.

## 사용자와 문제

방장이 유효 후보를 직접 선택하고 참여자들이 동일한 확정 일정을 확인한다.

## 목표와 범위

closed의 수동 확정, 서버 재검증, 확정 결과 조회, 링크 복사. 자동 확정·알림톡·챗봇 자동 발송·톡캘린더 등록은 제외한다.

## 선행 작업

- [005-status-and-candidates](005-status-and-candidates-spec.md)

005의 마감 판정·후보 계산을 확정 시 같은 트랜잭션에서 재사용한다.

## 사용자 흐름

방장 후보 선택 → 확정 요청 → 잠금 후 재검증 → 확정 시간·참석자 표시 → 링크 복사. 후보가 과거가 됐거나 참석자가 달라져 무효이면 확정하지 않고 최신 후보 재조회로 안내한다. 공유 링크 수신자의 결과 접근은 OPEN-07에서 확정한다.

## 수용 기준

- [ ] AC-1: closed 약속의 방장만 유효 후보를 선택해 confirmed로 변경할 수 있다. 일반 참여자·미인증·다른 약속 세션은 거절하고 추천 1순위 선택을 강제하지 않는다.
- [ ] AC-2: 확정 시 잠금 후 현재 시각·날짜/시간 범위·소요 길이·공통 참석자 2명 이상을 다시 계산한다. 클라이언트의 인원수·순위를 신뢰하지 않는다.
- [ ] AC-3: 확정 시작과 confirmed 상태를 함께 저장하고 실패 시 부분 확정이 없다. 종료는 시작+소요 시간으로 계산한다. confirmed에서 소요 시간만 직접 변경하는 요청은 거절한다.
- [ ] AC-4: 확정 링크에서 서버의 최신 확정 시간과 허용된 참석자 정보를 보여주며 링크 복사 실패 시 수동 복사를 안내한다. 결과 공개 대상은 OPEN-07 결정에 따라 서버에서 제한한다.
- [ ] AC-5: 일반 참여자 탈퇴 후에도 확정 시간·상태는 유지하고 참석자만 갱신한다. 2명 미만이 되어도 자동 해제·자동 취소하지 않으며 방장에게 재조율·취소를 안내한다. 실제 탈퇴 연계는 008에서 완성한다.
- [ ] AC-6: 모바일에서 후보 선택·확정 중·실패 재조회·확정 결과·링크 공유 상태를 확인한다.

각 AC의 근거와 확인 방법은 아래 TDD 적용 계획에 대응한다. OPEN 항목이 포함된 AC는 해당 결정 전 완료 처리하지 않는다.

## 데이터와 인터페이스

promises.confirmed_start_at·status를 원자적으로 갱신한다. 종료시각·확정 버튼을 누른 시각·후보 이력 테이블을 새로 저장하지 않는다. 제안 Server Action confirmPromise({inviteToken,startAt}), 조회 readConfirmation(inviteToken,viewer). 결과 공개 범위는 초대 토큰 보유와 참여자 인증을 구분하여 결정한다.

공통 잠금·서버 시각·오류 계약·DB 테스트 기준은 [분해 계획](../spec-plan.md)의 공통 구현·검증 계약을 따른다. 참여자 인증이 필요한 경계에서는 서버가 약속 소속·세션·현재 역할·상태를 검사한다. 공개 링크 안내와 외부 챗봇은 각 경계의 공개 범위·호출 검증을 적용한다. 다른 참여자의 민감 정보를 오류에 포함하지 않는다.

## 구현 계획

확정 입력·권한 검증 → 후보 재계산 트랜잭션 → 결과 조회 → 공유 UI 순서. 예정 apps/web/src/lib/confirmation/, src/actions/confirmation.ts, src/components/confirmation/. 저장이 이미 closed인지 기한 경과 collecting인지 공통 마감 처리로 일관되게 판정한다.

한 동작의 실패 assertion을 실제 확인한 뒤 최소 구현·회귀 검증을 반복한다. 테스트 도구 오류나 DB 연결 실패는 RED로 인정하지 않는다.

## 검증 계획

- AC별 검증 경계·원본 근거는 아래 표를 따른다. 아직 테스트 파일·제품 기능을 생성하지 않았다.
- 단위 테스트 예정 명령: 프로젝트 루트에서 docker compose exec tools npm run test -- src/lib/confirmation/confirmation.test.ts.
- DB 통합 예정 명령: docker compose exec tools npm run test:integration -- src/lib/confirmation/confirmation.integration.test.ts. test:integration은 현재 없으며 001에서 분리 설정을 추가할 계획이다. DB 검증 항목이 없는 AC에 억지로 통합 테스트를 만들지 않는다.
- DB 변경이 있으면 전용 테스트 DB 보호 확인 → 로컬 마이그레이션 작성 → Client 생성 → 빈 테스트 DB에 기존 마이그레이션 적용 → 실제 제약·트랜잭션 검증 순서로 진행한다. 운영 적용은 별도 배포 요청 시 db:deploy로만 한다.
- 격리: TEST_DATABASE_URL과 테스트 DB 이름·로컬 호스트 허용 목록을 검사하고 개발·운영 URL을 거절한다. 동시성은 독립 연결과 동시 시작 장벽을 사용한다. 상세 구성은 분해 계획에 정의한다.
- 브라우저 동작·오류 복구·모바일을 실제 확인한다. 이미지가 있는 요소는 원본 1280×3042 참고 시트를 사용한다. 제품 화면 검수 크기는 390×844와 1280×800을 제안하며 디자인 원본 크기로 주장하지 않는다.
- 최종 검증: 관련 단위·DB·브라우저 회귀, Docker Node.js 24의 npm run lint, npm run typecheck, npm run build. 필요한 검증을 실행하지 못하면 미검증으로 남긴다.

## 미정 사항

OPEN-07 확정 결과의 비참여자·신규 기기 공개 범위. 자동 확정 없음은 ERD 우선 결정으로 해소되어 재확인하지 않는다.

OPEN 항목의 제안은 [분해 계획](../spec-plan.md)에 있으며 사용자 확정 전 제품 규칙으로 고정하지 않는다.

## 결과

모든 AC 미검증. 문서 초안만 작성했으며 앱 구현·DB 변경·RED/GREEN 실행·외부 연동은 수행하지 않았다.

## TDD 적용 계획

| AC | TDD 구분·이유 | 공개 경계·수준 | 기대값의 원본 근거 | 예정 테스트 파일 또는 확인 방법 |
| --- | --- | --- | --- | --- |
| AC-1 | 필수 | 단위·실제 DB | DOC-002 §7.2·8.2; DOC-001 RESULT-11-01 | src/lib/confirmation/confirmation.test.ts / src/lib/confirmation/confirmation.integration.test.ts |
| AC-2 | 필수 | 단위·실제 DB 동시성 | DOC-002 §7.2·8.2·11 | src/lib/confirmation/confirmation.test.ts / src/lib/confirmation/confirmation.integration.test.ts |
| AC-3 | 필수 | 실제 DB·서비스 | DOC-002 §3.2·4.2·11 | src/lib/confirmation/confirmation.test.ts / src/lib/confirmation/confirmation.integration.test.ts |
| AC-4 | 필수 | 서비스·브라우저 | DOC-001 §4·8; DOC-002 §9 | src/lib/confirmation/confirmation.test.ts / 해당 기능 브라우저 시나리오 |
| AC-5 | 필수 | 서비스·008 연계 회귀 | DOC-002 §6.2·11 | src/lib/confirmation/confirmation.test.ts |
| AC-6 | 동작은 필수, 색상·배치 비교는 비대상 | 브라우저·시각 | DOC-001 §5 | src/lib/confirmation/confirmation.test.ts / 해당 기능 브라우저 시나리오 |

- 실제 실행 기록은 구현 시작 시 context/tdd/006-confirmation.md에 작성한다. 현재는 기록 파일을 만들지 않는다.
- 공개 경계는 데이터 읽기·변경 서비스와 사용자 조작이다. 구현 내부 구조를 복제하는 테스트를 만들지 않는다.
- 브라우저 자동화 도구는 아직 없다. 004에서 Playwright 도입을 제안하고, 이전 단계의 실제 수동 브라우저 확인과 구분한다. 색상·간격은 별도 시각 검수한다.

