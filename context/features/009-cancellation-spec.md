# 약속 취소와 접근 차단

## 식별자와 상태

- 스펙 ID: 009-cancellation
- 상태: 확인 필요
- 작성 기준: 2026-11-05, 제품 구현·검증 전 초안.
- 요구사항: REQ-025, REQ-027, REQ-035. 흐름: FLOW-014. 식별자는 [분해 계획](../spec-plan.md)의 분석용 ID다.

## 근거 자료

- DOC-001 §4 STATE-10-01·§9; DOC-002 §4.2·6.1~6.2·8.2·10·11.
- DOC-001: [PRD](../inputs/prd.md), 버전 미상. DOC-002: [ERD](../inputs/ERD.md), 문서상 작성일 2026-09-23. DOC-003: [Figma 참고 이미지](../inputs/피그마.png), 버전 미상.
- PRD·ERD 전체와 제공 이미지 확인. Figma 링크·node ID·원본 컴포넌트 속성은 미제공이며 MCP 조회는 수행하지 않았다. 별도 비즈니스 규칙·API 문서는 사용자에게 존재하지만 미제공·미확인이다.
- 충돌은 2026-11-05 사용자 결정에 따라 ERD를 우선한다. ERD에 없는 비충돌 PRD 규칙은 유지한다. 제안·미정은 원본 요구사항과 구분한다.
- 디자인 확인 범위: 취소 확인·취소된 링크 안내 화면 미제공.

## 사용자와 문제

방장이 약속을 취소하면 참여자는 취소 사실을 확인하고 더 이상 해당 약속을 변경하거나 상세 내용을 조회하지 않는다.

## 목표와 범위

방장의 명시적 취소, 데이터 보존, 모든 세션 즉시 만료, 링크 안내와 일반 API 차단. 복원·재조율·취소 데이터 자동 삭제는 제공하지 않는다.

## 선행 작업

- [008-participant-management](008-participant-management-spec.md)

008의 마지막 방장 탈퇴에서도 사용하는 약속 취소·세션 만료 서비스를 재사용한다.

## 사용자 흐름

방장 취소 요청 → 권한·현재 상태 재검사 → 취소 시각·상태 기록 및 세션 만료 → 취소 안내. 다른 브라우저의 다음 요청도 차단하고 상세 내용을 화면에 계속 노출하지 않도록 갱신한다.

## 수용 기준

- [ ] AC-1: 취소되지 않은 약속의 방장만 약속을 cancelled로 바꾸고 cancelled_at을 기록한다. 일반 참여자·다른 약속 세션은 거절한다.
- [ ] AC-2: 설정·참여자 role/status·닉네임·PIN 해시·가능 시간·제출 기록·확정 일정을 보존하고 모든 세션을 즉시 만료한다. 취소 동작에서 자식 행을 삭제하지 않는다.
- [ ] AC-3: draft의 명시적 약속 취소는 상태 전이·보존 규칙을 따른다. draft 나가기·10분 만료 폐기는 001의 물리 삭제 예외로 구분한다.
- [ ] AC-4: 유효한 취소 링크는 로그인 없이 “취소된 약속입니다”만 표시하고 설정·참여자·입력·결과를 노출하지 않는다. 취소된 약속의 일반 API에는 PROMISE_CANCELLED 오류를 반환하며 HTTP 경계에서는 409다. 2026-11-14 사용자 결정으로 취소 안내·오류는 인증 부재·세션 만료보다 우선한다. 링크 자체가 만료됐다면 기존 정책대로 “만료된 약속입니다”만 표시한다. 상세 상태표는 [003 스펙](003-participant-access-spec.md)의 오류 우선순위를 따른다.
- [ ] AC-5: 취소된 약속의 신규 참여·탈퇴·투표·확정·재조율·복원을 모두 거절한다. 상태 변경과 경쟁하는 요청도 같은 잠금 기준으로 처리하고 부분 취소를 남기지 않는다.
- [ ] AC-6: 취소 확인·처리 중·실패·취소 완료를 모바일과 다른 열린 브라우저에서 확인한다.

각 AC의 근거와 확인 방법은 아래 TDD 적용 계획에 대응한다. OPEN 항목이 포함된 AC는 해당 결정 전 완료 처리하지 않는다.

## 데이터와 인터페이스

제안 Server Action cancelPromise({inviteToken}). 취소 시 promises 상태·시각과 관련 sessions.expires_at만 변경한다. 취소 원인 컬럼이나 자동 삭제 작업은 추가하지 않는다. 취소 안내용 최소 조회와 인증된 상세 조회를 구분한다.

공통 잠금·서버 시각·오류 계약·DB 테스트 기준은 [분해 계획](../spec-plan.md)의 공통 구현·검증 계약을 따른다. 참여자 인증이 필요한 경계에서는 서버가 약속 소속·세션·현재 역할·상태를 검사한다. 공개 링크 안내와 외부 챗봇은 각 경계의 공개 범위·호출 검증을 적용한다. 다른 참여자의 민감 정보를 오류에 포함하지 않는다.

## 구현 계획

명시적 취소 진입점 → 008 공통 취소 서비스 → 조회 응답 필터링 → 모든 기존 진입점의 취소 차단 회귀 → 안내 UI. 예정 apps/web/src/lib/cancellation/, src/actions/cancellation.ts, src/components/promise-status/.

한 동작의 실패 assertion을 실제 확인한 뒤 최소 구현·회귀 검증을 반복한다. 테스트 도구 오류나 DB 연결 실패는 RED로 인정하지 않는다.

## 검증 계획

- AC별 검증 경계·원본 근거는 아래 표를 따른다. 아직 테스트 파일·제품 기능을 생성하지 않았다.
- 단위 테스트 예정 명령: 프로젝트 루트에서 docker compose exec tools npm run test -- src/lib/cancellation/cancellation.test.ts.
- DB 통합 예정 명령: docker compose exec tools npm run test:integration -- src/lib/cancellation/cancellation.integration.test.ts. test:integration은 현재 없으며 001에서 분리 설정을 추가할 계획이다. DB 검증 항목이 없는 AC에 억지로 통합 테스트를 만들지 않는다.
- DB 변경이 있으면 전용 테스트 DB 보호 확인 → 로컬 마이그레이션 작성 → Client 생성 → 빈 테스트 DB에 기존 마이그레이션 적용 → 실제 제약·트랜잭션 검증 순서로 진행한다. 운영 적용은 별도 배포 요청 시 db:deploy로만 한다.
- 격리: TEST_DATABASE_URL과 테스트 DB 이름·로컬 호스트 허용 목록을 검사하고 개발·운영 URL을 거절한다. 동시성은 독립 연결과 동시 시작 장벽을 사용한다. 상세 구성은 분해 계획에 정의한다.
- 브라우저 동작·오류 복구·모바일을 실제 확인한다. 이미지가 있는 요소는 원본 1280×3042 참고 시트를 사용한다. 제품 화면 검수 크기는 390×844와 1280×800을 제안하며 디자인 원본 크기로 주장하지 않는다.
- 최종 검증: 관련 단위·DB·브라우저 회귀, Docker Node.js 24의 npm run lint, npm run typecheck, npm run build. 필요한 검증을 실행하지 못하면 미검증으로 남긴다.

## 미정 사항

OPEN-10 오류 우선순위는 2026-11-14 사용자 결정으로 확정하여 AC-4에 반영했다. 취소·비로그인, 취소·만료 세션, 취소·링크 만료 조합을 구현 시 검증한다. MVP의 취소·탈퇴 데이터 자동 삭제 없음은 사용자 ERD 우선 결정으로 확정되었으며, 장기 운영 보관 정책은 이후 별도 결정 대상으로 남긴다.

OPEN 항목의 제안은 [분해 계획](../spec-plan.md)에 있으며 사용자 확정 전 제품 규칙으로 고정하지 않는다.

## 결과

모든 AC 미검증. 문서 초안만 작성했으며 앱 구현·DB 변경·RED/GREEN 실행·외부 연동은 수행하지 않았다.

## TDD 적용 계획

| AC | TDD 구분·이유 | 공개 경계·수준 | 기대값의 원본 근거 | 예정 테스트 파일 또는 확인 방법 |
| --- | --- | --- | --- | --- |
| AC-1 | 필수 | 단위·실제 DB | DOC-002 §6.1~6.2·8.2 | src/lib/cancellation/cancellation.test.ts / src/lib/cancellation/cancellation.integration.test.ts |
| AC-2 | 필수 | 실제 DB | DOC-002 §10·11 | src/lib/cancellation/cancellation.test.ts / src/lib/cancellation/cancellation.integration.test.ts |
| AC-3 | 필수 | 단위·실제 DB | DOC-002 §4.2·6.1~6.2·10 | src/lib/cancellation/cancellation.test.ts / src/lib/cancellation/cancellation.integration.test.ts |
| AC-4 | 필수 | 응답 계약·브라우저 | DOC-002 §6.2·11 | src/lib/cancellation/cancellation.test.ts / 해당 기능 브라우저 시나리오 |
| AC-5 | 필수 | 실제 DB 동시성 | DOC-002 §6.2·8.2·11 | src/lib/cancellation/cancellation.test.ts / src/lib/cancellation/cancellation.integration.test.ts |
| AC-6 | 동작은 필수, 색상·배치 비교는 비대상 | 브라우저·시각 | DOC-001 §5; DOC-002 §6.2 | src/lib/cancellation/cancellation.test.ts / 해당 기능 브라우저 시나리오 |

- 실제 실행 기록은 구현 시작 시 context/tdd/009-cancellation.md에 작성한다. 현재는 기록 파일을 만들지 않는다.
- 공개 경계는 데이터 읽기·변경 서비스와 사용자 조작이다. 구현 내부 구조를 복제하는 테스트를 만들지 않는다.
- 브라우저 자동화 도구는 아직 없다. 004에서 Playwright 도입을 제안하고, 이전 단계의 실제 수동 브라우저 확인과 구분한다. 색상·간격은 별도 시각 검수한다.

