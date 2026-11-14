# TDD 실행 기록: 004a-availability-repeat

- 스펙: [요일 반복](../features/004a-availability-repeat-spec.md)
- 기준점: main HEAD 9adb931. 기존 005 불러오기·004a 초안 문서 변경과 사용자 .vscode/ 보존.
- 정책: 2026-11-14 사용자 요일 반복 확정. 날짜 직접 선택은 후속.
- 경계: 반복 슬롯 계산 함수, 실제 브라우저의 반복 적용·취소·이력·서버 동기화·제출.
- 정적 색상·배치는 TDD 비대상, 화면 검수. DB 모델/서버 변경은 계획 없음.

## AC와 검증 연결

| AC | 관찰할 동작 | 테스트 |
| --- | --- | --- |
| 1~3 | KST 요일·기간 전체·30분 원본 보존·합집합·미래/범위 경계 | src/components/availability/repeat.test.ts |
| 4~5 | 로컬 적용·취소·되돌리기/복구·명시 제출·중복 이력 방지 | e2e/availability.spec.ts 반복 시나리오 |
| 6 | 마감·서버 버전/설정 변경 시 반복 대화상자 닫기 | 동일 브라우저 시나리오 |
| 7 | 모바일/PC 및 키보드·포커스 | 동일 브라우저 + 캡처 검수 |

## 반복 기록

아래 명령은 프로젝트 루트에서 실행하고 Docker의 Node.js 24를 사용한다. 실행 후 결과를 추가한다.

### 1. 요일 반복 계산 — AC-1~3

- 명령: `docker compose exec -T tools npm run test -- src/components/availability/repeat.test.ts`.
- 기본 복사 RED: exit 1, 원본 3개만 반환하여 기대 11개와 불일치. 최소 스텁의 동작 assertion 실패 확인.
- 기본 복사 GREEN: exit 0, 1개 통과. 원본 앞의 미래 날짜·마지막 날짜 포함, 떨어진 30분 구간·합집합·원본 불변·중복 적용 확인.
- 과거/일일 경계 RED: exit 1, 추가하면 안 되는 과거 및 현재 시각과 같은 대상 슬롯이 포함됨.
- 경계 GREEN: exit 0, 2개 통과. KST 자정·24:00 끝, 시작≤서버 현재 제외, 기존 과거 보존 및 축소 일일 범위 확인.

### 2. 반복 대화상자·편집 이력·제출 — AC-1·4·5·7

- 명령: `docker compose exec -T tools npm run test:browser -- e2e/availability.spec.ts --grep '요일 반복은 미제출'`.
- RED: exit 1, 요일 반복 버튼 없음. 동작 구현 후 개발 모드 재마운트의 close 이벤트로 창이 닫힘, 이어 Escape 후 포커스 복원 실패도 같은 시나리오에서 확인하고 보완했다.
- GREEN: exit 0, 1개 통과. 30분 두 구간을 1시간 보기에서도 정확히 복사, 2일/2시간 추가 예고, DB 자동 저장 없음, 한 번에 되돌리기·복구, 중복 적용 비활성, Escape 취소·포커스 복원, 제출 후 6슬롯 저장·재조회 확인.
- 320·393·1280px 대화상자 가로 경계·적용 버튼 화면 내 표시 검증 및 캡처 생성.

### 3. 서버 변경과 반복 창 동기화 — AC-6

- 명령: `docker compose exec -T tools npm run test:browser -- e2e/availability.spec.ts --grep '요일 반복 창은'`.
- RED: exit 1, 다른 기기의 제출을 읽고 본인 입력이 갱신돼도 반복 창이 열린 상태로 남음.
- GREEN: exit 0, 1개 통과. 기존 applySnapshot의 버전·설정·상태 변경 처리에 반복 창 닫기를 연결했다. 다른 기기 응답, 소요 시간 설정 변경, 마감 모두 창을 닫고 마감 후 반복 버튼은 비활성화한다.

### 기존 구현 사후 검증

- 모바일 터치에서 기준 날짜 변경·다른 패턴 표시·취소·닫기·원래 선택 보존은 추가 브라우저 시나리오로 검증한다. 신규 RED로 주장하지 않는다.
- 새 DB 모델·서버 코드는 없다. 반복 결과의 저장·정밀도·권한은 기존 004 제출 경계를 사용하고 실제 테스트 DB를 쓰는 브라우저에서 저장/재조회를 확인한다.

## 최종 검증

- `docker compose exec -T tools npm run test`: exit 0, 전체 단위 18개 통과(신규 반복 계산 2개 포함).
- `docker compose exec -T tools npm run lint`: 최종 코드 exit 0.
- 320×852·393×852·1280×800 캡처를 직접 열어 확인했다. 기존 파란색·글꼴/대화상자 규격과 맞췄고 요일·시간·적용 버튼 잘림 없음.
- 실제 iPhone Safari·Neon/Vercel은 미검증.

- `docker compose exec -T tools npm run test:browser`: exit 0, 전체 Chromium 36개 통과(004/004a 21개, 신규 반복 3개 포함). 외부 Origin 거절 로그는 기존 보안 시나리오의 의도된 결과이며 해당 테스트도 통과했다.
- `docker compose exec -T tools npm run typecheck`: exit 0.
- 기존 개발 서버만 확인 후 SIGTERM → `docker compose exec -T tools npm run build`: exit 0. 빌드 후 개발 서버를 다시 실행했다.
- 별도 DB 통합 스위트는 이번 클라이언트 변경에서 재실행하지 않았다. 서버/스키마 변경은 없으며 신규 저장 흐름은 격리 PostgreSQL을 사용하는 브라우저 테스트로 검증했다.
- 문서/코드 `git diff --check` 통과. 000~004 완료 이력 원문과 사용자 .vscode/ 보존 확인. 커밋·푸시·Notion은 이번 요청 범위에 포함하지 않았다.

## 2026-11-14 후속 변경 — 한 주 반복

- 사용자 결정: 모바일의 현재 주간 화면을 기준으로 한 주 반복으로 변경한다. 이전 요일 반복의 실행 기록은 위에 보존한다.
- 현재 주의 요일별 시간을 선택한 대상 주에 추가, 현재 주 제외, 범위 밖/과거 제외, 명시적 제출·되돌리기 유지.
- 새 정책에 맞춰 기존 반복 테스트의 기대값을 교체하며 실제 실패부터 확인한다. Git 기준점과 기존 미커밋 변경은 동일하다.

### 주간 계산 RED → GREEN

- 명령: `docker compose exec -T tools npm run test -- src/components/availability/repeat.test.ts`.
- 기본 RED exit 1: 스텁이 원본만 반환하여 서로 다른 월·수 시간의 대상 주 복사가 누락됨.
- 기본 GREEN exit 0, 1개 통과: 선택한 두 주에만 복사, 선택하지 않은 중간 주 보존, 합집합·중복 적용·원본 불변 확인.
- 경계 RED exit 1: 약속 시작일 이전·끝 이후와 서버 현재 시각에 해당하는 슬롯까지 복사됨.
- 경계 GREEN exit 0, 2개 통과: 첫/마지막 일부 주, 기준 주보다 앞인 미래 주, KST 자정/24시·연도 경계, 과거 및 일일 경계·기존 슬롯 보존 확인.

### 주간 화면 변경 RED

- 명령: `docker compose exec -T tools npm run test:browser -- e2e/availability.spec.ts --grep '이번 주 반복은 미제출'`.
- RED exit 1: 새 계약의 이번 주 반복 버튼 없음. 요일 선택을 대상 주 체크박스로 대체하고 현재 주의 요일별 패턴을 표시한다.
- 기존 마감/설정/응답 변경 동기화·이력/저장은 유지하고 새 주간 흐름으로 회귀한다. 빈 현재 주·다른 대상 주 없음은 사후 경계 검증을 추가한다.

### 주간 화면 GREEN·회귀

- `docker compose exec -T tools npm run test:browser -- e2e/availability.spec.ts --grep '이번 주 반복'`: exit 0, 3개 통과. 기준 주 고정·대상 주 선택·추가 미리보기·취소/복구·실제 제출/재조회·서버 변경 시 닫기 확인.
- `docker compose exec -T tools npm run test:browser -- e2e/availability.spec.ts`: exit 0, 시간표 관련 전체 22개 통과. 빈 현재 주 비활성·대상 주 없음 안내도 추가 확인했다.
- `docker compose exec -T tools npm run test`: exit 0, 전체 단위 18개 통과.
- `docker compose exec -T tools npm run lint`, `docker compose exec -T tools npm run typecheck`: 각각 exit 0.
- 320×852·393×852·1280×800 화면 캡처를 직접 열어 확인했다. 주 목록·요일별 원본 선택·적용 버튼 표시 확인. 긴 목록과 시간 패턴은 내부 스크롤로 제한한다.
- 이번 변경은 클라이언트만 대상으로 하므로 관련 브라우저 22개를 회귀했다. 앞선 요일 반복 당시의 전역 36개 기록과 구분한다. 별도 DB 통합 스위트 재실행은 없고 저장은 격리 PostgreSQL 기반 브라우저에서 확인했다.

- `docker compose exec -T tools npm run build`: exit 0. 기존 개발 서버만 잠시 중지하고 빌드 후 다시 실행했다.

## 2026-11-14 반복 창 정보 정리

- 새 동작: 요일별 시간은 기본 접힘, 키보드 Enter/모바일 탭으로 필요할 때 펼친다. 정책·복사 계산은 유지한다. 설명·상자·중복 수치를 줄인 정적 배치는 TDD 비대상으로 화면 검수했다.
- RED: `docker compose exec -T tools npm run test:browser -- e2e/availability.spec.ts --grep '이번 주 반복은 미제출'`, exit 1. 상세 시간이 초기부터 visible이라 기본 접힘 기대와 불일치.
- GREEN: `docker compose exec -T tools npm run test:browser -- e2e/availability.spec.ts --grep '이번 주 반복'`, exit 0, 4개 통과. 키보드 접기/펼치기, 모바일 상세 열기, 주 선택/적용/제출, 취소/복구, 서버 변경/마감, 빈 주 경계 유지 확인.
- `npm run lint`·`npm run typecheck` Docker 실행 각각 exit 0. 계산·서버 변경이 없어 단위/DB 전체 스위트는 재실행하지 않았다.
- 새 320·393px 캡처를 직접 확인했다. 모달에서 기준 주·대상 주·버튼이 한 화면에 들어오고 시간 상세는 접힌 상태다. 1280px 캡처 생성 및 화면 경계/적용 버튼 브라우저 검사도 통과했다.
- `docker compose exec -T tools npm run build`: exit 0. 개발 서버를 재시작했다. `git diff --check`와 기존 완료 이력 보존 검사 통과.

## 2026-11-14 전체 선택 및 대상 목록 정리

- 전체 선택/해제 버튼 RED: 관련 브라우저에서 버튼 없음으로 exit 1. 구현 후 반복 관련 4개·린트 exit 0.
- 이어진 사용자 요청으로 전체 선택/직접 선택 전환을 구현한다. 기본 전체 선택에서 목록은 접고 직접 선택 때 펼친다. 부분 선택 보존·미리보기·모드별 적용·키보드/터치를 기존 시나리오에서 검증한다. 앞선 전체 선택 버튼 검증과 구분한다.

- 전체/직접 선택 RED: `docker compose exec -T tools npm run test:browser -- e2e/availability.spec.ts --grep '이번 주 반복은 미제출'`, exit 1. 기본 선택된 전체 선택 라디오가 없음.
- GREEN: `docker compose exec -T tools npm run test:browser -- e2e/availability.spec.ts --grep '이번 주 반복'`, exit 0, 4개 통과. 전체 기본값/목록 접힘·직접 선택 펼침·부분 선택 유지·다시 전체 전환·빈 선택 비활성·키보드/터치·명시 저장/복구·서버 갱신/마감 경계 확인.
- 최종 코드 린트 exit 0. 계산·서버 변경 없음. 새로운 UI 동작에 해당하는 브라우저 회귀를 실행했고 단위/DB 전체는 재실행하지 않았다.
- 320·393px 기본 전체 선택 화면을 직접 확인했다. 1280px 캡처 및 화면 경계/버튼 검증 통과. 실제 iPhone Safari는 미검증.
- 최종 `docker compose exec -T tools npm run typecheck`·`npm run build` 각각 exit 0. 빌드 후 개발 서버 재실행. 문서 diff 검사·완료 이력 보존 확인.
