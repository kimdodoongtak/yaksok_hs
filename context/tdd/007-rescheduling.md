# TDD 실행 기록: 007-rescheduling

- 2026-11-15 시작. main HEAD `2b67c09`. 기존 007 정책 문서와 사용자 `.vscode/` 보존. 커밋·푸시·배포 없음.
- AC-1~6: 범위 포함관계 단위 검사와 실제 격리 PostgreSQL 서비스 검증. AC-7: 폼/오류/다른 화면 동기화 브라우저 검증. 시각 스타일은 TDD 비대상으로 실제 캡처 검수.
- 정책: 기존 세션 만료 시각 유지, active 응답만 변경하고 탈퇴자 기록 보존. 002 입력 검증·공통 약속 잠금 재사용.
- 실제 RED/GREEN은 아래에 실행 후 기록한다. 006 검증 결과를 007 결과로 간주하지 않는다.

## 동작별 실제 실행 (2026-11-15)

- 범위 포함관계: `npm run test -- src/lib/rescheduling/rescheduling.test.ts` RED(exit 1, shrink 기대/always same 스텁), 포함관계 구현 후 GREEN(exit 0, 1개).
- 방장 재설정·소요 시간 변경: `npm run test:integration -- src/lib/rescheduling/rescheduling.integration.test.ts` RED(exit 1, UNAUTHORIZED 기대/UNAVAILABLE 스텁), 세션·역할·002 검증·설정 저장 후 GREEN(exit 0, 1개). 다른 약속 세션·계정 변경·일반 참여자 거절, 응답 및 세션 보존 확인.
- 마감·확정 재조율: 같은 DB 명령 RED(exit 1, 마감 시 STATE_CHANGED 기대/ok true), 유효 상태 전환과 확정 해제 구현 후 GREEN(exit 0, 2개).
- 범위 축소: RED(exit 1, version 1·슬롯 1개 기대/0·3개), active 슬롯 삭제·실제 삭제자만 버전 증가 후 GREEN(exit 0, 3개). 탈퇴자 전체 기록 보존.
- 확대·이동: RED(exit 1, submittedAt null 기대/기존 시각), active 전체 초기화 후 GREEN(exit 0, 4개). 미제출자도 +1, 탈퇴자·세션 보존.
- 재조율 사용자 흐름: `npm run test:browser -- e2e/rescheduling.spec.ts` RED(exit 1, 결과 화면에 재조율하기 링크 없음). 기존 002 폼 재사용·확정 해제 영향 안내·Server Action 연결 후 검증 중.
- 이후 추가한 정원·입력 거절, 롤백/재시도, 독립 DB 연결의 동시 재조율 검증은 기존 구현에 대한 사후 검증이다. RED를 소급해 주장하지 않는다.
- 위 npm 명령은 전부 프로젝트 루트에서 `docker compose exec -T tools`로 실행. DB는 보호 검사를 통과한 `sdd_test`, 신규 마이그레이션 없음.

- 재조율 화면 GREEN: 확인 창을 기다리는 미완료 Action 때문에 React 전환이 완료되지 않는 문제를 같은 브라우저 테스트로 확인했다. 확인 단계는 즉시 완료하고 실제 저장은 확인 버튼에서 실행하도록 분리한 뒤 exit 0, 1개 통과.
- 다른 열린 화면의 재제출 안내 RED: 확대 저장 후 기존 일반 변경 메시지만 나옴(exit 1). 제출 시각 NULL일 때 재제출 문구를 보여주도록 수정한 뒤 해당 시나리오 통과. 새 기능 브라우저 4개 최종 통과(exit 0): 재조율·결과 탭 이동, 모집 중 확대·임시 편집 폐기, 취소·네트워크 재시도·중복 클릭/ESC 방지, 인증/역할/마감 경계.
- 브라우저 사후 검사 중 `getByRole("alert")`가 Next.js 경로 알림까지 선택하는 strict mode 오류가 있어 대화상자 내부로 범위를 한정했다. 제품 RED로 계산하지 않는다.
- DB 서비스 정리 후 전체 단위 23개 통과, 007 실제 DB 9개 통과(후보 2개→소요 120분 변경 후 0개 포함), 린트 통과. 전체 DB·브라우저·타입·빌드는 아래 최종 결과에 별도 기록한다.
- 시각 검수(TDD 비대상): `context/inputs/피그마.png`를 실제 열어 파란 강조색·연한 배경·기존 002 컴포넌트를 참고했다. `test-results/rescheduling-393.png`, `rescheduling-confirm-393.png`를 실제 확인했으며 날짜·시간·다음 버튼이 393×852 안에 들어온다. 320·393·1280 가로 넘침과 다음 버튼 표시도 브라우저 assertion으로 확인했다.

## 구현 단계 최종 회귀

모두 Docker Node.js 24에서 종료 0.

| 명령 (`docker compose exec -T tools` 뒤) | 결과 |
| --- | --- |
| `npm run test` | 10파일·23개 통과 |
| `npm run test:integration` | 7파일·72개 통과, 007 9개 포함 |
| `npm run test:browser` | Chromium 56개 통과, 007 4개 포함 |
| `npm run lint` | 통과 |
| `npm run typecheck` | 통과 |
| `npm run build` | 통과, `/p/[inviteToken]/settings/edit` 동적 경로 생성 |

- 전체 브라우저의 외부 Origin 위조 요청 차단 로그는 기존 음성 테스트에서 발생했고 해당 테스트를 포함해 전체가 통과했다.
- 최종 브라우저 실행에서 생성한 `rescheduling-320.png`, `rescheduling-1280.png`도 실제 열어 확인했다. 393px 화면·확인 창과 함께 기존 폼 규격·글꼴·색상을 유지하고 다음 버튼까지 화면 안에 들어온다. 실제 iPhone Safari는 미검증이다.
- 빌드는 브라우저 종료 후 개발 서버를 잠시 중지하고 단독 실행했다. 이후 개발 서버를 다시 시작했다.
- AC-1~7 구현 단계 검증을 충족했다. 정식 `$feature 검토`·완료 단계는 후속 요청으로 진행하며 완료 이력을 미리 추가하지 않는다. 커밋·푸시·Notion·운영 배포는 수행하지 않았다.

## 정식 검토 후

- [007 검토 기록](../fixes/007-rescheduling-review.md): 007 DB 9개 재실행 exit 0. 별도 일회성 Chromium 두 탭 점검에서 오래된 영향 안내 R1을 재현했다. 축소 저장 후 제출 완료 2명, 오래된 탭은 “제출 상태 유지” 안내, 그 탭에서 소요 시간만 수정한 뒤 실제 제출 완료 0명.
- 제품/테스트 코드는 수정하지 않았다. R1은 결함 재현 근거이며 아직 수정 RED/GREEN은 없다. 기존 구현 단계 통과 기록과 구분하고 AC-7은 보완 필요로 되돌렸다.

## R1 보완 시작

- main `2b67c09`, 기존 007 미커밋 변경·사용자 `.vscode/` 보존. 스펙의 변경 영향 안내와 AC-7을 근거로 진행한다.
- 서버 RED: 007 DB 테스트에 오래된 안내(same)→다른 탭 축소→실제 확대 시나리오 추가. `npm run test:integration -- src/lib/rescheduling/rescheduling.integration.test.ts` exit 1, IMPACT_CHANGED 기대에 ok true 수신.
- 서버 GREEN: 확인한 범위 영향 `confirmedImpact`를 필수 입력으로 전달하고 공통 잠금 안에서 최신 영향과 비교한다. 불일치하면 슬롯·제출·설정을 저장하지 않고 최신 영향을 반환한다. 동일 명령 exit 0, 10개 통과. 재확인 후에는 최신 상태 기준으로 저장하며 전용 설정 버전 컬럼은 추가하지 않는다.
- 기존 DB 테스트에는 해당 요청에서 확인한 영향을 명시했다. 정상 저장·동시 요청·권한·롤백 기대값은 유지했다.
- 화면 RED: 확인 창을 열기 전/후 다른 탭에서 범위를 줄이는 2개 브라우저 시나리오 모두 exit 1. 서버는 저장을 멈췄지만 화면이 보존 안내와 일반 권한 오류를 유지했다. IMPACT_CHANGED의 최신 영향으로 확인 창을 갱신하고 사용자 재확인 후 다시 저장하도록 연결했다.
- 화면 GREEN: 007 브라우저 6개 exit 0. 확인 창 이전/이후 다른 탭 변경 모두 저장을 중단하고 최신 안내 후 재확인 때만 반영됐다.
- 같은 영향 확인 경계에서 확정 해제 안내도 점검했다. 마감 화면의 확인 이후 약속이 confirmed로 변하면 기존에는 안내 없이 확정을 해제했다. DB 실패 테스트 exit 1(ok true 수신) → `confirmedClear`와 최신 상태를 함께 대조하도록 보완. 이는 범위뿐 아니라 확인 창의 확정 해제 안내까지 일치시키기 위한 같은 보완 범위다.
- 확정 해제 GREEN: 007 DB 11개 exit 0. 확정 해제를 확인하지 않은 요청은 확정 시각을 보존하고 새 안내를 반환하며 확인 후에만 해제한다.
- 최종 관련 브라우저 회귀: `npm run test:browser -- e2e/rescheduling.spec.ts e2e/confirmation.spec.ts` exit 0, 14개(007 7개·006 7개). 새 범위 확인 이전/이후 변경과 확정 해제 경합을 확인했다. 기존 destination stream 로그는 관찰됐지만 해당 사용자 흐름 검증은 통과했다.
- R1 최종: 전체 단위 23개, 007 실제 DB 11개, 관련 브라우저 14개, 린트·타입·운영 빌드 모두 exit 0. 관련 범위 외 전체 DB/브라우저 재실행은 하지 않았고 앞선 전체 회귀 기록과 구분한다.
- 개발 서버는 빌드 후 재시작했다. 스키마·의존성 변경 없음, 커밋·푸시·Notion·배포 없음. R1 구현 검증을 마쳤으며 정식 재검토 전이다.

## R1 정식 재검토

제품/테스트 코드 변경 없이 R1 서버 시나리오 2개(`test:integration`의 이름 필터), 브라우저 시나리오 3개(`test:browser`의 이름 필터)를 재실행해 모두 exit 0. 나머지 테스트는 이번 명령의 대상이 아니며 과거 전체/관련 회귀 결과와 구분한다. R1 해소·추가 필수 수정 사항 없음 판정은 [검토 기록](../fixes/007-rescheduling-review.md)에 남겼다. 다음 단계는 최종 `$feature 테스트`다.

## 최종 feature 테스트

- R1 재검토 통과 후 전체 회귀를 새로 실행한다. 기존 RED/GREEN과 사후 검증 구분·AC 대응을 확인했다. 테스트를 소급 작성하거나 건너뛰도록 변경하지 않았다.
- Docker Node.js 24: `npm run test` exit 0(23개), `npm run test:integration` exit 0(74개, 007 11개 포함), `npm run lint` exit 0, `npm run typecheck` exit 0.
- 실제 DB는 보호 확인된 `sdd_test`이며 기존 5개 마이그레이션 적용 상태를 확인했다. 개발·운영 데이터 초기화 없음. 전체 브라우저와 빌드 결과는 이어서 기록한다.
- `npm run test:browser` exit 0: 전체 Chromium 59개(007 7개) 통과. `npm run build` exit 0. 브라우저 종료 후 개발 서버를 잠시 중지하고 단독 빌드한 뒤 다시 실행했다.
- 최종 화면: 이번 실행의 `rescheduling-320.png`, `rescheduling-confirm-393.png`, `rescheduling-1280.png`를 직접 열어 기존 폼 규격·확인 창·가로 넘침 없는 배치를 확인했다. 브라우저 assertion도 320·393·1280px 표시를 검증했다. 실제 iPhone Safari는 미검증이다.
- 외부 Origin 차단 테스트의 예상 오류 로그와 기존 destination stream 로그는 관찰됐으며 전체 동작 assertion은 통과했다. 기존 간헐 현상을 해결했다고 주장하지 않는다.
- 이번 단계 제품 코드·테스트 변경 없음. 기존 사용자 파일 보존, 커밋·푸시·Notion·운영 배포 없음. AC-1~7 최종 검증 통과, 다음은 사용자 요청에 따른 완료 처리다.


## 2026-11-15 완료 처리

사용자 요청으로 AC-1~7·실제 RED/GREEN·최종 전체 회귀·시각 검수 근거를 확인하고 완료했다. 후속 초대 봉투 실험의 서버·테스트·스펙 변경은 전부 원복했으며 007 제품 코드는 유지했다. 이번 단계는 완료 문서와 링크·diff 점검만 수행했으며 테스트 재실행으로 주장하지 않는다. 커밋·푸시·Notion·운영 배포 없음. 실제 iPhone Safari는 미검증이다.
