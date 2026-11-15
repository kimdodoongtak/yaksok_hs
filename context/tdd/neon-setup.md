# Neon 연결 검증 — 2026-11-16

완료. 인프라 구성·환경 변수 연결이므로 TDD 비대상이며 실제 빌드·DB·앱 흐름으로 검증했다. 기존 제품 동작 검증을 새로운 RED/GREEN으로 기록하지 않는다.

## 초기화

- 최초 샌드박스의 `npm i -g neon@latest`는 `ENOTFOUND registry.npmjs.org`로 실패했다. 네트워크 접근을 허용한 재시도로 CLI 설치에 성공했다.
- 앱 루트 `apps/web/`에서 사용자 지정 `neon init -y --org-id org-still-cloud-28399590 --project-id wispy-resonance-33468060 --branch production --services postgres` 실행, exit 0. 인증 전에는 오프라인 연결만 기록했으며 이후 `neon login` 브라우저 인증 완료.
- CLI가 Neon 플러그인·스킬·MCP 설정을 사용자 영역에 설치했다. `neon.ts`, `.neon`, 앱 `.gitignore`, `@neon/config`·`@neon/env` 의존성을 생성했다.
- `neon config plan` 및 `neon deploy`: `production (br-curly-fire-azavy8w8)`, `No changes — branch production already matches the policy.`, `Utilized services: Postgres`, exit 0.
- `neon deploy`가 `.env.local`에 변수 5개를 저장했다. 실제 값은 기록하지 않는다. Functions는 선언·배포하지 않았으며 호스트 접미사 변수만 CLI가 함께 제공했다.
- 설치 시 중간 심각도 의존성 경고 7개 및 일부 설치 스크립트 허용 경고가 있었다. 무관한 일괄 업데이트는 수행하지 않았다.

## DB 적용

- `NEON_BRANCH_ID=br-curly-fire-azavy8w8`, 풀링·직접 연결의 호스트/DB/사용자 일치 여부 확인. 비밀값 출력 없음.
- 직접 연결 조회: PostgreSQL `17.12`, DB `neondb`, 적용 전 public 테이블 0개. 기존 데이터가 없는 최초 연결임을 확인했다.
- `docker exec yaksok-neon-verify env -u DATABASE_URL -u DIRECT_URL npm run db:deploy`: 기존 마이그레이션 5개 적용, `All migrations have been successfully applied.`, exit 0.
- 같은 환경의 `npm run db:status`: `Database schema is up to date!`, exit 0.
- 로컬 개발 컨테이너와 분리한 임시 Docker Node.js `v24.22.3` 컨테이너를 사용했다. 해당 프로세스에서만 Compose의 로컬 DB 변수를 해제하고 앱 `.env.local`을 읽었다. `.next`·`.next-browser`는 별도 임시 볼륨으로 분리했다.

## 빌드와 정적 검증

- `docker exec yaksok-neon-verify env -u DATABASE_URL -u DIRECT_URL npm run build`: exit 0. Prisma Client 7.10.1 생성, Next.js 16.4.3 `Compiled successfully in 9.7s`, TypeScript 완료, 정적 페이지 3/3 생성.
- `docker exec yaksok-neon-verify npm run lint`: exit 0.
- 빌드 뒤 `docker exec yaksok-neon-verify npm run typecheck`: exit 0.
- 로컬 설정의 `docker compose exec -T tools npm run test`: 파일 12개·테스트 35개 통과, exit 0.
- `npm audit --omit=dev --json`: exit 0, 운영 의존성 취약점 0개. 최초 전체 설치의 중간 심각도 경고 7개를 모두 해결했다고 주장하지 않는다.
- `git check-ignore apps/web/.neon apps/web/.env.local`: 둘 다 Git 제외 확인. `git diff --check` 통과.

## 운영 모드 앱과 Neon 실제 흐름

`docker exec yaksok-neon-verify env -u DATABASE_URL -u DIRECT_URL npm run start -- --port 3000`으로 빌드한 앱을 시작했다. `Ready in 121ms`를 확인했다. 기존 Docker 도구 컨테이너의 Chromium에서 루프백 TCP 프록시를 통해 운영 앱에 접속했다. HTTPS 배포를 검증한 것은 아니다.

앱의 서버 발급 서비스로 이번 검증용 링크 하나만 발급하고 브라우저 두 컨텍스트를 사용했다. 기존 통합·E2E 테스트 모음이나 DB 초기화·테스트 트리거를 Neon에 실행하지 않았다.

1. 홈 HTTP 200.
2. 방장 닉네임·PIN 등록 → 설정 → 모집 시작 → 새로고침. Neon `collecting` 상태와 Secure/HttpOnly 쿠키 확인.
3. 두 번째 브라우저 참여 → 가능 시간 선택·제출 → 직접 Neon 조회로 저장 슬롯·제출 시각 확인 → 새로고침 뒤 같은 선택 유지 확인.
4. 방장 관리 화면에서 확인용 약속 취소 → Neon `cancelled` 확인. 기록 보존 정책을 따라 확인용 약속 1개·참여자 2명·제출 기록은 남겼다. 실제 사용자 데이터 삭제 없음.

실행 명령:

```bash
docker compose exec -T tools env -u DATABASE_URL -u DIRECT_URL node --env-file=.env.local --conditions=react-server --import ./scripts/register-typescript.mjs test-results/neon-smoke.mjs
```

최종 출력(exit 0):

```text
PASS production home HTTP 200
PASS host registration + settings + Neon persistence + Secure/HttpOnly session
PASS second browser registration + availability submit + Neon row + reload
PASS smoke promise cancelled through UI; records retained
NEON_SMOKE_PASS
```

- 첫 시도는 참여 완료 확인의 기본 assertion 제한 5초를 넘겨 exit 1. 이후 스크린샷에서 참여 완료 화면을 확인했다. 원격 검증 대기시간을 30초로 맞추고 같은 약속·세션을 재사용해 이어서 통과했다. 앱 오류 수정이나 성능 개선으로 기록하지 않는다.
- 일회성 검증 스크립트와 화면은 Git 제외 `apps/web/test-results/`에 있다. 성공 화면 `neon-submission.png`, 첫 실패 시점 화면 `neon-host-failure.png`·`neon-member-failure.png`. 실행은 확인 데이터를 쓰므로 일반 회귀 명령으로 사용하지 않는다.
- pg가 향후 메이저 버전의 SSL 모드 의미 변경 경고를 출력했다. 현재 인증서 검증을 끄거나 Neon TLS 옵션을 변경하지 않았다.
- 기존 로컬 개발 서버 HTTP 200 확인. 기존 Docker의 `npm run db:status`가 로컬 `sdd`·`db:5432`를 사용하고 최신 상태인 것도 확인했다. 임시 검증 서버·컨테이너·볼륨과 브라우저 세션 임시 파일은 작업 후 정리 완료했다.

## 남은 범위

- Vercel 공개 호스팅, 실제 HTTPS 도메인·Vercel 헤더, 실제 iPhone Safari, 다중 사용자 부하는 이번 검증에 포함하지 않는다.
- 전체 DB 통합·브라우저 회귀는 이번 연결 변경에서 재실행하지 않았다. 제품 로직·스키마 변경은 없다.
- 커밋·푸시는 수행하지 않았다.
