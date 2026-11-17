# 파란색 임시 디자인 검증

- 2026-11-17, 기준 `main` / `60967f0`.
- 시작 시 추적 파일 변경 없음. 기존 미추적 디자인 백업·시안, `.vscode/`, 조사 문서 보존.
- 스타일 변경으로 TDD 비대상. 실제 RED/GREEN을 주장하지 않으며 기존 동작의 회귀·화면 검수로 확인한다.
- 변경 전 추적 앱 177개를 `apps/web/design-backups/2026-11-17-before-blue/red-app.zip`에 보관했다. ZIP CRC 검사 및 원본과 각 파일 바이트 비교 통과. SHA-256 및 복구 대상 CSS는 같은 폴더의 `manifest.json`에 기록.
- Docker Node.js `v24.22.3`, `npm run test`: 종료 0, 13개 파일·46개 테스트 통과. `npm run lint`: 종료 0.
- 전체 브라우저 회귀에서 기존 확정 테스트가 이미 제출한 사용자의 버튼 이름을 `선택 제출`로 찾는 불일치를 발견했다. 현재 구현과 기존 제출 완료 정책에 맞춰 `제출 완료`를 찾고 비활성화를 검증하도록 보완했다. 제품 로직 변경 및 assertion 약화 없음. 해당 실패는 스타일 변경의 RED가 아니다.
- `npm run test:browser`: 최초 전체 99개 중 96개 통과, 3개 실패(exit 1). 실패는 위 버튼 문구 불일치 1개와 주간 반복 테스트의 30초 제한 초과 2개다.
- 실패 3개 및 고정 색상 클래스 영향 화면 3개를 `--trace retain-on-failure`로 재검증: 4개 통과·반복 2개 실패. 추적 로그에서 `nextjs-portal`의 개발 Insight 배지가 `이번 주 반복` 클릭 좌표를 가리는 것을 확인했다. 앱 슬롯·반복 로직 오류가 아니며, 테스트에서 실제 `Collapse issues badge` 버튼을 클릭/터치하도록 보완했다. 강제 클릭·타임아웃 확대·제품 UI 숨김은 사용하지 않았다.
- 최종 집중 회귀: `npm run test:browser -- e2e/availability.spec.ts e2e/confirmation.spec.ts e2e/web-invitation.spec.ts e2e/participant-access.spec.ts e2e/rescheduling.spec.ts --grep '이번 주 반복은 미제출|이번 주 반복은 모바일|마감된 약속은 후보|홈에서 약속|친구 참여 →|변경 취소·연결'` → **6/6 통과, exit 0**. 최초 실패 3개 모두 통과했으며, 전체 99개가 한 실행에서 통과했다고 기록하지 않는다.
- 최종 `npm run lint`, `npm run typecheck`, `npm run build`: 각각 exit 0. 타입·빌드는 브라우저 종료 후 순서대로 실행했다. 빌드 시 로컬 개발 서버를 잠시 정지하고 완료 후 복구했다.
- 320/393/1280px 가로 넘침 검사 통과. 홈·설정·초대·시간표·후보·확정 화면 캡처 검수. `apps/web/design-previews/blue-app-review/`에 캡처를 보관했다. 개발 도구 배지가 포함된 캡처와 운영 화면은 구분한다.
- 제품 변경은 CSS 및 고정 색상 클래스의 변수 연결뿐이다. 데이터·권한·제출·계산 로직과 스키마는 변경하지 않았다. 실제 기기·운영 배포는 미검증이며 커밋·푸시·배포는 수행하지 않았다.
