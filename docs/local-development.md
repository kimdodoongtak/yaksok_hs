# Docker Desktop 로컬 개발

## 처음 실행

Docker Desktop을 켜고 프로젝트 루트인 `nextjs-fullstack/` 또는 그 복사본 디렉터리에서 실행한다. `.env`가 이미 있다면 덮어쓰지 말고 `.env.example`의 필요한 이름만 반영한다.

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec tools node --version
docker compose exec tools npm ci
docker compose exec tools npm run db:validate
docker compose exec db psql -U sdd -d sdd -c 'SELECT 1;'
```

`tools`는 명령을 실행할 Node.js 24 작업 컨테이너다. 앱 소스가 없어도 유지된다. `db`는 PostgreSQL이며 건강 상태 확인을 통과한 뒤 작업 컨테이너가 시작된다. [Compose 시작 순서 기준](https://docs.docker.com/compose/how-tos/startup-order/).

호스트 편집기로 파일을 고치면 `/workspace`에 반영된다. `tools`의 기본 작업 위치는 `/workspace/apps/web`이다. `node_modules`와 `.next`는 Linux 전용 Docker 볼륨에 있으므로 호스트 설치물과 섞이지 않는다. 호스트 편집기에서 모듈 타입을 찾지 못하면 컨테이너에 연결해 작업하거나 호스트에서도 Node.js 24를 사용해 `apps/web/`에서 `npm ci`를 실행한다. 실제 검증 기준은 컨테이너다.

## 두 환경 파일의 역할

- 루트 `.env`: Compose 프로젝트 이름과 호스트 포트만 설정한다.
- `apps/web/.env`: 호스트에서 앱을 직접 실행할 때 사용하는 DB 연결·앱 변수다. Docker만 사용하면 필수 파일이 아니다.

호스트 Node.js 24에서 실행하려면 먼저 루트에서 `docker compose up -d db`를 실행한 뒤 아래 순서로 앱 환경을 준비한다. 기존 `.env`는 덮어쓰지 않는다.

```bash
cd apps/web
cp .env.example .env
npm ci
npm run db:validate
```

이후 호스트 npm 명령은 `apps/web/`에서 실행한다. Docker Compose 명령을 실행하려면 프로젝트 루트로 돌아간다.

## 주소

| 용도 | 호스트 | 컨테이너 내부 |
| --- | --- | --- |
| 앱 생성 후 개발 서버 | `http://localhost:3001` | `0.0.0.0:3000` |
| PostgreSQL | `localhost:55433` | `db:5432` |
| Prisma Studio 실행 후 | `http://localhost:5556` | `5555` |

DB 이름과 사용자는 `sdd`, 비밀번호는 로컬 전용 예시값이다. 포트는 호스트의 `127.0.0.1`에만 공개한다. `.env`에서 `APP_PORT`, `POSTGRES_PORT`, `STUDIO_PORT`를 변경할 수 있다. 호스트에서 Prisma를 실행한다면 `apps/web/.env`의 `DATABASE_URL`과 `DIRECT_URL` 포트도 함께 바꾼다. 컨테이너 내부 DB 포트는 항상 5432다.

여러 복사본을 동시에 실행하려면 `.env`의 `COMPOSE_PROJECT_NAME`과 세 호스트 포트를 각각 다르게 지정한다. 기존 DB 볼륨을 사용 중이면 프로젝트 이름 변경으로 새 볼륨이 선택된다는 점도 확인한다.

## 앱 생성 후

`000-project-bootstrap`으로 최소 시작 화면과 Prisma 연결 모듈을 추가했다. 처음 실행할 때는 Client를 먼저 생성한다.

```bash
docker compose exec tools npm run db:generate
# 이 터미널은 개발 서버를 실행한 채 유지한다.
docker compose exec tools npm run dev
```

별도 터미널에서 검증한다.

```bash
docker compose exec tools npm run lint
docker compose exec tools npm run typecheck
docker compose exec tools npm run build
```

단위 테스트는 `docker compose exec tools npm run test`로 실행한다. DB 통합·브라우저 검증은 아래 전용 테스트 DB 절차를 따른다. 개발 서버와 빌드가 같은 `.next`를 사용하므로 빌드할 때는 개발 서버를 `Ctrl+C`로 멈추고 완료 후 다시 시작한다.

## 모델을 추가한 뒤

```bash
docker compose exec tools npm run db:migrate -- --name init
docker compose exec tools npm run db:generate
docker compose exec tools npm run db:status
docker compose exec tools npm run db:studio
```

마이그레이션 파일은 소스와 함께 보관한다. 001에서 링크·약속·참여자·세션 모델과 SQL CHECK·조건부 UNIQUE를 도입했다. 새 환경에서는 `npm run db:deploy`로 기존 마이그레이션을 적용하고 `npm run db:generate`로 Client를 생성한다. 스키마 수정 시에는 위 `db:migrate` 절차를 사용한다. 생성 경로 `apps/web/src/generated/prisma/`는 Git 제외다.

Prisma 7의 연결 설정은 `apps/web/prisma.config.ts`에서 관리한다. [Prisma 7 기준](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7).

## 의존성과 재시작

잠금 파일이 바뀌면 `docker compose exec tools npm ci`를 실행한다. 패키지를 추가할 때도 컨테이너에서 `npm install`을 실행해 `apps/web/package.json`과 `apps/web/package-lock.json`을 함께 갱신한다. 메이저 버전은 프로젝트에서 확정한 범위를 유지한다.

```bash
docker compose ps
docker compose logs --tail 100 db
docker compose stop
docker compose start
docker compose down
```

`down`은 컨테이너와 네트워크를 제거하고 데이터 볼륨을 보존한다. `down --volumes`는 DB 데이터까지 지우므로 초기화가 필요하고 데이터를 버려도 되는 경우에만 사용한다.

## 문제 확인

- 연결 실패: Docker Desktop 실행 여부와 `docker compose ps`, DB 로그를 확인한다.
- 포트 충돌: `.env`에서 사용하지 않는 포트로 바꾸고 `docker compose up -d`를 다시 실행한다.
- 호스트 `localhost`를 컨테이너 DB 주소로 사용하지 않는다. 컨테이너 안의 주소는 `db`다.
- 새 환경 변수: 루트 `.env`는 Compose 치환용이며 앱에 자동 전달되지 않는다. `apps/web/.env`는 앱/Prisma가 읽는 파일이며 환경 변경 후 해당 프로세스를 재시작한다. 필요한 앱 변수를 `compose.yaml`의 `tools.environment`에 추가하고 컨테이너를 재생성한다. 로컬 DB URL 고정값은 유지한다.
- 컨테이너 메모리 부족: Docker Desktop의 자원 설정과 현재 실행 중인 다른 컨테이너를 확인한다.


## 001 초대 기능 확인

홈의 ‘약속 만들기’를 누르면 새 링크를 발급받아 방장 등록과 설정을 시작한다. 로컬 개발에서는 아래 명령으로 미사용 링크만 발급할 수도 있다.

```bash
docker compose exec tools npm run db:deploy
docker compose exec tools npm run db:generate
docker compose exec tools npm run invite:local
```

출력된 `/p/...` 경로를 `http://localhost:3001` 뒤에 붙여 연다. 발급은 링크 행만 만들고 방장 등록은 폼 제출 시 일어난다. 개발 DB `sdd`·로컬 호스트·역할을 확인하며 원격 DB에서는 발급 스크립트가 거부한다. 날짜·정원 설정과 모집 시작은 002, 일반 참여·재로그인·PIN 변경은 003으로 연결했다. 모집 중인 링크를 시크릿 창에서 열면 친구 참여 화면을 볼 수 있다.

## 격리된 DB·브라우저 테스트

```bash
docker compose exec tools npm run test:db:setup
docker compose exec tools npm run test:integration
# Chromium과 시스템 라이브러리는 컨테이너 최초 한 번 설치한다.
docker compose exec tools npx playwright install --with-deps chromium
docker compose exec tools npm run test:browser
```

- `test:db:setup`은 로컬 개발 DB 관리 연결을 확인한 뒤 별도 `sdd_test` DB와 같은 이름의 비관리자 역할을 준비한다. `.env.test`가 있으면 연결 확인만 하고 덮어쓰지 않는다. 환경 파일 없이 기존 DB·역할이 발견되면 중단한다.
- `apps/web/.env.test`의 `TEST_DATABASE_URL`은 Git에서 제외하며 비밀값을 문서·출력에 복사하지 않는다. Docker 기준 호스트는 `db`, DB·역할은 `sdd_test`다. 호스트에서 별도 실행할 때만 localhost와 현재 매핑 포트를 쓴다.
- 실행기는 URL의 로컬 호스트·DB·역할·추가 옵션을 검사하고 실제 `current_database()`·`current_user`까지 확인한 뒤 마이그레이션과 테스트를 실행한다. 개발·Neon DB에 테스트를 실행하지 않는다.
- 테스트는 난수 링크를 만들고 자신이 만든 데이터만 세션→참여자→약속→링크 순서로 정리한다. 통합·브라우저 명령은 **차례로** 실행한다. 롤백 검증용 trigger를 설치하므로 둘을 같은 테스트 DB에서 동시에 돌리지 않는다.
- 브라우저 테스트와 `typecheck`·`build`도 **차례로** 실행한다. `tsconfig.json`이 `.next-browser/dev/types`를 포함하므로 테스트 서버가 타입 파일을 재생성하는 동안 빌드하면 `TS6053: File ... not found`가 발생할 수 있다. 브라우저 테스트가 완전히 종료된 뒤 타입 검사·빌드를 실행한다.
- Playwright는 Docker 내부 `127.0.0.1:3100`에 격리 테스트 DB를 쓰는 전용 Next 서버를 띄운 뒤 종료한다. `.next-browser/`로 개발 서버의 `.next/`와 분리한다. 테스트가 서버 상태의 시각을 변경하는 대상은 테스트 DB의 자기 링크뿐이다. 서비스 시간 우회 API는 없다.
- `test-results/`의 Chromium 화면(320·390·1440px)은 로컬 검수 산출물이며 Git 제외다. 화면은 신규 제안으로, 미제공 Figma 원본과의 일치를 주장하지 않는다.
- 현재 로컬 `.env`는 다른 프로젝트와의 충돌을 피해 PostgreSQL 호스트 포트를 **55434**로 바꿨다. 표의 55433은 템플릿 기본값이며 컨테이너 안은 항상 `db:5432`다.


## 003 참여·인증 확인

- 모집 시작 후 같은 초대 링크를 다른 브라우저/시크릿 창에서 열면 처음 참여·다시 로그인 폼이 표시된다. 본인 화면에서 PIN 변경·현재 기기 로그아웃을 사용할 수 있다.
- PIN 변경은 현재 PIN 검증 후 모든 기존 세션을 폐기한다. 닉네임·PIN 찾기는 제공하지 않는다. 가능 시간 선택·제출은 후속 004 범위다.
- 로컬 및 Vercel 헤더가 확인되지 않는 환경은 임의 전달 IP를 신뢰하지 않고 `unknown` 요청 예산을 공유한다. 따라서 로컬에서 등록·로그인·PIN 변경을 합쳐 10분 내 30회 넘게 요청하면 잠시 제한될 수 있다. 계정별 PIN 연속 5회/10분 제한과 별도다.
- 보안용 `auth_attempts` 마이그레이션도 기존 `db:deploy`에 포함된다. 개발 DB를 초기화할 필요는 없다. 실제 운영의 헤더·HTTPS·쿠키 검증은 Vercel 배포 때 별도로 수행한다.

## 개발 화면이 계속 새로고침될 때

2026-11-25에는 소스 변경 없이 Turbopack HMR `restart`가 반복되는 로컬 캐시 이상을 관찰했다. 브라우저의 정상 5초 상태 폴링과 구분한다. 같은 상황이면 실행 중인 개발 서버만 종료한 뒤 `.next/dev`를 백업하고 동일 포트로 재시작한다. DB·소스는 초기화하지 않는다. 이후 실제 `localhost` 주소에서 로그인 입력과 후보 명단을 열어 둔 채 HMR 재시작이 멈췄는지 확인한다. HTTP 200만으로 정상이라고 판단하지 않는다. [재현·복구 기록](../context/fixes/local-hmr-reload-loop.md).
