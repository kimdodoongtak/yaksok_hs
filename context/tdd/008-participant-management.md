# TDD 실행 기록: 008-participant-management

- 2026-11-15 시작, main HEAD `4153c99`. 기존 008 불러오기 문서·사용자 `.vscode/` 보존.
- 스펙: [008](../features/008-participant-management-spec.md). 자동 승계만 구현, 수동 위임 제외.
- AC-1~7은 실제 격리 PostgreSQL 서비스 테스트, AC-8은 Playwright 사용자 흐름. CSS는 TDD 비대상으로 실제 화면 검수한다. DB 결과를 복제하는 별도 단위 테스트를 억지로 추가하지 않는다.
- 명령은 Docker Node.js 24의 `docker compose exec -T tools`에서 실행. 테스트 DB 보호·fixture 정리 재사용. 아래에 실제 실행 후 기록한다.

## 실제 RED/GREEN

- 본인 탈퇴: DB 테스트 RED exit 1(UNAUTHORIZED 기대/UNAVAILABLE 스텁), 인증·소속·기록 보존·전체 기기 세션 만료 구현 후 GREEN exit 0, 1개.
- 자동 승계: RED exit 1(SUCCESSOR_CHANGED 기대/STATE_CHANGED), 가입 시각·ID 순 후임과 재확인 가드 구현 후 GREEN exit 0, 2개.
- 마지막 방장: RED exit 1(cancelled 성공 기대/STATE_CHANGED), 재사용 가능한 취소 트랜잭션 구현 후 GREEN exit 0, 3개. 마지막 방장 레코드는 그대로 유지한다.
- 내보내기: RED exit 1(FORBIDDEN 기대/UNAVAILABLE 스텁), 모집 마감·권한·대상 확인 및 세션 만료 구현 후 GREEN exit 0, 4개.
- 확인 이후 방장 승계 경합: RED exit 1(STATE_CHANGED 기대/약속 취소 성공), expectedRole 가드 후 GREEN exit 0, 5개. 같은 실행에서 테스트 편집 오타(role 미정의)도 있었으며 해당 오류는 제품 RED로 계산하지 않았다.
- 위 테스트 명령: `npm run test:integration -- src/lib/participant-management/participant-management.integration.test.ts`.

- 화면 흐름 RED: `npm run test:browser -- e2e/participant-management.spec.ts` exit 1, 참여자 관리 링크 없음. 참여자 화면·인증 조회·서버 액션·승계 안내를 연결했다.
- 첫 화면 구현 검증에서 나가기 후 쿠키 변경에 따른 Server Component 재렌더가 완료 안내를 덮어씀을 확인했다. DB의 전체 세션 즉시 만료는 유지하고 액션에서 쿠키 재설정을 하지 않아 완료 결과를 표시하도록 보완했다. 남은 쿠키는 서버에서 유효하지 않으며 재접근할 수 없다.
- 추가 DB 상태·롤백·동시성·조회 공개 범위, 브라우저 통신 실패·마감 갱신·반응형 검사는 기존 구현에 대한 사후 검증으로 구분한다.

## 구현 단계 회귀·시각 검수

- 008 브라우저 GREEN: 3개 exit 0. 자동 승계·마지막 방장 취소, 내보내기 취소·네트워크 오류 재시도·저장 중 ESC 차단, 열린 기기의 인증 차단·마감 갱신 확인.
- 008 실제 DB 10개 exit 0. 이후 전체 단위 23개(10파일)·전체 DB 84개(8파일)도 exit 0. DB 롤백·동시성 사후 검증을 포함한다.
- 타입 검사 exit 0. 린트 첫 실행은 ref cleanup 경고 1개(오류 0개)였고 요청 무효화 콜백으로 정리한 뒤 경고 없이 exit 0.
- 정적 시각 검수(TDD 비대상): 기존 Figma 참고 시트·002/003의 파란색·글꼴·입력 규격을 유지했다. `participants-320.png`, `participants-393.png`, `participants-1280.png`, `participants-leave-393.png`를 실제 열어 확인했다. 가로 넘침도 브라우저에서 검사했다. 실제 iPhone Safari는 미검증.
- 추가 사후 브라우저: 나가기 확인 이후 후임이 탈퇴해도 약속을 바로 취소하지 않고 최신 영향 재확인을 요구하는 시나리오를 전체 회귀에 포함했다.


## 최종 구현 검증 결과

Docker Node.js 24에서 실행했다.

| 명령 (`docker compose exec -T tools` 뒤) | 실제 결과 |
| --- | --- |
| `npm run test` | exit 0, 10파일·23개 |
| `npm run test:integration` | exit 0, 8파일·84개(008 10개) |
| `npm run test:browser` | exit 0, Chromium 63개(008 4개), 3.4분 |
| `npm run lint` | exit 0, 경고 없음 |
| `npm run typecheck` | 최종 정리 후 재실행 exit 0 |
| `npm run build` | exit 0, participants 페이지·인증 상태 조회 경로 생성 |

- 전체 브라우저에서 외부 Origin 차단 테스트의 예상 오류·해당 차단 대역의 클라이언트 오류와 기존 destination stream 로그가 관찰됐다. 동작 assertion은 전체 통과했으며 기존 간헐 로그의 해결을 주장하지 않는다.
- 빌드는 브라우저 종료 후 개발 서버를 잠시 중지한 상태에서 단독 실행했고 이후 개발 서버를 다시 시작했다.
- AC-1~8 구현 단계 검증 통과. 실제 iPhone Safari·운영 Neon/Vercel은 미검증·미수행. 정식 검토·완료 처리는 후속 단계이며 기존 완료 이력은 보존한다. 커밋·푸시·Notion 갱신 없음.
- 개발 서버 복구 후 `http://localhost:3001` HTTP 200 확인. 문서 상대 링크·기존 완료 이력 보존·`git diff --check` 점검 통과.

## 정식 검토의 재검증

- 008 실제 DB 테스트 10개 재실행 exit 0. 기존 008 Chromium 4개도 재실행 exit 0.
- 일회성 브라우저 관찰 1개로 조회 실패 후 정상 응답 200·ok:true가 두 번 돌아와도 실패 안내가 남는 R1(P3)을 확인했다. 기존 4개와 함께 실행해 총 5개 exit 0이며, 관찰 시나리오의 성공은 제품 결함의 해결이나 RED/GREEN을 뜻하지 않는다. 임시 재현 파일은 실행 후 삭제했다.
- 제품 코드·기존 테스트 변경 없이 [검토 기록](../fixes/008-participant-management-review.md)과 문서를 갱신했다. 핵심 AC 충족, R1 보완 권장, 상태 검토 중. 전체 회귀·린트·타입·빌드는 이번에 재실행하지 않았다.

## R1 보완 시작

- 사용자 `$feature 시작` 요청으로 조회 복구 안내를 보완한다. main `4153c99`와 기존 008 변경·사용자 `.vscode/`를 보존한다.
- TDD 대상: 실제 참여자 화면에서 조회 실패 후 동일한 snapshot의 정상 응답을 받으면 실패 안내가 해제되고 일반 상태 변경 안내는 유지되어야 한다. `e2e/participant-management.spec.ts`의 공개 화면 경계에서 먼저 실패를 확인한다. 서버/DB 정책은 변경하지 않는다.

- RED: `npm run test:browser -- e2e/participant-management.spec.ts -g '조회 복구'` exit 1. 정상 응답의 `ok:true` 확인 후 `toBeHidden()`이 실패했고 실제 안내는 visible이었다. 환경·수집 오류가 아닌 R1의 의도한 실패를 확인했다.
- 최소 수정: 조회 실패 여부를 별도 상태로 분리하고, 요청 세대·인증 주체 확인을 통과한 정상 조회에서 해당 상태만 해제한다. 일반 변경/승계 안내는 유지한다. 새 테스트는 네트워크 실패와 503 응답 뒤 복구를 모두 확인한다.

- GREEN: `npm run test:browser -- e2e/participant-management.spec.ts` exit 0, 5개 통과(기존 4개 + R1 1개). 동일 snapshot 복구 시 실패 안내 해제와 일반 상태 변경 안내 보존을 확인했다.
- 보완 회귀: Docker Node.js 24의 전체 단위 23개·린트(경고 없음)·타입 검사·운영 빌드 모두 exit 0. 서버/DB 코드를 바꾸지 않아 DB 통합과 전체 Chromium 회귀는 이번 보완에서 재실행하지 않았다. 이전 기록과 구분한다.
- 빌드 중 개발 서버를 잠시 중지한 뒤 다시 시작했다. 별도 스키마·의존성·정책 변경, 커밋·푸시·Notion·운영 배포 없음. 실제 iPhone Safari는 미검증이다.
- 개발 서버 복구 후 `http://localhost:3001` HTTP 200 확인. `git diff --check` 통과.

## 최종 feature 테스트

사용자 `$feature 테스트` 요청으로 R1 보완까지 포함해 전체 회귀를 실행했다. 기존 RED/GREEN·사후 검증 기록과 AC-1~8의 기대값을 대조했으며, 이번 단계에서 제품 코드나 테스트를 변경하지 않았다.

| 명령 (`docker compose exec -T tools` 뒤) | 실제 결과 |
| --- | --- |
| `npm run test` | exit 0, 10파일·23개 |
| `npm run test:integration` | exit 0, 8파일·84개(008 10개), 격리 sdd_test·기존 5개 마이그레이션 확인 |
| `npm run test:browser` | exit 0, Chromium 64개(008 5개), 3.1분 |
| `npm run lint` | exit 0, 경고 없음 |
| `npm run typecheck` | 브라우저 종료 후 실행, exit 0 |
| `npm run build` | 개발 서버 일시 중지 후 실행, exit 0 |

- 핵심 흐름: 상태별 탈퇴·마감 전 내보내기·자동 승계·마지막 방장 취소·데이터 보존·세션 차단·경쟁과 롤백·후임 변경 재확인·R1 정상 조회 후 실패 안내 해제 모두 통과했다.
- 시각 검수: 이번 실행이 생성한 `participants-320.png`, `participants-393.png`, `participants-1280.png`, `participants-leave-393.png`를 직접 열어 목록·버튼·확인 창 배치를 확인했다. 브라우저의 가로 넘침 검사도 통과했다. 새로운 디자인 변경은 없다.
- 외부 Origin 차단 시나리오의 Invalid Server Actions 및 해당 차단 대역 클라이언트 오류 로그는 관찰됐으나 거절·DB 미변경 assertion은 통과했다. 기존 destination stream 로그는 이번 출력에서 관찰되지 않았으며 해결을 주장하지 않는다.
- 성능 회귀 관찰: 기존 005 최대 범위 테스트의 129,600개 슬롯 조회 677.6ms·78,678bytes. 단일 로컬 측정이며 부하 목표 통과로 해석하지 않는다.
- 실제 iPhone Safari·운영 Neon/Vercel·동시 다중 사용자 부하는 미검증이다. 테스트 DB와 개발 DB를 구분했고 운영 데이터·스키마를 변경하지 않았다.
- 상태: 검토 중 — 최종 테스트 통과, 완료 요청 대기. 커밋·푸시·Notion·배포는 수행하지 않았다. 이전 완료 이력과 사용자 `.vscode/`를 보존했다.
- 개발 서버 복구 후 `http://localhost:3001` HTTP 200 확인. 문서 상대 링크 및 `git diff --check` 점검 통과.

## 완료 처리

2026-11-15 사용자 `$feature 완료` 요청으로 AC-1~8·RED/GREEN·시각 검수·최종 전체 회귀 결과와 R1 해소를 확인하고 완료했다. 이번 단계에서는 문서만 갱신했으며 테스트를 재실행한 것으로 기록하지 않는다. 현재 기능·스펙·목록·분해 계획과 누적 완료 이력을 동기화했다. 실제 iPhone Safari·운영 환경은 미검증이며 커밋·푸시·Notion·배포는 수행하지 않았다.
