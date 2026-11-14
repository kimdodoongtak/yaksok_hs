# 004 가능 시간 선택과 제출 요구사항 검토

- 검토일: 2026-11-14. 요청: `$feature 검토`.
- 기준: main / `cb716dbf6fcd4bafd82f4da3d1ae114f2cccf9b1`. tracked diff와 미추적 004 소스·마이그레이션·테스트를 함께 검토했다. 사용자 `.vscode/`는 제외했다.
- 결과: 현재 승인 범위에서 수정이 필요한 기능 결함을 확인하지 못했다. 상태는 **검토 중**이며 다음은 최종 전체 회귀다. 완료·커밋·푸시는 수행하지 않았다.
- 이번 변경은 검토 기록과 상태·요구사항 문서 정리뿐이다. 제품 코드와 테스트 파일은 수정하지 않았다.

## 발견사항

### 문서의 이전 UI 요구사항 잔존 — 이번 검토에서 정리

AC-8에 삭제하기로 한 선택 시간 요약이 남아 있고, 화면 변경 이력에는 오늘 버튼·아이콘 아래 설명·주 단위 전용 초기화가 섞여 있었다. 이는 사용자 후속 결정으로 바뀐 항목이며 구현 누락이 아니다. AC-8을 최신 결정으로 갱신하고, 이전 화면 설명이 시간순 이력임을 표시했다. 상태와 다음 작업도 검토 단계로 맞췄다.

추가 구현을 요구하는 확정 결함은 없다. 아래 판정은 제공된 스펙·최신 사용자 결정과 로컬 검증 범위에 한한다.

## 수용 기준 대조

| 수용 기준 | 충족 여부 | 근거 | 남은 작업 |
| --- | --- | --- | --- |
| AC-1 30분·날짜·하루 전체 범위 | 충족 | `lib/availability/policy.ts`의 normalizeSlots, 23:00 종료 거절·24:00 경계 허용 단위 테스트, DB CHECK | 최종 전체 회귀 |
| AC-2 본인 인증·상태·빈 제출 | 충족 | `participant-access/session.ts`, service.submit; 타 약속·비활성·인증 부재 거절, 빈 제출 시 제출 상태 저장 | 최종 전체 회귀 |
| AC-3 원자 저장·중복·버전 | 충족 | service.submit의 트랜잭션, 복합 UNIQUE; 실제 PostgreSQL 저장·강제 실패 롤백 검증 | 최종 전체 회귀 |
| AC-4 충돌·동일 결과 재시도 | 충족 | baseVersion/정규화 집합 비교, Route 409; 독립 연결의 동시 제출·재시도 및 브라우저 응답 유실 검증 | 최종 전체 회귀 |
| AC-5 과거 요청 무시·저장된 과거 보존 | 충족 | normalizeSlots의 저장된 과거 우선 보존; 고정 시각 단위·DB, 전체 초기화 후 과거만 남는 실제 저장 검증 | 최종 전체 회귀 |
| AC-6 본인 변경·설정 갱신 | 충족 | editor.applySnapshot/refresh, 버전·settings 비교, 다른 참여자와 늦은 GET 무시, 계정 전환 처리 | 최종 전체 회귀 |
| AC-7 잠금 획득 후 마감·closed 커밋 | 충족 | requireParticipantSession의 약속 잠금 뒤 clock_timestamp, 마감 상태 저장 후 결과 반환; 독립 연결의 실제 잠금 대기 테스트 | 최종 전체 회귀 |
| AC-8 최신 UI·터치·키보드 | 충족(Chromium) | use-slot-drag, editor, edit-button; 주 이동·손가락 드래그·취소·자동 스크롤·방향키·축척·부분 선택 검증, 320/393/1280px 검수 | 실제 iPhone Safari는 미검증 |
| 후속 결정: 되돌리기·복구·주/전체 초기화 | 충족 | 작업 단위 이력과 새 편집 시 복구 분기 폐기; 제출/서버 갱신 시 이력 제거, 취소/Escape·초점 복귀·빈 주 초기화·과거 보존·제출 전 DB 유지 검증 | 최종 전체 회귀 |

파일 경로의 소스 루트는 `apps/web/src/`다. 테스트는 `apps/web/src/lib/availability/availability.test.ts`, `availability.integration.test.ts`, `apps/web/e2e/availability.spec.ts`에 있다.

## 구조·데이터·TDD 검토

- Action과 HTTP POST는 서버 쿠키에서 본인을 정한다. expectedParticipantId는 다른 탭 로그인 전환을 감지하는 전제조건이며 저장 대상 지정에 쓰지 않는다. same-origin 검사, private/no-store, Vary: Cookie를 확인했다.
- 서버 서비스·런타임은 server-only다. 클라이언트 snapshot에는 본인 선택·제출 상태와 약속 설정만 전달하며 PIN 해시·세션 토큰·다른 참여자의 선택은 포함하지 않는다.
- 약속 행을 먼저 잠그고 인증·시간을 판정한 뒤 슬롯·제출 시각·버전을 함께 변경한다. 조회는 마감 효과만 반환하며 closed 상태를 쓰지 않는다. 003의 공통 세션 로직 추출은 기존 판정 순서를 보존한다.
- 신규 테이블은 UUID PK, 참여자/시각 UNIQUE, FK RESTRICT, KST 00/30분·초 0 CHECK를 갖는다. 신규 의존성은 없다.
- TDD 기록의 실제 RED→GREEN과 구현 후 통과한 사후 검증을 구분했다. fixture 오류·잘못된 테스트 조회는 제품 RED로 세지 않는다. 초기화의 과거 보존 등 사후 검증도 별도로 명시돼 있다.
- 테스트의 DB 제약·트랜잭션은 실제 격리 PostgreSQL을 사용한다. 동시성은 독립 연결과 장벽, 마감 경쟁은 pg_stat_activity의 잠금 대기를 확인한다. 브라우저 route 제어는 응답 유실·지연 재현용이며 저장 서비스 자체를 대역으로 교체하지 않는다. skip/todo 없음.
- 005의 참여자별/전체 시간 비교·후보, 007 설정 변경 실행, OPEN-08 날짜별 반복은 아직 승인된 현재 구현 범위가 아니므로 결함으로 세지 않았다.

## 이번 검토의 실행 근거

Docker Node.js 24, 로컬 격리 `sdd_test`. 아래 명령은 `docker compose exec -T tools` 뒤에서 실행했다.

| 명령 | 결과 |
| --- | --- |
| `npm run test -- src/lib/availability/availability.test.ts` | 2개 통과, exit 0 |
| `npm run test:integration -- src/lib/availability/availability.integration.test.ts` | 11개 통과, exit 0; pending migration 없음 |
| `npm run test:browser -- e2e/availability.spec.ts` | 18개 통과, exit 0 |

통합과 브라우저는 순차 실행했다. 현재 생성된 320px 편집 화면·393px 초기화창·1280px 화면을 직접 열어 확인했다. 마감·인증·다른 기기 갱신과 새 전체 초기화 시나리오까지 포함한다.

이번은 004 대상 검토 검증이며 프로젝트 전체 회귀나 `$feature 테스트` 단계 완료가 아니다. 직전 구현의 린트·타입 통과 기록은 유지하되, 이후 추가된 UI를 포함한 최종 운영 빌드·전역 회귀는 아직 재실행하지 않았다. 실제 iPhone Safari·Neon/Vercel 배포는 미검증이다.

## 다음 작업

`$feature 테스트`로 전체 단위·DB·브라우저·린트·타입·빌드를 최종 확인한다. 실패가 없으면 `$feature 완료`로 완료 판단할 수 있다. 검토 단계에서 새 제품 수정은 필요하지 않다.

## 후속 최종 검증 — 2026-11-14

사용자가 반복 적용을 미루고 현재 기능부터 진행하도록 요청하여 최종 전체 회귀를 수행했다. 단위 16개·실제 DB 48개·Chromium 33개·린트·타입·운영 빌드 모두 exit 0이다. 새로운 실패나 제품 수정은 없었다. 개발 서버 재시작 후 localhost:3001 HTTP 200 확인. 위 표의 최종 전체 회귀 항목은 충족했으며 다음은 완료 처리다. 실제 iPhone Safari·운영 배포는 미검증으로 유지한다. [실행 기록](../tdd/004-availability.md).

## 완료 처리 — 2026-11-14

최종 전체 검증 통과 후 사용자 `$feature 완료` 요청으로 004를 완료했다. 최초 검토의 남은 전체 회귀는 후속 검증으로 충족했으며 미해결 제품 결함은 없다. 기존 검토·검증 시점 기록은 보존한다.
