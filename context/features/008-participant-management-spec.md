# 탈퇴·내보내기와 방장 승계

## 식별자와 상태

- 스펙 ID: 008-participant-management
- 상태: 초안
- 작성 기준: 2026-11-05, 제품 구현·검증 전 초안.
- 요구사항: REQ-022~024, REQ-026~027. 흐름: FLOW-013. 식별자는 [분해 계획](../spec-plan.md)의 분석용 ID다.

## 근거 자료

- DOC-001 §4 MEMBER-10-01·MEMBER-10-02·MEMBER-12-04; DOC-002 §4·6.2·8.2·9·10·11.
- DOC-001: [PRD](../inputs/prd.md), 버전 미상. DOC-002: [ERD](../inputs/ERD.md), 문서상 작성일 2026-09-23. DOC-003: [Figma 참고 이미지](../inputs/피그마.png), 버전 미상.
- PRD·ERD 전체와 제공 이미지 확인. Figma 링크·node ID·원본 컴포넌트 속성은 미제공이며 MCP 조회는 수행하지 않았다. 별도 비즈니스 규칙·API 문서는 사용자에게 존재하지만 미제공·미확인이다.
- 충돌은 2026-11-05 사용자 결정에 따라 ERD를 우선한다. ERD에 없는 비충돌 PRD 규칙은 유지한다. 제안·미정은 원본 요구사항과 구분한다.
- 디자인 확인 범위: 참여자 목록·탈퇴 확인·내보내기·방장 승계 안내 화면 미제공.

## 사용자와 문제

참여자는 약속에서 나가고 방장은 모집 중 참여자를 관리할 수 있다. 방장이 나가도 다음 사람이 약속 관리를 이어받는다.

## 목표와 범위

본인 탈퇴, 모집 중 방장의 내보내기, 자동 승계, 마지막 방장 탈퇴의 약속 취소 전환. draft 나가기는 001을 호출한다. 수동 방장 위임은 ERD 언급만 있고 상세 계약이 없어 OPEN-09에서 별도 판단한다.

## 선행 작업

- [006-confirmation](006-confirmation-spec.md)

006까지의 상태별 참석자·후보 결과와 세션이 필요하다. 마지막 방장 취소 처리의 내부 서비스는 여기서 도입하고 009의 명시적 취소가 재사용한다.

## 사용자 흐름

본인 나가기 또는 방장 내보내기 → 현재 상태·권한 확인 → 참여 상태·세션 변경 → 목록·후보·확정 참석자 갱신. 방장 탈퇴는 후임에게 자동 승계하며 후임이 없으면 약속 취소 안내로 종료한다.

## 수용 기준

- [ ] AC-1: 본인 탈퇴는 collecting·closed·confirmed에서 허용한다. draft는 001의 물리 삭제 경로를 사용한다. cancelled에서는 탈퇴를 거절한다.
- [ ] AC-2: 방장의 타인 내보내기는 collecting·마감 전에만 허용하고 closed·confirmed에서는 거절한다. 다른 약속 참여자를 변경할 수 없다.
- [ ] AC-3: 일반 탈퇴·내보내기는 status=cancelled·cancelled_at을 기록하고 닉네임·PIN 해시·슬롯·제출 기록을 보존한다. 관련 세션 행은 삭제하지 않고 즉시 만료한다.
- [ ] AC-4: 방장 탈퇴 시 본인 제외 active 참여자를 created_at ASC,id ASC로 선정한다. 기존 방장을 member·cancelled로 바꾼 뒤 후임을 host로 지정하며 제출 여부는 고려하지 않는다. 중간 오류는 전체 롤백한다.
- [ ] AC-5: 후임이 없으면 마지막 방장은 host·active·cancelled_at=NULL로 보존하고 약속만 cancelled·cancelled_at으로 변경한다. 모든 참여자 세션을 즉시 만료하며 보존된 방장도 이후 일반 접근할 수 없다.
- [ ] AC-6: 탈퇴자는 active 정원·후보·참석자에서 제외한다. closed는 후보를 다시 계산하고 confirmed는 일정·상태를 유지한다. 참석자 2명 미만이 되면 방장에게 재조율·취소를 안내한다.
- [ ] AC-7: 이전 세션 재사용을 거절하고 방장 승계 후 권한을 매 요청 다시 판단한다. 동시 가입·탈퇴·내보내기에도 active host 불변식과 정원을 유지한다.
- [ ] AC-8: 본인 탈퇴와 방장의 내보내기를 구분해서 표시하고 승계·취소 결과를 모바일에서도 확인할 수 있다.

각 AC의 근거와 확인 방법은 아래 TDD 적용 계획에 대응한다. OPEN 항목이 포함된 AC는 해당 결정 전 완료 처리하지 않는다.

## 데이터와 인터페이스

제안 Server Action leavePromise({inviteToken}), removeParticipant({inviteToken,targetParticipantId}). promise 행 잠금 후 최신 세션·역할·상태와 대상 소속을 확인한다. 일반 탈퇴는 자식 삭제 없이 취소 시각을 저장하고 sessions.expires_at을 갱신한다. 조건부 host UNIQUE를 위반하지 않는 갱신 순서를 유지한다.

공통 잠금·서버 시각·오류 계약·DB 테스트 기준은 [분해 계획](../spec-plan.md)의 공통 구현·검증 계약을 따른다. 참여자 인증이 필요한 경계에서는 서버가 약속 소속·세션·현재 역할·상태를 검사한다. 공개 링크 안내와 외부 챗봇은 각 경계의 공개 범위·호출 검증을 적용한다. 다른 참여자의 민감 정보를 오류에 포함하지 않는다.

## 구현 계획

상태별 탈퇴·내보내기 → 자동 승계 → 마지막 방장 취소 서비스 → 세션·후보·결과 연계 순서. 예정 apps/web/src/lib/participant-management/, src/actions/participant-management.ts, src/components/participants/. 007 구현 여부와 독립적으로 완료할 수 있다.

한 동작의 실패 assertion을 실제 확인한 뒤 최소 구현·회귀 검증을 반복한다. 테스트 도구 오류나 DB 연결 실패는 RED로 인정하지 않는다.

## 검증 계획

- AC별 검증 경계·원본 근거는 아래 표를 따른다. 아직 테스트 파일·제품 기능을 생성하지 않았다.
- 단위 테스트 예정 명령: 프로젝트 루트에서 docker compose exec tools npm run test -- src/lib/participant-management/participant-management.test.ts.
- DB 통합 예정 명령: docker compose exec tools npm run test:integration -- src/lib/participant-management/participant-management.integration.test.ts. test:integration은 현재 없으며 001에서 분리 설정을 추가할 계획이다. DB 검증 항목이 없는 AC에 억지로 통합 테스트를 만들지 않는다.
- DB 변경이 있으면 전용 테스트 DB 보호 확인 → 로컬 마이그레이션 작성 → Client 생성 → 빈 테스트 DB에 기존 마이그레이션 적용 → 실제 제약·트랜잭션 검증 순서로 진행한다. 운영 적용은 별도 배포 요청 시 db:deploy로만 한다.
- 격리: TEST_DATABASE_URL과 테스트 DB 이름·로컬 호스트 허용 목록을 검사하고 개발·운영 URL을 거절한다. 동시성은 독립 연결과 동시 시작 장벽을 사용한다. 상세 구성은 분해 계획에 정의한다.
- 브라우저 동작·오류 복구·모바일을 실제 확인한다. 이미지가 있는 요소는 원본 1280×3042 참고 시트를 사용한다. 제품 화면 검수 크기는 390×844와 1280×800을 제안하며 디자인 원본 크기로 주장하지 않는다.
- 최종 검증: 관련 단위·DB·브라우저 회귀, Docker Node.js 24의 npm run lint, npm run typecheck, npm run build. 필요한 검증을 실행하지 못하면 미검증으로 남긴다.

## 미정 사항

수동 위임은 OPEN-09에서 미정으로 남기며 자동 승계에 임의로 포함하지 않는다. 동일인의 다른 닉네임 재가입을 완전히 막는 기능은 이번 범위에 추가하지 않는다.

OPEN 항목의 제안은 [분해 계획](../spec-plan.md)에 있으며 사용자 확정 전 제품 규칙으로 고정하지 않는다.

## 결과

모든 AC 미검증. 문서 초안만 작성했으며 앱 구현·DB 변경·RED/GREEN 실행·외부 연동은 수행하지 않았다.

## TDD 적용 계획

| AC | TDD 구분·이유 | 공개 경계·수준 | 기대값의 원본 근거 | 예정 테스트 파일 또는 확인 방법 |
| --- | --- | --- | --- | --- |
| AC-1 | 필수 | 상태 단위·실제 DB | DOC-002 §6.2·10·11 | src/lib/participant-management/participant-management.test.ts / src/lib/participant-management/participant-management.integration.test.ts |
| AC-2 | 필수 | 서비스·실제 DB | DOC-002 §6.2·9·11 | src/lib/participant-management/participant-management.test.ts / src/lib/participant-management/participant-management.integration.test.ts |
| AC-3 | 필수 | 실제 DB | DOC-002 §10·11 | src/lib/participant-management/participant-management.test.ts / src/lib/participant-management/participant-management.integration.test.ts |
| AC-4 | 필수 | 실제 DB 동시성 | DOC-002 §4.1·6.2·8.2·11 | src/lib/participant-management/participant-management.test.ts / src/lib/participant-management/participant-management.integration.test.ts |
| AC-5 | 필수 | 실제 DB | DOC-002 §6.2·8.2·11 | src/lib/participant-management/participant-management.test.ts / src/lib/participant-management/participant-management.integration.test.ts |
| AC-6 | 필수 | 005·006 연계 통합 | DOC-002 §6.2·11 | src/lib/participant-management/participant-management.test.ts |
| AC-7 | 필수 | 실제 DB 동시성 | DOC-002 §4.1·8.2·9 | src/lib/participant-management/participant-management.test.ts / src/lib/participant-management/participant-management.integration.test.ts |
| AC-8 | 동작은 필수, 색상·배치 비교는 비대상 | 브라우저·시각 | DOC-001 §5; DOC-002 §6.2 | src/lib/participant-management/participant-management.test.ts / 해당 기능 브라우저 시나리오 |

- 실제 실행 기록은 구현 시작 시 context/tdd/008-participant-management.md에 작성한다. 현재는 기록 파일을 만들지 않는다.
- 공개 경계는 데이터 읽기·변경 서비스와 사용자 조작이다. 구현 내부 구조를 복제하는 테스트를 만들지 않는다.
- 브라우저 자동화 도구는 아직 없다. 004에서 Playwright 도입을 제안하고, 이전 단계의 실제 수동 브라우저 확인과 구분한다. 색상·간격은 별도 시각 검수한다.

