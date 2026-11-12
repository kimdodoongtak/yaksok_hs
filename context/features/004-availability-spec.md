# 가능 시간 선택과 제출

## 식별자와 상태

- 스펙 ID: 004-availability
- 상태: 초안
- 작성 기준: 2026-11-05, 제품 구현·검증 전 초안.
- 요구사항: REQ-011~014, REQ-029, REQ-034. 흐름: FLOW-007~008. 식별자는 [분해 계획](../spec-plan.md)의 분석용 ID다.

## 근거 자료

- DOC-001 §4 TIME-06-01·TIME-11-01·TIME-15-02; DOC-002 §3.3~3.4·5·6.2·8.2·11; DOC-003 시간 선택 컴포넌트.
- DOC-001: [PRD](../inputs/prd.md), 버전 미상. DOC-002: [ERD](../inputs/ERD.md), 문서상 작성일 2026-09-23. DOC-003: [Figma 참고 이미지](../inputs/피그마.png), 버전 미상.
- PRD·ERD 전체와 제공 이미지 확인. Figma 링크·node ID·원본 컴포넌트 속성은 미제공이며 MCP 조회는 수행하지 않았다. 별도 비즈니스 규칙·API 문서는 사용자에게 존재하지만 미제공·미확인이다.
- 충돌은 2026-11-05 사용자 결정에 따라 ERD를 우선한다. ERD에 없는 비충돌 PRD 규칙은 유지한다. 제안·미정은 원본 요구사항과 구분한다.
- 디자인 확인 범위: DOC-003 DayHeader·TimeSlot·AvailabilityBlock·CalendarToolbar·WeeklyAvailabilityGrid·VoteFooter. 반복 사용 버튼은 OPEN-08의 추가 범위 제안이며 승인 전 구현하지 않는다.

## 사용자와 문제

참여자는 허용된 날짜·시간 안에서 가능한 시간을 선택하고, 마감 전까지 자신의 응답을 안전하게 수정한다.

## 목표와 범위

30분 선택·해제·드래그, 주 이동, 로컬 임시 선택, 제출·재제출·빈 제출, 여러 기기의 충돌 감지. 전체 현황 집계는 005가 담당한다. 가능/애매 3단계는 제외한다.

## 선행 작업

- [003-participant-access](003-participant-access-spec.md)

003의 참여자 인증과 002의 약속 범위·마감이 필요하다.

## 사용자 흐름

본인 서버 슬롯·버전 로딩 → 주 이동·30분 선택 → 제출 → 완료 표시. 네트워크 실패 시 재시도한다. 다른 기기나 설정 변경으로 버전이 바뀌면 로컬 미제출 입력을 폐기하고 최신 서버 선택을 보여주며 안내한다. 마감 뒤에는 입력을 차단하고 결과 경로로 연결한다.

## 수용 기준

- [ ] AC-1: 선택은 30분 단위이며 한 슬롯 전체가 날짜·일일 범위 안에 있어야 한다. 종료 23:00의 23:00 시작은 거절하고 종료 24:00의 마지막 날짜 23:30 시작은 허용한다.
- [ ] AC-2: 세션 본인의 응답만 collecting·마감 전에 저장한다. 방장도 타인의 선택·제출 상태를 수정할 수 없다. 빈 슬롯 집합 제출도 제출 완료로 기록한다.
- [ ] AC-3: 기준 버전이 일치하면 슬롯 최종 집합·제출 시각·버전 +1을 원자적으로 저장한다. 중복 슬롯은 하나만 유지한다. 중간 실패는 전체 롤백한다.
- [ ] AC-4: 기준 버전이 다르고 결과가 다르면 아무것도 변경하지 않고 AVAILABILITY_VERSION_CONFLICT와 본인의 최신 버전·슬롯·제출 상태를 반환한다. HTTP 경계에서는 409다. 오래된 버전이라도 최종 데이터·제출 상태가 같으면 성공으로 응답하고 버전을 다시 증가시키지 않는다.
- [ ] AC-5: 시작≤현재인 요청 슬롯은 무시하고 이미 저장된 과거 슬롯은 재제출에서 보존한다. 미래 슬롯에는 범위 검증을 적용한다. 시간 경계를 고정해 검증한다.
- [ ] AC-6: 폴링에서 본인 버전이 바뀌면 미제출 입력을 폐기하고 서버 값으로 갱신한다. settings 객체 변경도 비교한다. 타인의 응답 변화는 본인 버전만으로 판단하지 않는다.
- [ ] AC-7: 잠금을 얻은 시각이 마감 이상이면 저장을 거절하고 collecting 상태를 closed로 확정한다. 마감 상태 저장은 제출 거절 때문에 롤백되지 않는다.
- [ ] AC-8: 이미지의 선택·드래그·비활성 상태와 선택 시간 요약을 확인한다. 모바일 터치 및 키보드로도 선택·해제·제출할 수 있는 조작을 제안하고 브라우저에서 검증한다.

각 AC의 근거와 확인 방법은 아래 TDD 적용 계획에 대응한다. OPEN 항목이 포함된 AC는 해당 결정 전 완료 처리하지 않는다.

## 데이터와 인터페이스

participant_available_slots를 도입하고 UNIQUE(participant_id,slot_start_at), FK RESTRICT, 30분 시각 제약을 적용한다. participants의 availability_submitted_at·availability_version을 사용한다. 현재 주·드래그·색상은 저장하지 않는다.

제안 Server Action submitAvailability({inviteToken,baseVersion,slots}), 응답 {version,slots,submittedAt} 또는 도메인 오류. 제출 값은 서버 시각·권한·현재 범위로 정규화한다. 중복 재시도 비교와 과거 슬롯 보존의 처리 순서는 명세 예제로 고정한다. 서버 상태 조회는 005의 조회 경계를 공유하며 004 단계에서는 본인·설정 정보로 시작한다.

공통 잠금·서버 시각·오류 계약·DB 테스트 기준은 [분해 계획](../spec-plan.md)의 공통 구현·검증 계약을 따른다. 참여자 인증이 필요한 경계에서는 서버가 약속 소속·세션·현재 역할·상태를 검사한다. 공개 링크 안내와 외부 챗봇은 각 경계의 공개 범위·호출 검증을 적용한다. 다른 참여자의 민감 정보를 오류에 포함하지 않는다.

## 구현 계획

슬롯 경계·과거 보존 → 제출 트랜잭션 → 충돌·재시도 → 로컬 입력·주 이동·폴링 → 브라우저 흐름 순서. 예정 apps/web/src/lib/availability/, src/actions/availability.ts, src/components/availability/, prisma/migrations/. 005는 이 모듈을 읽기만 한다.

한 동작의 실패 assertion을 실제 확인한 뒤 최소 구현·회귀 검증을 반복한다. 테스트 도구 오류나 DB 연결 실패는 RED로 인정하지 않는다.

## 검증 계획

- AC별 검증 경계·원본 근거는 아래 표를 따른다. 아직 테스트 파일·제품 기능을 생성하지 않았다.
- 단위 테스트 예정 명령: 프로젝트 루트에서 docker compose exec tools npm run test -- src/lib/availability/availability.test.ts.
- DB 통합 예정 명령: docker compose exec tools npm run test:integration -- src/lib/availability/availability.integration.test.ts. test:integration은 현재 없으며 001에서 분리 설정을 추가할 계획이다. DB 검증 항목이 없는 AC에 억지로 통합 테스트를 만들지 않는다.
- DB 변경이 있으면 전용 테스트 DB 보호 확인 → 로컬 마이그레이션 작성 → Client 생성 → 빈 테스트 DB에 기존 마이그레이션 적용 → 실제 제약·트랜잭션 검증 순서로 진행한다. 운영 적용은 별도 배포 요청 시 db:deploy로만 한다.
- 격리: TEST_DATABASE_URL과 테스트 DB 이름·로컬 호스트 허용 목록을 검사하고 개발·운영 URL을 거절한다. 동시성은 독립 연결과 동시 시작 장벽을 사용한다. 상세 구성은 분해 계획에 정의한다.
- 브라우저 동작·오류 복구·모바일을 실제 확인한다. 이미지가 있는 요소는 원본 1280×3042 참고 시트를 사용한다. 제품 화면 검수 크기는 390×844와 1280×800을 제안하며 디자인 원본 크기로 주장하지 않는다.
- 최종 검증: 관련 단위·DB·브라우저 회귀, Docker Node.js 24의 npm run lint, npm run typecheck, npm run build. 필요한 검증을 실행하지 못하면 미검증으로 남긴다.

## 미정 사항

OPEN-08 반복 사용은 승인 전 제외. 폴링 간격·키보드 조작은 구현 제안으로 정하고 스펙에 기록한다. 마감의 공통 판정은 이 단계부터 적용하며 005에서 조회·조기 마감 화면을 완성한다.

OPEN 항목의 제안은 [분해 계획](../spec-plan.md)에 있으며 사용자 확정 전 제품 규칙으로 고정하지 않는다.

## 결과

모든 AC 미검증. 문서 초안만 작성했으며 앱 구현·DB 변경·RED/GREEN 실행·외부 연동은 수행하지 않았다.

## TDD 적용 계획

| AC | TDD 구분·이유 | 공개 경계·수준 | 기대값의 원본 근거 | 예정 테스트 파일 또는 확인 방법 |
| --- | --- | --- | --- | --- |
| AC-1 | 필수 | 단위·실제 DB | DOC-002 §4.2·5.1·11 | src/lib/availability/availability.test.ts / src/lib/availability/availability.integration.test.ts |
| AC-2 | 필수 | 서비스·실제 DB | DOC-002 §3.3·6.2·8.2·11 | src/lib/availability/availability.test.ts / src/lib/availability/availability.integration.test.ts |
| AC-3 | 필수 | 실제 DB | DOC-002 §4·8.2 | src/lib/availability/availability.test.ts / src/lib/availability/availability.integration.test.ts |
| AC-4 | 필수 | 단위·실제 DB 동시성 | DOC-002 §8.2 | src/lib/availability/availability.test.ts / src/lib/availability/availability.integration.test.ts |
| AC-5 | 필수 | 단위·실제 DB | DOC-002 §5.2 | src/lib/availability/availability.test.ts / src/lib/availability/availability.integration.test.ts |
| AC-6 | 필수 | 컴포넌트·서비스·브라우저 | DOC-002 §8.2 | src/lib/availability/availability.test.ts / 해당 기능 브라우저 시나리오 |
| AC-7 | 필수 | 실제 DB 동시성·시간 | DOC-002 §8.2·11 | src/lib/availability/availability.test.ts / src/lib/availability/availability.integration.test.ts |
| AC-8 | 동작은 필수, 색상·배치 비교는 비대상 | 브라우저·시각 | DOC-003; DOC-001 §5 | src/lib/availability/availability.test.ts / 해당 기능 브라우저 시나리오 |

- 실제 실행 기록은 구현 시작 시 context/tdd/004-availability.md에 작성한다. 현재는 기록 파일을 만들지 않는다.
- 공개 경계는 데이터 읽기·변경 서비스와 사용자 조작이다. 구현 내부 구조를 복제하는 테스트를 만들지 않는다.
- 브라우저 자동화 도구는 아직 없다. 004에서 Playwright 도입을 제안하고, 이전 단계의 실제 수동 브라우저 확인과 구분한다. 색상·간격은 별도 시각 검수한다.

