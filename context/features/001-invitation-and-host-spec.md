# 초대 링크 접근과 방장 등록

## 식별자와 상태

- 스펙 ID: 001-invitation-and-host
- 상태: 확인 필요
- 작성 기준: 2026-11-05, 제품 구현·검증 전 초안.
- 요구사항: REQ-001~006, REQ-026~027. 흐름: FLOW-001~003. 식별자는 [분해 계획](../spec-plan.md)의 분석용 ID다.

## 근거 자료

- DOC-001 §4 MEMBER-01-02·MEMBER-02-01·MEMBER-05-01·MEMBER-06-01·STATE-02-02, §5; DOC-002 §3.1~3.5·4·8.1·9·10·11.
- DOC-001: [PRD](../inputs/prd.md), 버전 미상. DOC-002: [ERD](../inputs/ERD.md), 문서상 작성일 2026-09-23. DOC-003: [Figma 참고 이미지](../inputs/피그마.png), 버전 미상.
- PRD·ERD 전체와 제공 이미지 확인. Figma 링크·node ID·원본 컴포넌트 속성은 미제공이며 MCP 조회는 수행하지 않았다. 별도 비즈니스 규칙·API 문서는 사용자에게 존재하지만 미제공·미확인이다.
- 충돌은 2026-11-05 사용자 결정에 따라 ERD를 우선한다. ERD에 없는 비충돌 PRD 규칙은 유지한다. 제안·미정은 원본 요구사항과 구분한다.
- 디자인 확인 범위: 전체 화면 미제공. 방장 등록·선점 실패·초안 만료 화면은 신규 구성 제안이며 이미지와 일치했다고 표시하지 않는다.

## 사용자와 문제

초대 링크를 받은 최초 사용자가 명시적으로 방장을 등록하고 약속 설정을 시작한다. 링크 미리보기나 동시 접속으로 방장이 잘못 지정되지 않아야 한다.

## 목표와 범위

초대 토큰 발급 서비스, 링크 조회, 방장 등록, 초기 약속별 세션, draft 만료 안내·정리·나가기. 실제 카카오 요청 처리는 010, 모집 설정은 002, 재인증·일반 참여는 003에서 연결한다. 웹에서 임의로 링크를 발급하는 공개 기능은 추가하지 않는다.

## 선행 작업

- [000-project-bootstrap](000-project-bootstrap.md)

000의 Next.js·Prisma 연결 기반이 필요하다. 링크 발급 서비스는 010이 호출하며, 이 스펙의 독립 검증에서는 테스트 링크를 사용한다.

## 사용자 흐름

유효한 미사용 링크 → 닉네임·PIN 입력 → 명시적 방장 등록 → 약속·방장·세션 생성 → 설정 화면 진입. 선점 중에는 진행 상태를 표시한다. 이미 선점된 링크는 draft 대기 또는 약속 진입 경로를 안내한다. 8분 경과 시 2분 남음 안내, 10분 경과 시 만료 안내. 조회만으로 삭제하지 않으며 다음 쓰기에서 만료 초안을 정리한다.

## 수용 기준

- [ ] AC-1: 링크 발급은 promise_links만 생성한다. 링크 GET·미리보기는 약속·방장 생성이나 만료 초안 삭제를 일으키지 않는다.
- [ ] AC-2: 동일 링크의 동시 방장 등록 2건 중 하나만 약속과 active host를 생성한다. 실패 시 약속·방장·세션의 부분 저장이 없다.
- [ ] AC-3: 닉네임은 앞뒤 공백 제거 후 2~12자, PIN은 숫자 4자리로 검증하며 선행 0을 보존한다. PIN 원문은 저장·로그·응답에 남기지 않는다. 정규화 상세는 OPEN-01 확정 후 검증한다.
- [ ] AC-4: 약속별 난수 세션 토큰을 안전한 HttpOnly 쿠키로 발급하고 DB에는 해시만 저장한다. 세션·참여자·약속 검증 없이 설정 변경을 허용하지 않는다. draft 세션 기한은 OPEN-03 확정 후 검증한다.
- [ ] AC-5: 방장 등록 후 10분 이상이면 draft를 만료로 판정한다. 만료 발견 쓰기와 draft 나가기는 링크→약속 순서로 잠그고 세션→방장→약속을 삭제하며 링크를 보존한다. 만료 직전 설정 완료와 경쟁해도 모집 중 약속은 삭제하지 않는다.
- [ ] AC-6: 발급 3개월 후 초대 링크 만료를 검사한다. 월말 경계와 기존 참여자 접근 처리는 OPEN-04 확정 전 미정이며, 만료를 데이터 물리 삭제로 해석하지 않는다.
- [ ] AC-7: 등록 중·선점 실패·잘못된 입력·만료 상태를 표시하고 draft에서 타인의 신규 참여를 막는다. 만료 2분 전 안내와 서버 재판정을 실제 브라우저에서 확인한다.

각 AC의 근거와 확인 방법은 아래 TDD 적용 계획에 대응한다. OPEN 항목이 포함된 AC는 해당 결정 전 완료 처리하지 않는다.

## 데이터와 인터페이스

promise_links, promises, participants, participant_sessions를 ERD대로 처음 도입한다. UUID PK/FK, invite_token·promise_link_id·session_token_hash UNIQUE, 약속별 normalized_nickname UNIQUE, role=host 조건부 UNIQUE, host는 active CHECK, ON DELETE RESTRICT를 포함한다. 약속 설정은 draft에서 NULL을 허용하고 상태별 필수값·confirmed_start_at·cancelled_at 제약은 DOC-002 §4.2를 따른다. 모든 시점은 Timestamptz(3), 일자는 Date, 일일 경계는 분 값으로 저장한다. 슬롯 테이블은 004에서 추가한다.

제안 인터페이스: 서버 전용 issueInviteLink(), 조회 readInvitation(inviteToken), Server Action registerHost({inviteToken,nickname,pin}), abandonDraft({inviteToken}). 브라우저가 보낸 role·participantId를 권한으로 사용하지 않는다. 응답은 성공 데이터 또는 사용자에게 복구 가능한 오류 코드이며 해시·DB 오류를 노출하지 않는다. 함수명·URL은 새 설계 제안이고 기존 미제공 API 명세를 재현한 것이 아니다.

공통 잠금·서버 시각·오류 계약·DB 테스트 기준은 [분해 계획](../spec-plan.md)의 공통 구현·검증 계약을 따른다. 참여자 인증이 필요한 경계에서는 서버가 약속 소속·세션·현재 역할·상태를 검사한다. 공개 링크 안내와 외부 챗봇은 각 경계의 공개 범위·호출 검증을 적용한다. 다른 참여자의 민감 정보를 오류에 포함하지 않는다.

## 구현 계획

초기 도메인 마이그레이션과 격리된 DB 테스트 기반 → 조회 부작용 방지 → 원자적 선점 → 세션 → 만료·나가기 순서로 각 동작의 RED/GREEN을 반복한다. 예정 파일은 apps/web/src/lib/invitation/, src/actions/invitation.ts, src/components/invitation/, src/app/p/[inviteToken]/, prisma/migrations/이며 모두 apps/web/ 아래에 둔다. 공통 잠금·세션 검증 경계는 후속 기능이 재사용한다.

한 동작의 실패 assertion을 실제 확인한 뒤 최소 구현·회귀 검증을 반복한다. 테스트 도구 오류나 DB 연결 실패는 RED로 인정하지 않는다.

## 검증 계획

- AC별 검증 경계·원본 근거는 아래 표를 따른다. 아직 테스트 파일·제품 기능을 생성하지 않았다.
- 단위 테스트 예정 명령: 프로젝트 루트에서 docker compose exec tools npm run test -- src/lib/invitation/invitation.test.ts.
- DB 통합 예정 명령: docker compose exec tools npm run test:integration -- src/lib/invitation/invitation.integration.test.ts. test:integration은 현재 없으며 001에서 분리 설정을 추가할 계획이다. DB 검증 항목이 없는 AC에 억지로 통합 테스트를 만들지 않는다.
- DB 변경이 있으면 전용 테스트 DB 보호 확인 → 로컬 마이그레이션 작성 → Client 생성 → 빈 테스트 DB에 기존 마이그레이션 적용 → 실제 제약·트랜잭션 검증 순서로 진행한다. 운영 적용은 별도 배포 요청 시 db:deploy로만 한다.
- 격리: TEST_DATABASE_URL과 테스트 DB 이름·로컬 호스트 허용 목록을 검사하고 개발·운영 URL을 거절한다. 동시성은 독립 연결과 동시 시작 장벽을 사용한다. 상세 구성은 분해 계획에 정의한다.
- 브라우저 동작·오류 복구·모바일을 실제 확인한다. 이미지가 있는 요소는 원본 1280×3042 참고 시트를 사용한다. 제품 화면 검수 크기는 390×844와 1280×800을 제안하며 디자인 원본 크기로 주장하지 않는다.
- 최종 검증: 관련 단위·DB·브라우저 회귀, Docker Node.js 24의 npm run lint, npm run typecheck, npm run build. 필요한 검증을 실행하지 못하면 미검증으로 남긴다.

## 미정 사항

OPEN-01 닉네임 정규화·글자 수 기준, OPEN-03 draft 세션 기한, OPEN-04 초대 링크 월말·만료 접근 정책. 자동 방장 선점은 없으며 명시적 등록이라는 ERD 기준은 확정되어 있다.

OPEN 항목의 제안은 [분해 계획](../spec-plan.md)에 있으며 사용자 확정 전 제품 규칙으로 고정하지 않는다.

## 결과

모든 AC 미검증. 문서 초안만 작성했으며 앱 구현·DB 변경·RED/GREEN 실행·외부 연동은 수행하지 않았다.

## TDD 적용 계획

| AC | TDD 구분·이유 | 공개 경계·수준 | 기대값의 원본 근거 | 예정 테스트 파일 또는 확인 방법 |
| --- | --- | --- | --- | --- |
| AC-1 | 필수 | 단위·실제 DB | DOC-002 §3.1·10 | src/lib/invitation/invitation.test.ts / src/lib/invitation/invitation.integration.test.ts |
| AC-2 | 필수 | 실제 DB 동시성 | DOC-002 §4·8.1·11 | src/lib/invitation/invitation.test.ts / src/lib/invitation/invitation.integration.test.ts |
| AC-3 | 필수 | 단위·실제 DB | DOC-001 §4 MEMBER-05-01·MEMBER-06-01; DOC-002 §9 | src/lib/invitation/invitation.test.ts / src/lib/invitation/invitation.integration.test.ts |
| AC-4 | 필수 | 단위·실제 DB | DOC-001 §4 MEMBER-06-03·§5; DOC-002 §3.5·9 | src/lib/invitation/invitation.test.ts / src/lib/invitation/invitation.integration.test.ts |
| AC-5 | 필수 | 시간 단위·실제 DB 동시성 | DOC-001 §4 STATE-02-02; DOC-002 §10·11 | src/lib/invitation/invitation.test.ts / src/lib/invitation/invitation.integration.test.ts |
| AC-6 | 필수 | 단위·서비스, 결정 후 | DOC-001 §4 MEMBER-01-02 | src/lib/invitation/invitation.test.ts |
| AC-7 | 필수 | 브라우저·서비스 | DOC-001 §4 MEMBER-03-02·STATE-02-02; DOC-002 §6.2 | src/lib/invitation/invitation.test.ts / 해당 기능 브라우저 시나리오 |

- 실제 실행 기록은 구현 시작 시 context/tdd/001-invitation-and-host.md에 작성한다. 현재는 기록 파일을 만들지 않는다.
- 공개 경계는 데이터 읽기·변경 서비스와 사용자 조작이다. 구현 내부 구조를 복제하는 테스트를 만들지 않는다.
- 브라우저 자동화 도구는 아직 없다. 004에서 Playwright 도입을 제안하고, 이전 단계의 실제 수동 브라우저 확인과 구분한다. 색상·간격은 별도 시각 검수한다.

