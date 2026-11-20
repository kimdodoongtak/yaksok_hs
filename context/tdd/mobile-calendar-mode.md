# TDD 실행 기록: mobile-calendar-mode

- 스펙: [모바일 스크롤·선택 전환](../features/mobile-calendar-mode-spec.md)
- 작업 기준점: main `efa8407`, 추적 파일 변경 없음. 기존 `.vscode/`, `apps/web/design-backups/`, `apps/web/design-previews/` 보존.
- 경계: 실제 격리 PostgreSQL fixture를 사용하는 Playwright 브라우저 터치 입력.
- 현재 상태: 정리 완료

## AC와 검증 연결

| AC | 관찰할 결과 | 검증 |
| --- | --- | --- |
| 1 | 첫 탭·시간 칸 스와이프가 선택을 변경하지 않고 스크롤 | 새 모바일 브라우저 테스트 |
| 2~3 | 선택 모드 편집·스크롤 복귀·이력·제출 보존 | 새 전환 테스트와 기존 터치 회귀 |
| 4 | 읽기 전용에서는 모드 숨김, PC 조작 유지 | 브라우저 회귀 |
| 5 | 320·393px 정렬·고정 버튼·높이 | 배치 검사·화면 검수 (스타일 TDD 비대상) |

## 실행 기록

Docker 소켓의 기본 샌드박스 접근은 거절됐으며 권한 확장 후 기존 컨테이너 실행 상태를 확인했다.

### AC1: 기본 스크롤

- RED: `docker compose exec -T tools npm run test:browser -- --grep '기본 스크롤에서'` exit 1, 320·393px 두 건 모두 첫 탭 후 `aria-pressed`가 기대 `false` 대신 `true`.
- 최소 수정: 기본 터치 선택 시작을 차단하고 시간 칸에 `touch-action: pan-y` 적용. 마우스 입력 유지.
- GREEN: 같은 명령 exit 0, 2/2 통과. 첫 탭·시간 칸 위 스와이프·페이지 스크롤·빈 편집 이력 확인.

### AC2~3: 명시적 선택 전환과 기본 상태 복귀

- RED: `docker compose exec -T tools npm run test:browser -- --grep '모바일 선택 전환으로'` exit 1, 스크롤 버튼 부재.
- GREEN: `--grep '모바일 선택 전환으로|기본 스크롤에서'` exit 0, 3/3 통과. 선택→스크롤 전환과 값·되돌리기·복구 보존, 320·393px 네 행·넘침·고정 버튼 확인.
- 후속 RED: `--grep '모바일 선택 전환으로|모바일 터치로 선택'` exit 1, 두 테스트 모두 보기 전환/제출 뒤 스크롤 버튼 `aria-pressed` 기대 `true` 대신 `false`.
- 수정: 다른 보기 이동과 제출 성공 때만 스크롤로 복귀한다. 제출 실패 시 편집 모드와 선택을 유지한다.
- GREEN: `--grep '모바일 선택 전환으로|기본 스크롤에서|모바일 터치로 선택|모바일 손가락|모바일 드래그|오른쪽 하단'` exit 0, 8/8 통과. 기존 터치 테스트의 명시적 선택 진입을 반영했으며 기존 선택·해제·취소·자동 스크롤 assertion을 유지했다.

## 화면 검수

- 320×640 스크롤 및 393×640 선택 캡처를 실제 열어 확인했다. 기존 도움말 줄에 두 버튼과 상태 안내가 표시되고 날짜·네 행·제출 영역을 유지한다.
- 로컬 Chromium 터치 에뮬레이션이며 실제 iPhone Safari·카카오톡 WebView는 미검증이다.

## 최종 검증

- Docker Node.js `v24.22.3`.
- `docker compose exec -T tools npm run test`: exit 0, 13파일 46개 통과.
- `docker compose exec -T tools npm run lint`: exit 0.
- `docker compose exec -T tools npm run test:browser -- e2e/availability.spec.ts e2e/candidates.spec.ts`: exit 0, 52/52 통과. 마우스·키보드·모바일·제출 실패/재시도·읽기 전용·전체 현황 회귀 포함.
- `docker compose exec -T tools npm run typecheck`: exit 0.
- 개발 서버를 잠시 중단한 뒤 `docker compose exec -T tools npm run build`: exit 0.
- `git diff --check`: exit 0.
- 검증 후 `docker compose exec -d tools sh -c 'npm run dev > /tmp/yaksok-calendar-mode-dev.log 2>&1'`로 기존 개발 서버 재시작, 내부 3000번 홈 HTTP 200 확인(호스트 localhost:3001).
- 서버·DB 로직 변경이 없어 별도 DB 통합 스위트는 실행하지 않았다. 브라우저 테스트는 기존 격리 DB를 사용했다. 운영 배포·실기기 테스트는 수행하지 않았다.

## 후속 Git 반영 요청

2026-11-20 사용자가 모바일 사용감 확인을 위해 UI 변경마다 바로 커밋·푸시하도록 지시했다. 위 검증 이후 제품 코드 추가 변경은 없으며 같은 검증 근거를 사용한다. 이번 수정과 관련 기록·협업 규칙만 커밋 대상으로 선택한다. 실기기 사용감은 사용자가 배포 화면에서 확인한다.
