# TDD 실행 기록: 011 홈에서 약속 만들기

- 스펙: [011](../features/011-web-invitation-spec.md)
- 기준점: main `40e86e0`. 기존 `.gitignore`·Vercel 배포 문서·현재 작업 변경 및 사용자 미추적 파일을 보존한다.
- 테스트 경계: Server Action, 브라우저와 격리된 실제 `sdd_test` DB.
- 현재 상태: 완료 — 최종 검증 통과.

## AC와 검증 연결

| AC | 기대 동작 | 검증 |
| --- | --- | --- |
| 1·2 | 명시적 생성→방장 등록→설정→초대 공유 | `e2e/web-invitation.spec.ts` |
| 3·4 | 저장 실패·출처·요청 제한, 안전한 이동 | `src/actions/create-invitation.test.ts`, 브라우저 |
| 5 | 반응형·기존 티켓 스타일 | 320·393·1280px 실제 화면 |

## 실행 기록

실행 후 RED/GREEN·최종 검증을 이어 기록한다. 기존 발급 서비스·요청 제한 DB 회귀는 사후 검증이며 스타일·문서는 TDD 비대상이다.


| 단계 | 실제 RED | 실제 GREEN |
| --- | --- | --- |
| AC1·2 홈 생성 | `docker compose exec -T tools npm run test:browser -- e2e/web-invitation.spec.ts`: exit 1, ‘약속 만들기’ 버튼 없음 | 같은 명령 exit 0, 1 passed (14.0s). 실제 링크 저장·방장 등록·설정·클립보드·다른 브라우저 진입 확인 |
| AC4 동일 출처 | `docker compose exec -T tools npm run test -- src/actions/create-invitation.test.ts`: exit 1, 잘못된 출처 3건이 거절되지 않고 REDIRECT 발생 | 출처 확인 추가 후 같은 명령 exit 0, 3 passed |
| AC4 생성 예산 | 같은 단위 명령 exit 1, 4 failed/3 passed. 제한 무시 및 consumeRequest 0회 | 생성 전용 키로 DB 제한기 연결 후 exit 0, 7 passed |
| AC3 저장 실패 | 같은 단위 명령 exit 1, 원시 저장 오류가 전파되어 1 failed/7 passed | try/catch·안전 안내 후 전체 `npm run test` exit 0, 43 passed(신규 8). redirect는 catch 밖에 유지 |

브라우저 처리 중·제한 오류·키보드 재시도는 동작 구현 후 추가한 사후 검증이다. DB 서비스의 기존 동시 요청 제한 테스트도 회귀로 구분한다.


## 최종 검증 (2026-11-16)

Docker Node.js `v24.22.3`에서 실행했다. 명령은 프로젝트 루트의 `docker compose exec -T tools` 뒤에 이어 실행한다.

| 검증 | 명령 | 실제 결과 |
| --- | --- | --- |
| 전체 단위 | `npm run test` | exit 0, 13 files / 43 passed |
| 관련 실제 PostgreSQL | `npm run test:integration -- src/lib/invitation/invitation.integration.test.ts src/lib/participant-access/participant-access.integration.test.ts` | exit 0, 32 passed, 격리 `sdd_test`, 5개 마이그레이션 최신 |
| 관련 브라우저 회귀 | `npm run test:browser -- e2e/web-invitation.spec.ts e2e/invitation.spec.ts e2e/promise-settings.spec.ts e2e/participant-access.spec.ts` | exit 0, 20 passed (1.5m) |
| 린트 | `npm run lint` | exit 0 |
| 타입 검사 | `npm run typecheck` | exit 0 |
| 운영 빌드 | `npm run build` | exit 0, Compiled successfully / 정적 홈·동적 약속 경로 생성 |
| 화면 | `test-results/home-create-{320,393,1280}.png`, 오류 화면 | 빨강 티켓·생성 버튼·오류 안내 확인. 320px 안내 단어 단위 줄바꿈 보완 후 새 홈 2개 재통과(12.2s), 최종 화면 직접 확인 |

기존 외부 Origin 거절 테스트가 의도적으로 `Invalid Server Actions request` 및 브라우저 unexpected response 로그를 발생시켰으며 해당 차단 테스트는 통과했다. 일반 생성 흐름의 오류로 해석하지 않는다. 컨테이너에 `ps`·`kill` 실행 파일이 없어 해당 환경 확인/종료 명령은 exit 127이었고, `/proc` 조회·Node `process.kill`로 개발 서버를 확인하고 종료했다. 빌드는 정상 종료했다.

## 수용 기준 검토

| AC | 결과·근거 | 남은 작업 |
| --- | --- | --- |
| 1·2 | 홈 GET 불변·명시적 POST 발급·실제 DB 링크만 저장·방장 등록·모집·클립보드·손님 브라우저 확인 | 없음 |
| 3 | 저장 오류 안전 반환(단위), pending 비활성화·제한 안내 후 Enter 재시도(브라우저) | 없음 |
| 4 | 출처 거절·별도 생성 예산·신뢰 IP 경계(단위), 실제 DB 제한 거절·만료 후 복구(브라우저), 동시 제한 회귀(DB) | 없음 |
| 5 | 화면 3개 폭 및 가로 넘침 없음, 키보드 Enter 동작 확인 | 없음 |

이번 변경에서 스키마·환경 변수·의존성을 추가하지 않았다. Neon/Vercel 운영 데이터에 테스트를 실행하지 않았으며 실제 iPhone Safari·운영 배포는 미검증이다. 공개 생성의 처리 중 연타는 막지만 별도 요청의 전역 멱등성은 범위 밖이다.

마지막 단어 단위 줄바꿈 보완 후 `npm run lint`·`npm run typecheck`·`npm run build`를 순차 재실행해 모두 exit 0 확인. 최종 빌드 출력: `Compiled successfully in 1499ms`, 정적 홈 및 기존 동적 약속 경로 생성.

로컬 개발 서버를 다시 시작하고 홈 응답 `{"status":200,"hasCreateButton":true}`를 확인했다. 사용자 확인 주소는 `http://localhost:3001`이다.
