# TDD 실행 기록: 006-confirmation

- 2026-11-15 시작. main HEAD `1c8fe93`. 기존 006 정책 문서 변경 및 사용자 `.vscode/` 보존. 커밋·푸시·Notion·배포는 이번 요청 범위가 아니다.
- AC-1~5는 인증된 서비스·실제 PostgreSQL 경계, AC-6과 공유 복구는 Playwright로 검증한다. 기존 후보 계산 단위 테스트를 재사용한다. 시각 디자인은 TDD 비대상이며 캡처로 확인한다.
- 고정 시각·독립 DB 연결·전용 sdd_test 보호를 사용한다. 실제 실행한 RED/GREEN만 아래에 기록한다.

## 실행 기록

### 인증·확정·결과 조회

- Docker `npm run test:integration -- src/lib/confirmation/confirmation.integration.test.ts`.
- 권한 RED exit 1: 빈 스텁 UNAVAILABLE 대신 UNAUTHORIZED 기대 → 같은 약속 세션·현재 방장·005 후보 재계산·원자 UPDATE 후 GREEN 1개 exit 0.
- 유효 마감/재시도 RED exit 1: 기한 도달 collecting이 NOT_CLOSED로 거절됨 → 쓰기 경계의 closed 전환·동일 시각 멱등·다른 시각 재확정 거절 후 GREEN 2개 exit 0.
- 결과 공개 RED exit 1: read 스텁 UNAVAILABLE 대신 인증 오류 기대 → active 참여자 인증·전체 시간 교집합 명단·과거 확정 조회 구현 후 GREEN 3개 exit 0. 탈퇴 후 1명이어도 confirmed 유지 검증.
- 뒤이어 추가한 경계·경합·취소/만료 테스트는 기존 동작의 사후 회귀로 구분한다.
- DB 경계·독립 연결 경합·취소/만료 추가 회귀: 7개 exit 0. 잠금 뒤 역할 재확인과 주입 시각의 시작 경계 검증이며 실제 시간 대기를 사용하지 않는다.

### 후보 선택과 결과 공유

- Docker `npm run test:browser -- e2e/confirmation.spec.ts` RED exit 1: 두 번째 `이 시간 선택` 버튼이 없어 클릭 대기 실패. 기존 후보 목록은 정상 로드됨.
- 후보 선택·확인 취소/확정·결과 티켓·링크 복사 실패 시 수동 입력 구현 후 같은 테스트 GREEN 1개 exit 0. 320/393/1280px 가로 넘침 없음 assertion 통과. 캡처 시각 검수는 최종 회귀 후 수행한다.
- 인증 HTML/HTTP·새 기기 로그인·서버 재검증 오류·통신 오류 재시도는 이미 구현된 동작의 사후 회귀로 추가한다.

### 열린 결과 화면의 최신 상태

- `npm run test:browser -- e2e/confirmation.spec.ts --grep '결과 화면은'` RED exit 1: 참석자가 탈퇴 상태로 바뀌어도 화면에 두 이름이 남음(기대 테스트친구, 실제 테스트친구확정친구).
- 인증된 결과 폴링·포커스/탭 복귀 갱신·오래된 응답 취소·오류 재조회 구현 후 `npm run test:browser -- e2e/confirmation.spec.ts` GREEN 4개 exit 0. 인원 1명 안내·confirmed 유지·취소 화면 이동 포함.
- 실제 탈퇴 버튼·연계는 008이며 이번 테스트는 보호된 테스트 DB에서 상태를 변경한다.

### 전체 회귀 진행

- `npm run test`: 22개 exit 0. 005 후보 규칙을 그대로 재사용하며 중복 단위 테스트는 만들지 않았다.
- `npm run test:integration`: 63개(006 8개) exit 0. DB trigger로 확정 UPDATE 실패를 유발해 closed 전환까지 롤백·확정 시각 미저장, confirmed 소요 시간 직접 수정 거절을 검증했다. 해당 두 항목은 사후 회귀다.
- 결과 화면 320/393/1280px 캡처를 직접 확인했다. 날짜·시간·닉네임·수동 복사 입력이 겹치거나 가로로 넘치지 않는다. 최종 터치 흐름·확인 창 캡처는 전체 브라우저 회귀에서 추가한다.

- 최종 후보 목록(320px)·모바일 확정 창(393px)·결과 티켓을 직접 시각 검수했다. 제공 Figma 시트의 파란색·밝은 배경·기존 글꼴을 유지하며 결과 티켓은 원본에 없는 신규 화면안이다. 테두리·절취선·날짜/시간·닉네임·버튼 배치와 가로 넘침을 확인했다.

- `npm run test:browser`: 전체 50개(006 5개) exit 0, 2.6분. 모바일 터치 확정·일반 참여자 버튼 없음·다른 탭의 결과 이동까지 통과했다. 이전 005 기록의 간헐적인 모바일 드래그 실패는 이번 전체 실행에서 재현되지 않았으며 별도 원인 해결로 주장하지 않는다.
- 최종 `npm run lint`, `npm run typecheck`: 각각 exit 0. Docker Node.js v24.22.3 확인. 브라우저 종료 후 타입 검사를 실행했다.

- `npm run build`: exit 0. 개발 Next 프로세스를 잠시 중지하고 단독 빌드했다. 새 result 페이지·state 라우트가 동적 서버 렌더링으로 생성됐다. 기존 Prisma 5개 마이그레이션 재사용, 신규 DB 마이그레이션 없음.
- 제한: 실제 iPhone Safari·운영 Neon/Vercel·동시 다중 사용자 부하는 미검증. 정식 검토·테스트/완료 명령은 후속이며 이번 시작 요청에서 커밋·푸시·Notion·배포는 하지 않았다.
- 개발 서버 복구 후 `http://localhost:3001` HTTP 200, `git diff --check` exit 0 확인. 사용자 `.vscode/` 보존.

## 2026-11-15 후속 UI — 상단 마감과 후보 페이지

- 사용자 승인: 모집 중 마감 버튼은 고정 상단, 마감 후 후보 전용 화면, 명시적으로 응답 시간표를 다시 열어 비교하고 후보로 복귀한다. 후보 계산·DB 정책은 유지한다.
- RED: `npm run test:browser -- e2e/confirmation.spec.ts --grep '마감된 약속은'` exit 1. 기대 URL `/candidates`, 실제 `/availability`로 남았다.
- GREEN: 같은 명령 1개 exit 0. SSR 기본 이동·후보 화면·읽기 전용 시간표 왕복 구현 후 통과했다.
- 기존 마감/반복/확정 테스트의 경로와 버튼 이름을 승인된 흐름에 맞춰 변경했다. 읽기 전용 검증은 명시적 시간표 페이지에서 유지하고, 마감 전환은 후보 URL 이동으로 확인한다. 통신 오류는 새 후보 페이지의 Server Action 요청에서 그대로 검증한다.
- 상단 고정·SSR 상태별 이동·인증·포커스 갱신 후 시간표 유지 추가 assertion은 구현 후 회귀로 구분한다. 시각 배치는 TDD 비대상으로 320/393/1280px 캡처에서 검수한다.

- 후속 전체 `npm run test:browser`: 52개 exit 0, 2.7분. 추가 2개와 변경된 마감·반복·후보·확정 시나리오를 포함한다. 상단 버튼이 스크롤 전후 첫 화면 안에 있는지, 기한 경과 GET이 DB 상태를 쓰지 않는지, 명시적 시간표가 포커스 갱신 후 유지되는지 확인했다.
- 320/393/1280px 후보 페이지와 고정 상단 화면을 직접 검수했다. 첫 후보는 첫 화면 안에 표시되며 후보 화면에 시간표를 중복 배치하지 않는다. 가로 넘침 없음.
- `npm run lint`, 브라우저 종료 후 `npm run typecheck`: 각각 exit 0. 서비스·DB 계산 변경이 없어 단위/DB 테스트는 이번 후속 UI 작업에서 재실행하지 않았다(앞선 22개/63개 통과 근거 유지).
- 후속 `npm run build`: exit 0, 새 `/p/[inviteToken]/candidates` 동적 경로 포함. 빌드 후 개발 서버를 복구했다. 커밋·푸시·Notion·배포 없음.

## 2026-11-15 후속 시각 개선 — 입장권 티켓

- 사용자 제공 전시 입장권 이미지를 참고해 표지 SVG, 분리된 절취면, 종이 질감·그림자, 확정 도장, 장식 바코드를 적용했다. 날짜·시간·참석자와 인증/갱신/공유 동작은 유지한다.
- 정적 스타일·마크업만 변경해 TDD 비대상으로 분류했다. 신규 제품 동작 테스트나 RED를 만들지 않았다.
- `npm run test:browser -- e2e/confirmation.spec.ts`: 기존 7개 exit 0, 31.0초. 확정·인증·복사 성공/실패·갱신·취소·화면 이동 회귀 통과.
- 320/393/1280px 실제 캡처를 직접 검수했다. 제목·날짜·시간·참석자·공유 버튼·수동 복사 입력이 잘리지 않고 가로 넘침이 없다. 표지는 CSS/SVG로 구현했고 외부 이미지·폰트 요청을 추가하지 않았다.
- `npm run lint`, 브라우저 종료 후 `npm run typecheck`: 각각 exit 0. 서비스/DB 변경이 없어 단위·DB 테스트는 이번 시각 변경에서 재실행하지 않았다.
- `npm run build` exit 0. 개발 서버 복구. 커밋·푸시·Notion·배포는 수행하지 않았다.


### 표지 사진 교체

- 사용자 지정 `context/inputs/달리는 기차 창밖의 여름 들판.png`를 앱 정적 자산으로 복사해 Next Image로 표시했다. 기존 벡터 표지 제거, 사진 위 음영/흰 글자 조정. 이미지 원본 파일은 그대로 유지했다.
- 정적 시각 변경으로 TDD 비대상. `npm run test:browser -- e2e/confirmation.spec.ts --grep '방장은 두 번째'`: 기존 확정·결과·수동 복사 흐름 1개 exit 0. 320/393/1280px에서 실제 사진 로드·창틀/구름 배치·가독성과 가로 넘침 없음을 직접 확인했다.
- `npm run lint`, `npm run typecheck`: 각각 exit 0. DB/정책 변경 없음.
- 사진 교체 후 `npm run build` exit 0. 개발 서버 복구. 커밋·푸시·외부 배포 없음.

### SEE YOU SOON / CONFIRMED 도장 모션

- 2026-11-15 사용자 승인: 표지 문구 변경, 빨간 원형 엄지 도장과 한 번 찍히는 충격 모션. SVG/CSS 시각 변경으로 TDD 비대상이며 새 RED를 만들지 않았다.
- Docker `npm run test:browser -- e2e/confirmation.spec.ts`: 기존 7개 통과, exit 0. 320/393/1280px 캡처 생성, 320/393px 날짜·시간·도장 배치를 직접 검수했다. 마지막 경로 전환 테스트 중 서버 destination stream 로그가 발생했으나 테스트는 모두 통과했다.
- 일회성 Playwright 검수 1개 exit 0: 320px 모션 4개 프레임에서 가로 넘침 없음, 결과 재조회 후 애니메이션 startTime 유지, reduced-motion에서 애니메이션 0개·도장 표시. 검수 파일은 제거했고 제품 회귀 테스트 수에 포함하지 않는다.
- `npm run lint`, `npm run typecheck`: 각각 exit 0. 서비스/DB 변경 없음.
- 최종 `npm run build` exit 0, 개발 서버 복구. `git diff --check` exit 0. 커밋·푸시·외부 배포는 수행하지 않았다.

## 2026-11-15 정식 요구사항 검토

- [검토 결과](../fixes/006-confirmation-review.md): 필수 수정 제품 결함을 발견하지 못했다. 코드·테스트 변경 없이 기존 검증을 재실행했다.
- `npm run test:integration -- src/lib/confirmation/confirmation.integration.test.ts`: 실제 PostgreSQL 8개 통과, exit 0(523ms).
- `npm run test -- src/lib/candidates/candidates.test.ts`: 후보 계산 단위 3개 통과, exit 0.
- `git diff --check`: exit 0. 브라우저·린트·타입·빌드는 직전 도장 변경 검증 근거를 유지하며 이번 실행과 구분한다. 전체 회귀는 다음 `$feature 테스트`다.

## 2026-11-15 최종 테스트

- 사용자 `$feature 테스트` 요청. 기존 RED/GREEN·사후 회귀·시각 검수 구분을 확인했다. 이번 실행은 최종 회귀이며 새 제품 동작이나 과거 RED를 추가하지 않았다. Docker Node.js `v24.22.3`에서 실행했다.

| 명령 (`docker compose exec -T tools` 뒤) | 실제 결과 |
| --- | --- |
| `npm run test` | 9개 파일·22개 통과, exit 0 |
| `npm run test:integration` | 보호된 실제 PostgreSQL 6개 파일·63개 통과(006 8개), exit 0, 27.93초 |
| `npm run test:browser` | Chromium 전체 52개 통과(006 7개), exit 0, 2.7분 |
| `npm run lint` | exit 0. 캡처 옵션 보완 후에도 재실행 통과 |
| `npm run typecheck` | 브라우저 종료 후 순차 실행, exit 0 |
| `npm run build` | 개발 서버를 잠시 중지하고 단독 실행, exit 0 |

- 실제 DB 대상 보호와 기존 5개 마이그레이션 적용 상태를 확인했다. 통합 테스트와 브라우저 테스트는 순차 실행했다. 개발/운영 데이터 초기화 없음.
- 전체 브라우저 통과 후 결과 캡처가 도장 진입 도중 촬영된 점을 확인해 `e2e/confirmation.spec.ts`의 결과 스크린샷에만 `animations: "disabled"`를 추가했다. 정적 캡처 시 유한 애니메이션을 마지막 프레임으로 보내는 검증 도구 보완이다. 제품 애니메이션·동작 assertion은 변경하지 않았다.
- 캡처 옵션 보완 후 `npm run test:browser -- e2e/confirmation.spec.ts --grep '방장은 두 번째'`: 1개 exit 0. 최종 320/393/1280px 캡처를 직접 확인했고 날짜·시간·참석자·도장·공유/수동 복사 입력이 겹치거나 가로로 넘치지 않는다. 모션 중간 프레임·동작 줄이기·갱신 시 재생 없음은 직전 시각 검증 근거를 유지한다.
- 외부 Origin 거절 테스트에서 예상된 Server Action 차단/브라우저 오류 로그가 출력됐다. 후보 경로 전환 테스트의 destination stream 로그도 재발했으나 52개 assertion은 모두 통과했다. 원인 해결로 주장하지 않는다.
- 이전 005의 간헐적인 모바일 드래그 실패는 이번 실행에서 재현되지 않았다. 기존 관찰 기록을 지우거나 수정 완료로 간주하지 않는다.
- 최대 범위 집계는 30명×90일×48슬롯(129,600개), 이번 단일 조회 1,282.3ms·응답 78,678bytes였다. 로컬 측정이며 운영/동시 부하 성능을 보장하지 않는다. 합격 시간 목표는 기존 OPEN-11에 남긴다.
- 실제 iPhone Safari·운영 Neon/Vercel은 미검증. 기능 완료 처리·커밋·푸시·Notion·배포는 이번 요청에서 수행하지 않았다.
- 빌드 후 개발 서버 복구, `http://localhost:3001` HTTP 200, `git diff --check` exit 0 확인. 사용자 `.vscode/` 및 제공 원본 사진 보존.

## 2026-11-15 완료 처리

사용자 `$feature 완료` 요청으로 스펙 AC-1~6, 실제 RED/GREEN·사후 회귀 구분, 시각 검수와 최종 통과 결과를 확인하고 상태·기능 목록·누적 완료 이력을 갱신했다. 이번 변경은 문서뿐이며 제품 테스트를 다시 실행했다고 주장하지 않는다. 커밋·푸시·Notion·배포 없음. 기존 관찰 사항과 미검증 범위는 유지한다.
