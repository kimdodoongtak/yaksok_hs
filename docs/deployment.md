# Vercel과 Neon 배포

기존 Next.js 앱의 Neon DB 연결과 Vercel 공개 배포 절차다. Neon 서비스 설정 적용과 Vercel 앱 배포는 별개다. 실제 실행 상태는 [Neon 검증 기록](../context/tdd/neon-setup.md)을 따른다.

## 2026-11-16 실제 운영 배포 확인

- 운영 주소: https://yaksok-hs.vercel.app
- 기존 프로젝트: `yaksok-hs/yaksok-hs`, 앱 루트 `apps/web`.
- 배포 `dpl_2BT4rp9fsNNdDP8gPT9jjXjYFgN3`: Production / READY, 커밋 `40e86e0`, 빌드 1분 37초. Vercel API와 빌드 로그로 확인했다.
- 실제 배포 Node.js는 `24.x`다. 프로젝트 화면의 기본값 `26.x`와 다르지만 앱 `engines.node`의 24.x가 적용된 것을 API 및 런타임 로그에서 확인했다.
- `DATABASE_URL`·`DIRECT_URL`은 Secret으로 Production에만 등록되어 있다. Preview 변수는 아직 없다.
- HTTPS 홈 HTTP 200 및 형식이 유효하지만 존재하지 않는 초대 토큰의 DB 조회·무효 링크 안내 HTTP 200을 확인했다. 이번 단계에서 운영 DB 쓰기나 전체 제품 흐름 검증은 하지 않았다.
- 최근 30분 error 로그 조회에는 pg의 향후 SSL 모드 변경 경고 1건이 있었다. 검사한 요청은 정상 응답했으며, 오류가 전혀 없다고 해석하지 않는다.
- 사용자 요청의 [Vercel 에이전트 설정 가이드](https://vercel.com/get-started.md)에 따라 CLI `65.16.0` 설치·`kimdodoongtak` 인증, 사용자 범위 Vercel 플러그인 설치·활성화, `https://mcp.vercel.com` 공유 MCP 등록·OAuth 로그인을 완료했다.
- Codex 설정은 사용자 `~/.codex/config.toml`에 병합했다. 재시작 후 `search_vercel_documentation` 호출 성공, `list_teams`는 빈 목록을 반환했다. 알려진 프로젝트·팀 ID를 지정한 `get_project`는 팀 권한 부족으로 HTTP 403을 반환했다. `authorize_team_access`로 일회성 팀 승인 링크를 사용자에게 제공했으며 승인 후 같은 조회를 재검증해야 한다. CLI의 기존 문서 검색·팀 조회·배포 확인 성공과 MCP의 팀 권한 상태를 구분한다.
- 로컬 연결 정보는 Git 제외 `apps/web/.vercel/`에 있다. CLI link가 `.env.local`에 `VERCEL_OIDC_TOKEN`을 추가했으며 기존 Neon 변수와 브랜치가 유지됨을 값 출력 없이 확인했다.
- 이번 작업은 기존 배포 확인과 에이전트 도구 설정이다. 새 배포·도메인 구매·추가 서비스 활성화·커밋·푸시는 수행하지 않았다.

## 연결 준비

1. Neon에 프로젝트와 PostgreSQL DB를 준비한다. 로컬 PostgreSQL과 메이저 버전을 맞춘다.
2. 운영과 미리보기는 다른 Neon 브랜치 또는 별도 DB를 사용한다. 미리보기 앱이 운영 DB를 변경하지 않게 한다.
3. 각 환경에서 풀링 연결 문자열과 직접 연결 문자열을 얻는다. 두 문자열의 브랜치·DB·사용자가 같은 대상인지 확인한다.
4. Neon에서 제공한 TLS 옵션을 유지한다. 연결 실패를 해결하기 위해 인증서 검증을 끄지 않는다.

| 환경 변수 | 사용 위치 | 값 |
| --- | --- | --- |
| `DATABASE_URL` | 앱의 Prisma 어댑터 | 해당 환경의 Neon 풀링 주소 |
| `DIRECT_URL` | Prisma CLI | 같은 환경의 Neon 직접 연결 주소 |

Neon CLI는 직접 연결을 `DATABASE_URL_UNPOOLED`로 제공한다. Prisma CLI는 `apps/web/.env.local` → `.env` 순서로 읽으며, 이미 주입된 환경 변수는 덮어쓰지 않는다. `DIRECT_URL`이 있으면 우선하고, 없으면 `DATABASE_URL_UNPOOLED`를 사용한다. Vercel에서도 같은 우선순위가 적용된다.

## Neon CLI 연결

앱 루트 `apps/web/`에서 실행한다. `neon.ts`는 Postgres만 사용하는 설정이며 별도 Functions·Auth·스토리지는 선언하지 않는다. `.neon`과 `.env.local`은 Git에서 제외한다.

```bash
neon init -y --org-id org-still-cloud-28399590 --project-id wispy-resonance-33468060 --branch production --services postgres
neon login # 인증이 없을 때만 브라우저 로그인
neon config plan
neon deploy
```

`neon deploy`는 Neon 서비스 설정과 환경 변수 가져오기까지 수행한다. Prisma 테이블 적용이나 Next.js 공개 호스팅을 대신하지 않는다. `.env.local`을 가져온 호스트 앱은 운영 DB를 사용하므로 일반 개발·테스트는 기존 Docker 환경을 사용한다.

Vercel의 Production과 Preview 환경에 값을 각각 설정한다. 로컬 Compose용 변수는 Vercel에 필요하지 않다. 실제 연결 문자열은 저장소에 넣지 않는다. [Neon 공식 연결 안내](https://neon.com/docs/guides/prisma).

## Vercel 프로젝트 설정

- Framework Preset: Next.js
- Root Directory: 이 작업폴더를 저장소 루트로 사용하면 `apps/web`. 더 큰 저장소의 하위 폴더에 넣었다면 실제 저장소 루트부터 이 앱까지의 경로를 지정한다.
- Node.js Version: 24.x (`apps/web/package.json`의 `engines.node`도 24.x)
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: Next.js 기본값

`apps/web/vercel.json`에 프레임워크와 설치·빌드 명령을 기록했다. Dockerfile은 로컬 작업용이며 Vercel은 Next.js를 직접 빌드한다. [Vercel Node.js 버전 설정](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

아래 npm 명령은 앱 루트인 `apps/web/`를 작업 위치로 실행한다. Vercel도 위 Root Directory 안의 패키지·설정·잠금 파일을 사용한다.

## 스키마와 앱 적용 순서

1. 로컬에서 모델을 바꾸고 `npm run db:migrate -- --name <변경명>`으로 마이그레이션을 만든다.
2. `npm run db:generate`, 관련 테스트·린트·타입 검사·빌드를 확인한다.
3. 미리보기 DB에서 `npm run db:deploy`, `npm run db:status`를 실행하고 미리보기 앱을 검증한다.
4. 운영 배포 시 변경 SQL과 데이터 영향을 확인한다. 기존 앱도 동작할 수 있는 스키마 변경부터 적용한다.
5. 운영 환경 변수를 가진 신뢰할 수 있는 Node.js 24 배포 작업에서 `npm ci`, `npm run db:deploy`, `npm run db:status`를 실행한 뒤 앱을 배포한다. 로컬 Compose의 `tools`는 항상 로컬 DB를 가리키므로 운영 적용용으로 사용하지 않는다.
6. 배포 후 주요 사용자 흐름·서버 오류·DB 연결을 확인한다.

일반 빌드 명령에는 마이그레이션을 묶지 않았다. 미리보기 빌드마다 운영 DB를 변경하거나 여러 빌드가 동시에 스키마를 바꾸지 않도록 **DB 적용 → 앱 배포**를 배포 작업에서 명시적으로 연결한다. 첫 배포 이후에도 새 마이그레이션이 있으면 이 단계를 생략하지 않는다.

앱 되돌리기가 DB 스키마를 되돌려 주지는 않는다. 컬럼 삭제·데이터 변환처럼 되돌리기 어려운 변경은 호환 단계와 복구 방법을 해당 기능 스펙에 기록한다.
