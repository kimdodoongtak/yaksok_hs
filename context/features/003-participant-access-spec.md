# 참여자 등록과 약속별 재인증

## 식별자와 상태

- 스펙 ID: 003-participant-access
- 상태: 확인 필요
- 작성 기준: 2026-11-05, 제품 구현·검증 전 초안.
- 요구사항: REQ-005~006, REQ-009~010, REQ-032~033, REQ-035. 흐름: FLOW-005~006. 식별자는 [분해 계획](../spec-plan.md)의 분석용 ID다.

## 근거 자료

- DOC-001 §4 MEMBER-03-02·MEMBER-04-02·MEMBER-05-01·MEMBER-06-01·MEMBER-06-03, §5·9; DOC-002 §3.3·3.5·4·6.2·8.2·9·11.
- DOC-001: [PRD](../inputs/prd.md), 버전 미상. DOC-002: [ERD](../inputs/ERD.md), 문서상 작성일 2026-09-23. DOC-003: [Figma 참고 이미지](../inputs/피그마.png), 버전 미상.
- PRD·ERD 전체와 제공 이미지 확인. Figma 링크·node ID·원본 컴포넌트 속성은 미제공이며 MCP 조회는 수행하지 않았다. 별도 비즈니스 규칙·API 문서는 사용자에게 존재하지만 미제공·미확인이다.
- 충돌은 2026-11-05 사용자 결정에 따라 ERD를 우선한다. ERD에 없는 비충돌 PRD 규칙은 유지한다. 제안·미정은 원본 요구사항과 구분한다.
- 디자인 확인 범위: 등록·PIN 재인증·정원 초과 화면 미제공. 모바일 우선 폼을 제안한다.

## 사용자와 문제

참여자는 계정 가입 없이 닉네임·PIN으로 약속에 참여하고 다른 기기에서도 본인 응답에 접근한다.

## 목표와 범위

collecting 신규 참여, 방장·참여자 재인증, 여러 기기 세션, 현재 세션 로그아웃, 접근 제한. PIN 변경은 ERD에서 언급된 정책의 상세가 없어 OPEN-09로 분리한다. PIN·방장 권한 복구, 탈퇴 계정 복원, 전역 회원·카카오 로그인은 제공하지 않는다.

## 선행 작업

- [002-promise-settings](002-promise-settings-spec.md)

002의 collecting 약속과 001의 인증·정규화·세션 기반을 사용한다.

## 사용자 흐름

공유 링크 → 등록 또는 기존 닉네임·PIN 재인증 → 본인 시간 입력 진입. 정원 초과·마감·draft·취소·만료는 해당 안내로 종료한다. 인증 실패는 동일 문구로 표시하고 제한 중에는 재시도 가능 시점을 안내한다. 로그아웃 후 재인증 경로를 제공한다.

## 수용 기준

- [ ] AC-1: 신규 참여는 collecting·마감 전·정원 여유일 때만 가능하다. 한 자리 남은 정원에 두 동시 요청이 오면 한 명만 등록한다.
- [ ] AC-2: 정규화 닉네임은 약속 안에서 유일하며 탈퇴 행의 닉네임도 재사용하지 않는다. 서로 다른 약속에는 같은 표시 이름을 사용할 수 있다. 001과 동일 입력 검증을 적용한다(2026-11-13 확정: trim·NFC 후 눈에 보이는 글자 기준 2~12자, 이모지 금지, 영문 대소문자 중복 구분 안 함, 내부 공백 유지).
- [ ] AC-3: 정확한 닉네임·PIN이면 해당 약속의 active 참여자로 재인증하고 여러 기기 세션을 허용한다. 다른 약속의 ID·세션을 본인 권한으로 사용할 수 없다.
- [ ] AC-4: 초대 링크 만료·세션 만료·참여 상태·현재 역할·약속 상태를 매 요청 검사한다. 2026-11-13 사용자 결정에 따라 링크 만료 시 기존 방장·참여자도 유효 세션·재인증으로 접근할 수 없으며 “만료된 약속입니다”만 표시한다. 본인 로그아웃은 현재 세션만 삭제하고 다른 기기 세션을 보존한다. 만료 세션은 인증 오류이며 취소된 약속의 일반 API 오류 우선순위는 OPEN-10을 따른다.
- [ ] AC-5: 약속·참여자·IP 기준 PIN 시도 제한과 동일 실패 메시지를 적용한다. PIN·세션 원문 및 해시를 로그·응답에 노출하지 않는다. 제한 수치·해제 시간은 OPEN-02 확정 후 검증한다.
- [ ] AC-6: HttpOnly·운영 HTTPS·안전한 쿠키·CSRF 방어를 적용하고 비정상 출처의 변경 요청을 거절한다. 자동 로그인은 응답 마감 후 7일까지이며 설정 완료 시 초안 세션을 그 시점까지 연장한다. 링크가 먼저 만료되면 세션 기한이 남아도 접근을 차단한다. 이후 마감 변경·재조율 시 기존 세션 갱신은 OPEN-03의 남은 항목이다.
- [ ] AC-7: PIN 분실·방장 권한 복구를 닉네임만으로 허용하지 않는다. 탈퇴·내보내기는 모든 본인 세션을 만료시키며 새 닉네임의 동일인 재가입 완전 차단은 MVP 보장에 포함하지 않는다.
- [ ] AC-8: 등록·재인증·입력 오류·제한·정원 초과·로그아웃을 모바일과 데스크톱에서 확인한다.

각 AC의 근거와 확인 방법은 아래 TDD 적용 계획에 대응한다. OPEN 항목이 포함된 AC는 해당 결정 전 완료 처리하지 않는다.

## 데이터와 인터페이스

participants·participant_sessions를 재사용한다. 제안 Server Action joinPromise({inviteToken,nickname,pin}), authenticateParticipant(...), logoutParticipant({inviteToken}). 인증 성공은 필요한 본인 정보만 반환한다. 조회는 서버 전용 접근 계층을 사용하고 비밀값을 클라이언트에 넘기지 않는다.

PIN 시도 제한은 Vercel 다중 인스턴스에서도 공유되어야 한다. 저장소·원자적 카운트 방식은 구현 전 기술 설계로 정한다. 새 인프라나 보안용 테이블이 필요하면 이유를 기록하고 도메인 5개 테이블과 구분한다. 인메모리 제한만으로 운영 검증을 통과 처리하지 않는다.

공통 잠금·서버 시각·오류 계약·DB 테스트 기준은 [분해 계획](../spec-plan.md)의 공통 구현·검증 계약을 따른다. 참여자 인증이 필요한 경계에서는 서버가 약속 소속·세션·현재 역할·상태를 검사한다. 공개 링크 안내와 외부 챗봇은 각 경계의 공개 범위·호출 검증을 적용한다. 다른 참여자의 민감 정보를 오류에 포함하지 않는다.

## 구현 계획

등록·정원 경쟁 → 재인증·기기별 세션 → 제한·CSRF·로그아웃 → 폼 순으로 TDD를 반복한다. 예정 apps/web/src/lib/participant-access/, src/actions/participant-access.ts, src/components/participant-access/. 공통 requireParticipant 경계는 후속 서버 진입점에서 사용한다.

한 동작의 실패 assertion을 실제 확인한 뒤 최소 구현·회귀 검증을 반복한다. 테스트 도구 오류나 DB 연결 실패는 RED로 인정하지 않는다.

## 검증 계획

- AC별 검증 경계·원본 근거는 아래 표를 따른다. 아직 테스트 파일·제품 기능을 생성하지 않았다.
- 단위 테스트 예정 명령: 프로젝트 루트에서 docker compose exec tools npm run test -- src/lib/participant-access/participant-access.test.ts.
- DB 통합 예정 명령: docker compose exec tools npm run test:integration -- src/lib/participant-access/participant-access.integration.test.ts. test:integration은 현재 없으며 001에서 분리 설정을 추가할 계획이다. DB 검증 항목이 없는 AC에 억지로 통합 테스트를 만들지 않는다.
- DB 변경이 있으면 전용 테스트 DB 보호 확인 → 로컬 마이그레이션 작성 → Client 생성 → 빈 테스트 DB에 기존 마이그레이션 적용 → 실제 제약·트랜잭션 검증 순서로 진행한다. 운영 적용은 별도 배포 요청 시 db:deploy로만 한다.
- 격리: TEST_DATABASE_URL과 테스트 DB 이름·로컬 호스트 허용 목록을 검사하고 개발·운영 URL을 거절한다. 동시성은 독립 연결과 동시 시작 장벽을 사용한다. 상세 구성은 분해 계획에 정의한다.
- 브라우저 동작·오류 복구·모바일을 실제 확인한다. 이미지가 있는 요소는 원본 1280×3042 참고 시트를 사용한다. 제품 화면 검수 크기는 390×844와 1280×800을 제안하며 디자인 원본 크기로 주장하지 않는다.
- 최종 검증: 관련 단위·DB·브라우저 회귀, Docker Node.js 24의 npm run lint, npm run typecheck, npm run build. 필요한 검증을 실행하지 못하면 미검증으로 남긴다.

## 미정 사항

OPEN-01은 2026-11-13 확정했다. 남은 항목은 OPEN-02 PIN 제한, OPEN-03의 이후 마감 변경·재조율 세션 갱신, OPEN-09 PIN 변경 범위, OPEN-10 취소·인증 오류 우선순위. 기존 비즈니스 규칙·API 문서는 미제공 상태다.

OPEN 항목의 제안은 [분해 계획](../spec-plan.md)에 있으며 사용자 확정 전 제품 규칙으로 고정하지 않는다.

## 결과

모든 AC 미검증. 문서 초안만 작성했으며 앱 구현·DB 변경·RED/GREEN 실행·외부 연동은 수행하지 않았다.

## TDD 적용 계획

| AC | TDD 구분·이유 | 공개 경계·수준 | 기대값의 원본 근거 | 예정 테스트 파일 또는 확인 방법 |
| --- | --- | --- | --- | --- |
| AC-1 | 필수 | 실제 DB 동시성 | DOC-002 §6.2·8.2·11 | src/lib/participant-access/participant-access.test.ts / src/lib/participant-access/participant-access.integration.test.ts |
| AC-2 | 필수 | 단위·실제 DB | DOC-002 §3.3·4; DOC-001 MEMBER-05-01 | src/lib/participant-access/participant-access.test.ts / src/lib/participant-access/participant-access.integration.test.ts |
| AC-3 | 필수 | 단위·실제 DB | DOC-001 MEMBER-04-02; DOC-002 §3.5·9 | src/lib/participant-access/participant-access.test.ts / src/lib/participant-access/participant-access.integration.test.ts |
| AC-4 | 필수 | 단위·실제 DB | DOC-002 §3.5·9·11 | src/lib/participant-access/participant-access.test.ts / src/lib/participant-access/participant-access.integration.test.ts |
| AC-5 | 필수 | 단위·실제 저장소 | DOC-001 §5·9; DOC-002 §9 | src/lib/participant-access/participant-access.test.ts |
| AC-6 | 필수 | 서비스·브라우저 | DOC-001 MEMBER-06-03·§5; DOC-002 §9 | src/lib/participant-access/participant-access.test.ts / 해당 기능 브라우저 시나리오 |
| AC-7 | 필수 | 서비스·008 연계 회귀 | DOC-002 §9·11 | src/lib/participant-access/participant-access.test.ts |
| AC-8 | 동작은 필수, 색상·배치 비교는 비대상 | 브라우저·시각 | DOC-001 §5 | src/lib/participant-access/participant-access.test.ts / 해당 기능 브라우저 시나리오 |

- 실제 실행 기록은 구현 시작 시 context/tdd/003-participant-access.md에 작성한다. 현재는 기록 파일을 만들지 않는다.
- 공개 경계는 데이터 읽기·변경 서비스와 사용자 조작이다. 구현 내부 구조를 복제하는 테스트를 만들지 않는다.
- 브라우저 자동화 도구는 아직 없다. 004에서 Playwright 도입을 제안하고, 이전 단계의 실제 수동 브라우저 확인과 구분한다. 색상·간격은 별도 시각 검수한다.

