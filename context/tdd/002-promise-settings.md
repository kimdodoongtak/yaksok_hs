# TDD 실행 기록: 002-promise-settings

- 스펙: `context/features/002-promise-settings-spec.md`
- 작업 기준점: 2026-11-13 `main`, HEAD `62f7f91bfb340edd893c493e0bbea7e023e7b36b`. 기존 정책 문서 변경 5개와 미추적 `.vscode/`, `context/inputs/디자인 레퍼런스/`를 보존한다.
- 테스트 경계: 설정 검증 공개 함수 / 모집 시작 서비스 / Server Action / 실제 PostgreSQL / 브라우저 UI
- 적용 구분: AC-1~7의 입력·권한·상태·시간·경쟁·사용자 흐름은 TDD 필수. 색상·간격·정적 배치는 TDD 비대상이며 실제 화면으로 검수한다.
- 현재 상태: 완료 — 2026-11-14 사용자 완료 요청, 재검토·최종 검증 근거 확인 및 완료 이력 반영

## AC와 검증 연결

| AC | 원본 규칙·근거 | 관찰할 동작·기대값 | 수준·테스트 경로 | 실행 명령 | 상태 |
| --- | --- | --- | --- | --- | --- |
| AC-1 | DOC-001 STATE-03-01; DOC-002 §6·8.2; 2026-11-13 세션 결정 | 방장만 유효한 설정으로 draft를 collecting으로 원자 전환하고 세션을 마감+7일까지 연장 | 서비스·실제 DB `src/lib/promise-settings/promise-settings.integration.test.ts` | `docker compose exec tools npm run test:integration -- src/lib/promise-settings/promise-settings.integration.test.ts` | 구현 단계 통과 |
| AC-2 | DOC-002 §3.2·4.2·6.3·11 | 정원 2·30 허용, 1·31·현재 active 미만 거절 | 단위·실제 DB | 단위·통합 명령 | 구현 단계 통과 |
| AC-3 | DOC-002 §3.2·4.2·5.1 | 30분 단위, 24:00=1440, 시작<종료, 소요 시간 범위 검증 | 단위 `src/lib/promise-settings/promise-settings.test.ts`·실제 DB | `docker compose exec tools npm run test -- src/lib/promise-settings/promise-settings.test.ts` | 구현 단계 통과 |
| AC-4 | DOC-001 STATE-03-01; DOC-002 §4.2; OPEN-05 확정 | KST 오늘 이후, 달력 3개월·양끝 포함 90일 중 이른 상한 적용 | 단위·실제 DB | 단위·통합 명령 | 구현 단계 통과 |
| AC-5 | DOC-002 §5.2·8.2; DOC-001 TIME-13-02; OPEN-06 확정 | 미래 마감이며 마감 뒤에 소요 시간 전체가 들어가는 30분 경계 시작 시각이 남음 | 단위·서비스 | 단위·통합 명령 | 구현 단계 통과 |
| AC-6 | DOC-002 §6·8.2·10 | 중복 시작·초안/링크 만료 경쟁을 최신 잠금 상태로 차단 | 실제 DB 동시성 | 통합 명령 | 구현 단계 통과 |
| AC-7 | DOC-001 §5; DOC-003 DayCell·MonthCalendar | 모바일에서 입력·필드 오류·모집 시작·링크 복사가 가능 | Playwright `e2e/promise-settings.spec.ts`·실제 화면 | `docker compose exec tools npm run test:browser -- e2e/promise-settings.spec.ts` | 구현 단계 통과 |

## 반복 기록

### 2026-11-14 검토 보완 · AC-5·7 기본 마감과 직접 입력 구분

- 기준점: `main`, HEAD `62f7f91`. 기존 미커밋 002 작업과 사용자 `.vscode/`를 보존했다. 발견 근거는 [002 검토 기록](../fixes/002-promise-settings-review.md)에 있다.
- RED: Docker `npm run test:browser -- e2e/promise-settings.spec.ts --grep '시작일을 바꾸면'` 종료 1. 시작일 11월 28일 선택 후 기본 마감은 12월 5일이어야 하지만 11월 21일로 남아 `toHaveValue`가 실패했다.
- GREEN: 시작일 기반 공통 기본 마감 함수, 폼의 마감 상태와 직접 편집 여부를 추가했다. Docker `npm run test:browser -- e2e/promise-settings.spec.ts` 종료 0, 3개 통과. 미편집 마감의 최초·반복 갱신, 직접 입력 후 정원 서버 오류·시작일 변경에도 보존, 실제 DB 저장을 검증했다. 기존 단계 오류 복구·세션/쿠키 연장·티켓·링크 복사도 통과했다.
- 추가 경계 검증: GREEN 뒤 공통 함수의 월말·연말·윤년과 빈/잘못된 날짜 단위 테스트를 보강했다. 이 단위 테스트 자체는 사후 회귀다. Docker `npm run test` 종료 0, 4파일 12개 통과.
- 정적 검사: Docker `npm run lint`, `npm run typecheck`, `npm run build` 모두 종료 0.
- 전체 화면 회귀: Docker `npm run test:browser` 종료 0, 9개 통과. 다른 Origin의 Server Action 거부 로그는 기존 테스트의 예상 차단 결과다.
- 범위: 저장 서비스·권한·DB 스키마·운영 연결은 변경하지 않았다. DB 전용 통합 테스트는 이번 수정에서 재실행하지 않았으며 직전 22개 통과 근거를 유지한다. 실제 iPhone Safari는 미검증이다.

| 순서·AC·테스트 | RED 명령·종료 코드·실패 이유 | GREEN 명령·종료 코드·결과 | 정리·회귀 검증 | 남은 사항 |
| --- | --- | --- | --- | --- |
| 1 · AC-2 · 정원 경계 | `docker compose exec tools npm run test -- src/lib/promise-settings/promise-settings.test.ts` · 종료 1 · 허용값 2에서 빈 검증 결과가 반환되어 기대 `ok:true`와 불일치 | 같은 명령 · 종료 0 · 1테스트 통과, 정수 2·30 허용 및 빈 값·1·31·소수 거절 | 현재 공개 함수 테스트 재실행 통과 | 현재 active 인원 비교는 DB 서비스 반복에서 검증 |
| 2 · AC-3 · 하루 시간·소요 시간 | 같은 단위 명령 · 종료 1 · 00:00~24:00 입력을 기존 임시값 540·1080으로 반환해 0·1440 기대와 불일치 | 같은 명령 · 종료 0 · 2테스트 통과, 30분 단위·24:00 변환·순서·소요 범위 경계 확인 | 정원 회귀 포함 통과 | 실제 DB CHECK는 통합 반복에서 검증 |
| 3 · AC-4 · KST 날짜 범위 | 같은 단위 명령 · 종료 1 · 과거 시작일이 `ok:true`로 허용되어 실패 | 같은 명령 · 종료 0 · 3테스트 통과, KST 오늘·달력 3개월 월말 보정·양끝 포함 90일·순서·실재 날짜 확인 | 정원·시간 회귀 포함 통과 | DB DATE·90일 CHECK는 통합 반복에서 검증 |
| 4 · AC-5 · 응답 마감과 남은 시작 시각 | 같은 단위 명령 · 종료 1 · 빈 마감을 임시 Date 변환으로 허용해 `ok:true` 반환 | 같은 명령 · 첫 GREEN에서 새 규칙과 무관한 월말 예시의 과거 마감이 드러나 독립된 미래 마감으로 교정, 재실행 종료 0 · 4테스트 통과 | 정원·시간·날짜 회귀 포함 통과 | 잠금 뒤 서버 시각 재검증은 통합 반복에서 확인 |
| 5 · AC-1 · 설정·상태·세션 원자 갱신 | 격리 DB 통합 명령 · 종료 1 · 서비스 스텁이 `NOT_IMPLEMENTED`를 반환해 collecting·마감+7일 기대와 불일치 | 같은 명령 · 종료 0 · 1테스트 통과, 실제 PostgreSQL에서 설정·상태·현재 세션 갱신과 `ready` 조회 확인 | 기존 3개 마이그레이션 적용 상태에서 통과, 새 마이그레이션 불필요 | 실패 롤백·권한·경쟁 경계 검증 남음 |
| 6 · AC-1·6 · 만료 초안 정리 | 같은 통합 명령 · 종료 1 · `DRAFT_EXPIRED`는 반환했지만 약속 행이 남아 `null` 기대와 불일치 | 같은 명령 · 종료 0 · 2테스트 통과, 본인 방장 세션의 만료 초안만 세션→참여자→약속 순서로 정리하고 링크 보존 | 원자 저장 회귀 포함 통과 | 위조 세션·링크 만료·경쟁 검증 남음 |
| 7 · AC-1·7 · 설정 폼·모집 시작·복사 | `docker compose exec tools npm run test:browser -- e2e/promise-settings.spec.ts` · 종료 1 · `하루 시작` 필드가 없어 요소 탐색 실패 | 폼·Action·쿠키·복사 UI 구현 뒤 오류 locator 중복과 오류 후 폼 초기화를 각각 실제 실패로 발견해 선택자와 입력 보존을 보완, 재실행 종료 0 · 1테스트 통과 | DB collecting 값·세션/쿠키 동일 만료·클립보드 URL·390px overflow 확인 | 전체 브라우저 회귀 남음 |
| 8 · AC-7 · DayCell·MonthCalendar 상태 | 같은 브라우저 명령 · 종료 1 · `날짜 범위 달력` grid가 없어 실패 | 달력 추가 뒤 비활성 날짜가 `gridcell` 역할이라 잘못된 테스트 선택자를 실제 속성 선택자로 교정, 재실행 종료 0 · 달력 클릭으로 시작·종료 입력 동기화 통과 | 390×844·1280×800 스크린샷에서 과거 비활성·오늘 윤곽선·선택 파란색·7열·월 이동과 overflow 없음 확인 | 전체 브라우저 회귀 남음 |
| 9 · AC-2·4·5 · 화면 기본값 계산 | 단위 명령 · 종료 1 · 기존 함수 스텁이 빈 정원·날짜·마감을 반환해 정원 5명·KST 날짜 기대와 불일치 | 같은 명령 · 종료 0 · 5테스트 통과, 오늘·달력 한 달·월말 보정·7일 뒤 23:59 확인 | 기존 정원·시간·날짜·마감 검증 회귀 포함 통과 | UI 연결 검증 남음 |
| 10 · AC-2·3·4·5·7 · 기본값·스테퍼·시간 표기 | 브라우저 명령 · 종료 1 · 정원 입력이 빈 값이라 기본 5명 기대와 불일치 | 기본값·정원 스테퍼·더블클릭 입력·소요 시간 선택·문구 제거 구현. 첫 GREEN에서 ± 버튼도 `정원` label에 포함되어 테스트 선택자가 중복된 것을 `spinbutton`으로 교정, 재실행 종료 0 | 린트·타입 검사와 393×852 Chromium 통과, 중앙 기본 화살표 제거 후 재검증 | 전체 회귀 완료 |
| 11 · AC-3·7 · 소요 시간 시·분 스피너 | 브라우저 명령 · 종료 1 · 기존 드롭다운에는 `소요 시간` group과 `02 : 00` 시·분 표시가 없어 실패 | 파란 계열 시·분 스피너를 구현해 시간 ±60분·분 ±30분 조절과 hidden 분 값 120→150→120→180→120을 확인, 종료 0 | 393×852 실제 화면 확인 후 린트·타입·단위 11개·DB 22개·Chromium 7개·빌드 통과 | 없음 |

## 비대상·기존 동작 검증

### 2026-11-14 선택 조건 티켓과 세로 길이 조정

- 사용자 제공 종이 티켓 이미지에서 파란 잉크·따뜻한 종이·모서리 홈·절취선·바코드 형태를 참고했다. `SettingsTicket`으로 기존 날짜 범위·일일 시간 범위·소요 시간을 표현하고 `설정 중`을 표시한다. 장식은 aria-hidden이며 바코드는 스캔·공유 데이터가 아니다. 확정 후 항공권 공유는 006의 미래 아이디어로만 기록했다.
- 분류: 데이터·선택·저장 동작 변화 없는 표현 변경으로 TDD 비대상. 기존 설정 브라우저 회귀와 실제 캡처로 검수했다. `docker compose exec tools npm run test:browser -- e2e/promise-settings.spec.ts` 종료 0(2개), Docker 린트·타입·운영 빌드 종료 0.
- 후속 사용자 요청으로 세로 길이를 줄였다. 연도를 날짜 옆에 배치하고 티켓 본문·오른쪽 장식과 단계 제목·응답 마감 위 간격을 줄였다. 393×852에서 스크롤을 맨 위로 복원한 상태로 모집 시작 버튼 하단이 852px 이내인지 검사했다. 같은 브라우저 명령 종료 0(2개), 393·320px 캡처를 직접 확인했다. 높이 보정은 CSS와 여백 클래스 변경이므로 정적 검사·빌드는 추가 반복하지 않았다.
- 캡처: `apps/web/test-results/promise-settings-ticket-393.png`, `promise-settings-step-2-393.png`, `promise-settings-step-2-320.png`, `promise-settings-step-2-1280.png`. 단위·DB 전용 회귀와 실제 iPhone Safari는 이번 시각 변경에서 실행하지 않았다.

### 2026-11-13 숫자 앞 여백·전체 자간

- 후속 사용자 요청으로 자간만 변경 전 값으로 원복했다. 본문 normal·제목 tracking-tight·하루 시간 -0.03em·소요 시간 -0.04em, 숫자 앞 여백 4px 유지. 정적 스타일 원복이며 소스 대조와 diff 공백 검사만 수행하고 브라우저·기타 검증은 재실행하지 않았다.
- 사용자 요청으로 시작·종료 숫자에 앞 여백 4px을 추가했다. 이어 본문 자간 normal→0.02em, 제목의 tracking-tight 제거, 하루 시간 숫자 -0.03em→0.01em 및 소요 시간 숫자 -0.04em→0.01em으로 조정했다.
- 정적 CSS 변경으로 TDD 비대상. 여백만 변경 후 기존 모바일 시나리오 1개 통과, 전체 자간 변경 후 `docker compose exec tools npm run test:browser` 종료 0(8개). 320·393px 캡처에서 숫자·화살표 간 겹침과 가로 넘침이 없음을 직접 확인했다. `git diff --check`도 통과했다.
- 별도 구현 반복 테스트는 추가하지 않았다. 단위·DB 전용·린트·타입·운영 빌드는 이번 간격 변경에서 재실행하지 않았고 실제 iPhone Safari는 미검증이다.

### 2026-11-13 소요 시간 플립 시계 표시

- 사용자 제공 이미지의 두 숫자 카드·중앙 가로선·굵은 숫자를 참고했다. 소요 시간을 `02` 시간 / `30` 분처럼 표시하고 원래 ±30분 화살표 한 쌍을 유지했다. 정적 시각 변경이므로 TDD 비대상이며 별도의 애니메이션은 추가하지 않았다.
- 접근성: output의 이름은 `2시간 30분`으로 제공하며 기존 회귀도 화면 텍스트 전체 대신 접근 가능한 이름과 실제 제출 분 값을 함께 확인한다.
- 첫 브라우저 실행은 조절·표시·저장은 통과했으나 기존 브라우저 쿠키 만료 비교가 1초 허용 오차를 약 32ms 초과해 실패했다. 앞선 반복에서 재현된 타이밍 비교를 실제 저장 응답의 Set-Cookie Expires와 DB 만료의 정확한 일치 검사로 교정했다. 브라우저의 쿠키 수신 및 유효 만료 여부도 유지하며 쿠키 원문·토큰은 출력하지 않았다.
- 최종 `docker compose exec tools npm run test:browser -- e2e/promise-settings.spec.ts` 종료 0(2개). 린트·타입·운영 빌드 종료 0. 393·320px 캡처를 직접 확인했다. 단위·DB 전용 회귀와 실제 iPhone Safari는 이번 표시 변경에서 재실행하지 않았다.

### 반복 14 · AC-3·7 · 30분 직접 조절과 정렬

- 사용자 승인: 달력만 접고 하루 시작·종료·소요 시간은 항상 표시한다. 각 값 오른쪽에 위·아래 화살표 한 쌍을 두어 30분씩 변경하고 소요 시간은 `2시간 30분`으로 표기한다. 기존 2단계 입력 유지·검증·저장은 보존했다.
- RED: `docker compose exec tools npm run test:browser -- e2e/promise-settings.spec.ts -g '방장이 모바일'` 종료 1. 처음부터 소요 시간 30분 늘리기 버튼을 사용할 수 있어야 하지만 기존 접힌 편집기로 숨겨져 실패했다.
- GREEN: 공통 `TimeAdjustButtons`와 시작·종료별 직접 조절, 소요 시간의 단일 화살표 쌍을 구현했다. `npm run test:browser -- e2e/promise-settings.spec.ts` 종료 0(2개). 시작 09:30→10:00·00:00 하한, 종료 24:00↔23:30 상한, 소요 2시간→2시간 30분→3시간·30분 하한과 2단계 값 유지·오류 복구·실제 DB 저장을 확인했다.
- 정렬 피드백: 시작·종료 라벨을 박스 위로 옮기고 세 값의 글자 크기·세로 중앙·내부 여백과 오른쪽 화살표 위치를 통일했다. 작은 화면에서도 동일한 글자 크기 규칙을 적용했다. CSS 정렬은 TDD 비대상으로 실제 캡처를 검수한다.
- 검사: Docker 린트·타입·운영 빌드 종료 0. 정렬 후 브라우저 재실행에서 기존 쿠키 만료 비교가 1초 허용 오차를 약 6ms 초과해 실패했다. assertion과 앱 로직을 바꾸지 않고 같은 명령을 재실행해 2개 통과했다. 쿠키 비교의 타이밍 변동 가능성은 남아 있다.
- 범위: 서버 정책·DB 스키마 변경 없음. 이번 UI 변경에서는 단위·DB 전용 통합을 재실행하지 않았다. 실제 iPhone Safari는 미검증이다.
- 최종 시각 검수에서 시작·종료 사이 연결 화살표의 선택자가 `display: contents` 래퍼와 맞지 않아 아래로 밀리는 것을 발견했다. 명시적 CSS 클래스로 보정하고 `npm run test:browser -- e2e/promise-settings.spec.ts -g '방장이 모바일'` 종료 0(1개) 및 393px 캡처에서 숫자와 같은 높이를 확인했다. 캡처는 `apps/web/test-results/promise-settings-step-1-393.png`와 `promise-settings-step-1-320.png`다.

### 반복 13 · AC-7 · 2단계와 기본값 요약

- 사용자 승인: `1/2 날짜·시간 → 2/2 정원·응답 마감`, 날짜·소요 시간 요약과 필요한 항목 펼침. 기존 002 작업 트리와 사용자 `.vscode/`를 보존했다.
- RED: `docker compose exec tools npm run test:browser -- e2e/promise-settings.spec.ts` 종료 1. 첫 단계 제목 `언제 만날까요?`가 없어 실패했다.
- GREEN: 같은 명령 종료 0(1개). 접힌 기본값 요약, 다음·이전 이동, 헤딩 포커스, 날짜·하루 시간·소요 시간·정원·응답 마감 유지, 최종 서버 제출과 실제 DB 저장·링크 복사를 확인했다. 단계는 같은 폼에서 입력을 마운트한 채 숨겨 보존하며 DB 저장은 마지막 제출에서만 수행한다.
- 추가 오류 경로: `npm run test:browser -- e2e/promise-settings.spec.ts -g '단계별 오류'` 종료 1. 과거 날짜의 1단계 이동 차단·숨겨진 소요 시간 변조에 대한 서버 거절·해당 단계와 편집기 자동 열기·다른 입력 유지까지 통과했지만, 수정 후 다음으로 이동해도 이전 서버 오류 메시지가 남아 실패했다.
- 수정·회귀: 다음 이동에서 이전 오류 메시지를 지우고, 더 이상 사용하지 않는 3영역 배치 CSS를 제거했다. `docker compose exec tools npm run test:browser` 종료 0(8개). 위 오류 경로와 기존 초대·만료·나가기·보안 회귀를 포함한다. 다음 단계 이동 직후 DB 상태가 draft인 것도 확인했다.
- 최종 검사: Docker `npm run test` 종료 0(11개), `npm run lint` 종료 0(경고 0), `npm run typecheck` 종료 0, `npm run build` 종료 0. 서버 정책·스키마 변경이 없어 DB 전용 통합 회귀는 이번 변경에서 재실행하지 않았고, 브라우저 테스트에서는 격리 DB의 저장 결과를 확인했다.
- 시각: `test-results/promise-settings-step-1-393.png`, `promise-settings-step-2-393.png`, `promise-settings-step-1-320.png`, `promise-settings-step-1-1280.png`를 직접 열어 확인했다. 393px 기본 화면에서는 주요 설정과 다음 버튼이 852px 안에 들어오며 320·1280px에서도 가로 넘침이 없다. 실제 iPhone Safari와 화면 새로고침 후 미저장 초안 복원은 이번 검증 범위가 아니다.

### 반복 12 · AC-3·7 · 하루 시간 펼침형 선택기

- 기준점: `main` / `62f7f91`. 진행 중인 002 변경과 사용자 `.vscode/`를 보존했다.
- RED: `docker compose exec tools npm run test:browser -- e2e/promise-settings.spec.ts` 종료 1. 최초 입력 태그 전용 선택자는 기존 select도 검증할 수 있는 name 선택자로 교정했다. 재실행에서 기본값은 통과하고 `하루 시작` 버튼의 `aria-expanded=false`를 확인할 요소가 없어 실패했다. 이 두 번째 실패를 제품 동작의 RED 근거로 삼았다.
- GREEN: `DailyTimePicker`의 시작·종료 버튼, 하나만 펼치는 편집기, 시 ±1시간·분 00/30 선택, hidden 제출값, 필드 오류 연결, 닫기 시 포커스 복귀를 구현했다. 같은 명령 종료 0(1개). 09:00→10:30→09:30, 종료 24:00→23:30→24:00, 종료 상한 버튼 비활성, 오류 후 09:30·24:00 유지와 실제 DB 570·1440 저장 확인.
- 후속 경계·회귀: 시작 00:00 하한, Enter 열기·Escape 닫기와 시작 버튼 포커스 복귀, 320px 펼침 상태 가로 넘침 검사를 추가했다. `docker compose exec tools npm run test:browser` 종료 0(7개). 이 추가 경계 검증은 GREEN 이후 보강한 회귀다.
- 정적 검증: Docker `npm run lint`에서 버튼의 aria-invalid 미지원 경고를 발견해 data-invalid와 aria-describedby로 수정했다. 린트 재실행 종료 0(경고 0). `npm run typecheck`, `npm run build` 종료 0.
- 시각 검수: `test-results/promise-settings-time-editor-393.png`, `promise-settings-time-editor-320.png`를 직접 확인했다. 참고 이미지의 파란 선택색·연한 배경·얇은 테두리를 사용한다. 실제 Safari는 미검증이며 단위·DB 전용 회귀는 서버 정책 변경이 없어 이번 수정에서 재실행하지 않았다. 전체 브라우저 실행에서 기존 등록 화면 캡처의 caret-color hydration 경고는 재현됐고 모든 테스트는 통과했다.

| AC | 분류·이유 | 대체 검증 또는 사후 테스트 | 실제 결과·제한 |
| --- | --- | --- | --- |
| AC-7 색상·간격·정적 배치 | 제품 계산 동작이 아니므로 TDD 비대상 | iPhone 16 기준 393×852·1280×800 실제 Chromium 화면과 제공 참고 이미지의 DayCell·MonthCalendar 범위 비교 | 가로 넘침 없음. 과거 비활성·오늘 파란 윤곽선·선택 파란색·7열·월 이동, 정원 스테퍼와 파란 시·분 소요 시간 스피너를 실제 화면에서 확인. 전체 폼 배치는 미제공이므로 신규 제안 |
| AC-1·2·6 서비스 안전 경계 | 첫 원자 서비스 GREEN에 권한·현재 active 인원·트랜잭션·잠금 처리를 함께 둔 뒤 추가한 사후 회귀 | 격리 DB에서 위조 세션·링크 만료·active 3명보다 작은 정원·세션 UPDATE trigger 실패·독립 연결 동시 요청 확인 | 첫 실행 종료 0, 총 5테스트 통과. 롤백 뒤 draft/null 설정·기존 세션 만료 유지, 동시 성공 1건·실패 `NOT_DRAFT` 1건 확인 |

## 최종 검증

### 2026-11-14 사용자 `feature 테스트` — 최종 재실행

Docker Node.js **24.22.3**에서 현재 코드로 실행했다. AC-1~7의 구현 중 RED·GREEN, 보완 후 회귀, 정적 시각 검수와 사후 경계 테스트 구분을 확인했다. 건너뛴 테스트나 `only` 지정은 발견하지 않았다. 제품 코드는 변경하지 않았다.

| 검증 | 실제 명령·행동 | 결과 | 미실행 이유 |
| --- | --- | --- | --- |
| 전체 단위 | `docker compose exec tools npm run test` | 종료 0, 4파일 **12개** 통과 | 해당 없음 |
| 실제 PostgreSQL | `docker compose exec tools npm run test:integration` | 종료 0, 2파일 **22개** 통과. 격리 `sdd_test` 대상·역할 확인, 기존 마이그레이션 3개 적용 상태 확인, 미적용 없음 | 해당 없음 |
| 전체 브라우저 | `docker compose exec tools npm run test:browser` | 종료 0, Chromium **9개** 통과 | 해당 없음 |
| 린트 | `docker compose exec tools npm run lint` | 종료 0, 경고 없음 | 해당 없음 |
| 타입 검사 | `docker compose exec tools npm run typecheck` | 종료 0 | 해당 없음 |
| 운영 빌드 | `docker compose exec tools npm run build` | 첫 실행 종료 1, 브라우저 종료 후 단독 재실행 종료 0 | 아래 실행 충돌 기록 |
| 시각 검수 | 이번 E2E 생성 캡처 직접 열람 | 320px 날짜·시간 입력, 393px 모집 요약·초대 티켓, 1280px 모집 요약에서 잘림·겹침 없음. 393×852 헤더~모집 시작 버튼 높이와 320/393/1280px 가로 넘침 자동 검증 통과 | 실제 iPhone Safari는 미검증 |

- 빌드 첫 실패: 브라우저 테스트와 동시에 실행해 TypeScript가 `.next-browser/dev/types/*.ts` 파일을 수집하는 동안 테스트 서버가 파일을 재생성했다. `TS6053: File ... not found`로 종료 1. 브라우저 테스트의 완전 종료를 확인한 뒤 동일 빌드를 단독 재실행해 종료 0을 확인했다. 제품 코드·타입 설정은 변경하지 않았으며 [로컬 개발 안내](../../docs/local-development.md)에 순차 실행 지침을 추가했다.
- 통합 테스트는 롤백 검증용 trigger가 있어 브라우저와 순차 실행했다. 다른 Origin의 Server Action을 거부하는 브라우저 서버 오류 로그는 예상한 테스트 결과다.
- 이번 직접 확인한 캡처: `apps/web/test-results/promise-settings-step-1-320.png`, `promise-settings-step-2-393.png`, `promise-settings-mobile-393.png`, `promise-settings-step-2-1280.png`. 모두 Git 제외다. 색상·간격은 기존 참고 이미지 기준을 유지했으며 이번 실행에서 디자인을 변경하지 않았다.
- 결론: 필수 검증 통과, 남은 실패 없음. `feature 완료`로 완료 기록을 남길 수 있다. 현재 상태는 검토 중으로 유지하고 자동 완료·커밋·푸시는 하지 않았다.

### 2026-11-13 초기 구현 검증 이력

| 검증 | 실제 명령·행동 | 결과 | 미실행 이유 |
| --- | --- | --- | --- |
| 시작 기준 단위 회귀 | `docker compose exec tools npm run test` | 종료 0, 기존 3파일 6테스트 통과. Docker Node.js 24.22.3 | 해당 없음 |
| 전체 단위 | `docker compose exec tools npm run test` | 종료 0, 4파일 11테스트 통과 | 해당 없음 |
| 전체 실제 DB | `docker compose exec tools npm run test:integration` | 종료 0, 2파일 22테스트 통과. `sdd_test`와 비관리자 역할 확인, 3개 기존 마이그레이션 적용 | 해당 없음 |
| 전체 브라우저 | `docker compose exec tools npm run test:browser` | 종료 0, Chromium 7테스트 통과 | 해당 없음 |
| 린트 | `docker compose exec tools npm run lint` | 종료 0 | 해당 없음 |
| 타입 검사 | `docker compose exec tools npm run typecheck` | 종료 0, Next route type 생성 및 `tsc --noEmit` 통과 | 해당 없음 |
| 운영 빌드 | `docker compose exec tools npm run build` | 종료 0, Prisma Client 생성·Next.js 16.4.3 빌드 통과 | 해당 없음 |

## 결정·차단 사항

### 2026-11-14 모집 시작 후 초대 티켓·일회 도장

- 요구사항: 사용자 승인으로 설정 2단계의 조건은 간단한 요약으로 복원하고 모집 시작 뒤 초대 티켓을 보여준다. 저장된 날짜·일일 시간·소요 시간, `모집 중`, `초대 준비 완료` 도장을 표시한다. 성공 직후만 애니메이션을 실행하며 복사·재방문에는 정적 도장을 유지한다. AC-6·7의 저장 정보 조회·접근 권한·최초 표시·복사·재접속은 TDD 대상, 장식과 배치는 시각 검수 대상이다.
- RED: Docker `npm run test:browser -- e2e/promise-settings.spec.ts --grep '방장이 모바일'` 종료 1. 모집 성공 뒤 `region 초대 티켓`을 찾지 못했다. Docker `npm run test:integration -- src/lib/promise-settings/promise-settings.integration.test.ts` 종료 1, 5개 중 1개 실패. 방장 조회가 `{ state: 'ready' }`만 반환해 저장 조건 기대와 불일치했다.
- 구현: 저장된 모집 조건은 해당 약속의 유효한 active 방장 세션에만 반환한다. 성공 리다이렉트의 표시 플래그를 읽어 도장 CSS 애니메이션을 한 번 실행하고 주소에서 소비한다. 링크 복사는 기존 성공 문구를 유지하며 `prefers-reduced-motion`에서는 정적 도장만 표시한다. 티켓은 모집 중의 가능한 날짜·시간이며 일정 확정을 뜻하지 않는다.
- GREEN: Docker `npm run test:browser -- e2e/promise-settings.spec.ts` 종료 0, 2개 통과. 저장된 날짜·09:30–24:00·2시간 표시, 최초 애니메이션, 복사 후 재생 없음, 새로고침 후 정적 도장, 동작 줄이기, 쿠키 제거 뒤 티켓 미표시, 세션 연장과 DB 저장을 검증했다. Docker `npm run test:integration` 종료 0, 전체 22개 통과. 티켓 조회의 세션 없음·위조·타 약속·세션 만료·링크 만료를 포함한다.
- 회귀·정적 검사: Docker `npm run test:browser` 종료 0, 전체 8개 통과. `npm run lint`, `npm run typecheck`, `npm run build` 각각 종료 0. 기존 다른 Origin 거부 테스트의 서버 오류 로그는 예상한 차단 결과다. 계산 정책은 변경하지 않아 단위 테스트는 이번 변경에서 재실행하지 않았다.
- 시각 검수: Chromium 393×852와 320×740의 티켓·도장·복사 버튼 캡처를 직접 확인했다. 설정 2단계는 393×852에서 헤더부터 모집 시작 버튼까지 표시되며 320·393·1280px 가로 넘침 검사를 통과했다. 실제 iPhone Safari는 미검증이다. 캡처는 `apps/web/test-results/promise-settings-mobile-393.png`, `promise-invitation-320.png`, `promise-settings-step-2-393.png`에 있으며 Git 제외다.
- 상태: 002 진행 중을 유지한다. DB 스키마·운영 환경·006 확정 기능은 변경하지 않았다.

### 2026-11-13 설정 화면 배치·시각 개선

- 분류: AC-7의 색상·간격·정적 배치 개선으로 TDD 비대상. 새로운 제품 동작은 추가하지 않았다.
- 근거: `context/inputs/피그마.png`를 직접 열어 DayCell·MonthCalendar·CalendarToolbar·VoteFooter의 흰 바탕, 얇은 테두리, 작은 모서리, 파란 선택색과 연한 파란 배경을 비교했다. 색상은 PNG 시각 비교로 맞춘 값이며 Figma 원본 토큰을 추출한 것은 아니다.
- 변경: 날짜·만날 시간·모집 설정을 독립 카드로 분리. 데스크톱은 2열, 모바일은 1열. 입력 높이 46px, 조작 버튼 44px, 정원은 작은 스테퍼로 정리하고 소요 시간 스피너의 여백을 줄였다. 달력의 불필요한 빈 마지막 주를 제거했다.
- 검증: Docker Node.js 24에서 `npm run test:browser` 종료 0(7개). 캡처 확인 중 320px에서 날짜가 입력 내부에서 잘리는 현상을 발견해 359px 이하에서는 날짜 입력을 세로로 배치했다. 보정 후 `npm run test:browser -- e2e/promise-settings.spec.ts` 종료 0(1개). 320·393·1280px 가로 넘침 검사와 캡처 시각 검수를 완료했다.
- 정적 검사: Docker `npm run lint`, `npm run typecheck`, `npm run build` 모두 종료 0. 비즈니스 로직·DB 변경이 없으므로 이번 시각 수정에서 단위·DB 회귀는 재실행하지 않았다.
- 제한: 실제 iPhone Safari는 미검증. Chromium의 날짜 표시 형식은 브라우저 로캘에 따른다. 전체 브라우저 회귀 중 기존 등록 화면 캡처에서 Playwright가 삽입하는 `caret-color: transparent` 속성 관련 hydration 경고가 한 번 발생했으며 설정 화면 시나리오 재실행에서는 발생하지 않았다.
- 캡처: `apps/web/test-results/promise-settings-form-mobile-393.png`, `promise-settings-form-mobile-320.png`, `promise-settings-form-desktop-1280.png` (test-results는 Git 제외).

### 기존 정책 결정

- OPEN-05·06과 002 범위의 OPEN-03은 스펙에 확정되어 구현 차단 항목이 없다.
- 2026-11-13 후속 사용자 결정으로 정원 5명, 시작일 KST 오늘, 종료일 달력 한 달 뒤, 응답 마감 시작일 7일 뒤를 기본값으로 바꿨다. 마감 시각은 별도 지정이 없어 해당일을 모두 사용할 수 있는 23:59 KST로 기록·구현했다. 소요 시간은 30분 단위 분 값을 유지하되 화면에는 시간·분으로 표시한다.
- 기존 PostgreSQL 스키마에 설정 필드와 ERD의 2~30·90일·30분 단위 CHECK가 이미 있어, 새 저장 필드가 필요하지 않으면 마이그레이션을 억지로 만들지 않는다.
- 새 마이그레이션과 외부 연동은 없으며 Neon·Vercel에는 접근하지 않았다.

## 2026-11-14 후속 UI 수정 — 설정 첫 화면

- 사용자 요청과 범위: [설정 첫 화면 수정](../fixes/002-settings-first-viewport.md). 현재 기능 003 진행 중에 완료된 002 UI를 보완한다.
- RED: `docker compose exec tools npm run test:browser -- e2e/promise-settings.spec.ts -g '설정 진입 시'`, 종료 1. 시작일 입력이 hidden이어서 진입 직후 수정할 수 없었다.
- GREEN: `docker compose exec tools npm run test:browser -- e2e/promise-settings.spec.ts`, 종료 0, 4개 통과. 시작/종료일을 항상 표시하고 달력은 dialog로 분리했다. 393×852·scrollY=0에서 날짜·시간·소요 시간·다음 버튼의 경계가 모두 뷰포트 안이며 Escape 후 달력 버튼으로 포커스가 복귀한다.
- 정적 간격·색상은 TDD 비대상이다. 393 첫 화면과 320 달력 PNG를 직접 검수했고 기존 320·393·1280 가로 넘침 검사를 통과했다. 실제 모바일 Safari는 미검증이다.

- 후속 검증: 기존 001 브라우저 6개도 통과하여 관련 브라우저 총 10개(002 4개 + 001 6개)를 확인했다. 린트·타입 검사·git diff --check 통과. UI 변경으로 DB·전체 단위·운영 빌드는 반복하지 않았다.


## 2026-11-14 숫자 칸 높이 추가 조정

사용자가 기존 화면도 길다고 확인하여 하루 시작·종료 칸은 98px에서 66px, 소요 시간 숫자 칸은 92px에서 64px로 줄였다. 숫자 크기와 화살표·영역 사이 간격도 함께 조정했다. 화살표 버튼은 너비 44px를 유지하고 높이는 30px다.

정적 CSS 변경으로 TDD 비대상이며 기존 첫 화면 검증 높이를 852px에서 700px로 강화했다. `docker compose exec tools npm run test:browser -- e2e/promise-settings.spec.ts` 종료 0, 4개 통과. 393×700에서 스크롤 위치 0인 채 날짜·시간·소요 시간·다음 버튼 전체가 보이고, 실제 PNG를 직접 확인했다. git diff --check 통과.


## 2026-11-14 중복 제목 제거

사용자 요청으로 1단계의 별도 “날짜와 시간” 제목을 화면에서 숨기고 상단 단계 표시 아래에 날짜 카드를 바로 배치했다. 스크린리더와 오류 복구 시 포커스에 필요한 제목은 유지했다. 정적 표시 변경으로 TDD 비대상이며 기존 브라우저 테스트의 표시 확인은 시작일 입력으로 변경했다. Docker Node.js 24에서 `npm run test:browser -- e2e/promise-settings.spec.ts` 종료 0, 4개 통과. 393×700 화면 이미지와 단계 이동·오류 복구 포커스를 확인했다.


### 모집 설정에도 동일 적용

사용자 요청으로 2단계의 중복 “모집 설정” 제목도 화면에서 숨기고 안내 문구 위 간격을 조정했다. 스크린리더 제목과 단계 전환 포커스는 유지한다. 정적 표시 변경으로 TDD 비대상. Docker에서 `npm run test:browser -- e2e/promise-settings.spec.ts` 종료 0, 4개 통과. 393px 모집 설정 화면 이미지도 확인했다.
