# 연속 후보·명단 검증

2026-11-25. [스펙](../features/candidate-ranges-spec.md). 상태: 로컬 구현·검증 완료.

확인 결과 시간표의 색칠 구간 연결만 적용돼 있었고 공식 후보는 소요 시간 길이의 30분 시작점을 모두 나열했다. 서버 확정 검증용 시작 후보는 유지하면서 공식 목록의 표시/페이지 단위를 연속 구간으로 바꾼다. 기존 로컬 색상 변경과 개발 DB 데모는 보존한다.

## 실제 RED와 GREEN

- 계산 RED: `docker compose exec tools npm test -- src/lib/candidates/candidates.test.ts`, 종료 1. 새 연속 구간 테스트가 `candidateRanges` undefined로 실패(기존 3개 통과). 계산 구현 후 4/4 통과. 이후 날짜·다른 명단·부분 겹침·과거 경계 3개는 구현 후 추가한 회귀 검증으로 구분한다. 전체 단위 60/60 통과. 로그 `/tmp/yaksok-ranges-unit-red.log`, `/tmp/yaksok-ranges-unit-green.log`.
- API RED: `docker compose exec tools npm run test:integration -- src/lib/candidates/candidates.integration.test.ts`, 종료 1. 주 밖 후보의 종료가 13:00 대신 10:00이고 참석 ID가 없어서 신규 테스트 실패, 기존 11개 통과. 서비스가 묶음 결과를 반환하도록 수정 후 전체 DB 95/95 통과. 로그 `/tmp/yaksok-ranges-db-red.log`, `/tmp/yaksok-ranges-db-green.log`.
- 브라우저 RED: `docker compose exec tools npm run test:browser -- confirmation.spec.ts --grep '시작 시간을 골라|후보를 터치하면'`, 종료 1, 2개 실패. 시작 시간 선택과 명단 버튼이 없어 대기 시간 초과. 로그 `/tmp/yaksok-ranges-ui-red.log`. 이후 UI 구현.
- 페이지네이션 회귀의 데이터는 30분씩 연속된 창 대신 서로 떨어진 6개/10개 구간으로 변경했다. 새 정책에서 연속 시간을 5개로 잘라 나열하는 옛 기대는 적용하지 않으며, 5개/더 보기 동작 자체는 계속 검증한다.
- DB는 가드가 적용된 격리 `sdd_test`만 사용, 통합 검사와 E2E는 순차 실행. 개발/운영 데이터 변경·스키마 변경 없음.

## 브라우저·화면 확인

- `npm run test:browser -- confirmation.spec.ts candidates.spec.ts`: 21/21, 종료 0. 연속 후보 1개·명단 펼침/접기·참석하지 못하는 사람 제외·실제 시작 시간 선택/DB 확정·기존 히트맵 검증 통과.
- `npm run test:browser -- confirmation.spec.ts rescheduling.spec.ts`: 15/15, 종료 0. 후보 명단이 열린 상태에서 같은 인원수의 참석자가 바뀌어도 최신 이름으로 교체하고, 후보가 사라지면 명단도 사라지는 것을 확인했다. 접촉 반경 12~14px의 가장자리 터치와 이동 제스처를 포함한다. 총 고유 관련 브라우저 테스트는 28개다.
- Chromium 캡처 `candidate-roster-320.png`, `candidate-roster-1280.png`, `candidate-start-choice-393.png` 직접 검수: 명단/시간/버튼 겹침·가로 넘침 없음. 실제 휴대전화와 Safari는 미검증이다.
- 재조율 회귀 로그에 페이지 이탈 중 스트림 오류, 설정 폼 캡처 중 `caret-color:transparent` 속성 hydration 경고가 1회씩 관찰됐다. 해당 경고는 이번 후보 UI가 아닌 경로이며 기능 검증은 모두 통과했다. 화면 캡처의 caret 숨김 속성과 일치하지만 원인 확정은 하지 않는다.
- Docker Node.js 24 `npm run lint`, `npm run typecheck`, `git diff --check` 종료 0. 운영 빌드와 짧은 화면의 실제 스크롤 보강 확인은 후속 결과에 기록한다.

## 최종 결과

- 보강한 실제 스크롤 검사: `npm run test:browser -- confirmation.spec.ts --grep '후보를 터치하면'`, 1/1, 종료 0. 320×360 화면에서 후보 위에 반경 14px 터치 → 이동 → 손 떼기를 수행해 `scrollY > 0`이고 명단은 닫힌 상태를 유지함을 확인했다. 이어 가장자리 반경 12px 탭은 명단을 열었다.
- `docker compose exec -e INVITATION_BROWSER_TEST=1 tools npm run build`: 종료 0. 별도 `.next-browser` 출력으로 개발 서버를 보존했다. `http://localhost:3001` HTTP 200 확인.
- 단위 60/60, 격리 DB 95/95, 관련 브라우저 고유 28개와 보강 집중 1개, 린트·타입·빌드·diff 검사 통과. 실제 Safari/휴대전화는 미검증. 이번 변경은 로컬에만 반영했고 커밋·푸시·배포하지 않았다.
