# Next.js 풀스택 + TDD — Codex 작업폴더

원본 `nextjs-fullstack.zip`의 기술 스택과 개발 환경을 유지하고 스펙 기반 개발에 TDD를 추가했다. 현재는 앱 설정·문서·스킬이 준비된 템플릿이며 제품 소스·도메인 모델·제품 테스트는 없다.

## 구성

| 위치 | 용도 |
| --- | --- |
| `AGENTS.md` | Codex가 읽는 프로젝트 지침 |
| `.agents/skills/` | 실제 파일로 구성한 프로젝트 전용 스킬 5개 |
| `apps/web/` | Next.js 16 · TypeScript 5 · Prisma 7 · Tailwind CSS 4 앱 설정 |
| `context/inputs/` | PRD·ERD·정책과 Figma 링크 등 원본 자료 |
| `context/features/` | 기능 명세·수용 기준·TDD 계획 |
| `context/tdd-policy.md` | RED → GREEN → REFACTOR와 검증 기준 |
| `context/tdd/` | 기능별 실제 테스트 실행 기록 |
| `docs/` | 개발·배포·TDD 사용·검증 안내 |

로컬은 Docker Node.js 24 + PostgreSQL 17, 운영은 Vercel + Neon을 기준으로 한다. 인증·제품 데이터·업무 규칙은 최신 서비스 자료를 읽어 정한다.

## 시작하기

압축을 풀고 **이 README가 있는 `nextjs-fullstack-codex-tdd/`를 프로젝트 루트로 연다.** 원본 ZIP의 다른 작업폴더와 함께 열지 않는다. 스킬은 개인 계정에 설치할 필요 없이 이 프로젝트에서 사용한다.

1. Docker Desktop과 Codex를 준비한다. Figma를 읽으려면 해당 도구의 Figma 연결과 권한을 설정한다.
2. `context/inputs/`에 자료를 두고 아래 명령으로 기능 명세를 작성한다.

```text
$prd-to-specs context/inputs/
```

3. 실제 명세와 미정 정책을 검토한다. 앱이 없는 최초 작업은 다음과 같다.

```text
$feature 불러오기 000-project-bootstrap.md
$feature 시작
$feature 검토
$feature 테스트
$feature 완료
```

4. 이후 생성된 제품 스펙을 하나씩 불러와 같은 흐름을 반복한다. `시작` 안에서 TDD를 수행하고 `테스트`에서 최종 회귀 검증을 한다.

Docker 환경 준비 명령은 이 루트에서 실행한다. `.env`가 이미 있으면 복사로 덮어쓰지 않는다.

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec tools npm ci
docker compose exec tools npm run db:validate
```

아직 앱 소스가 없으므로 위 명령은 작업 환경과 DB를 준비한다. 앱 생성 후 실행·빌드·테스트 명령은 가이드를 따른다.

## 스킬

| 호출 | 역할 |
| --- | --- |
| `$prd-to-specs` | 원본 자료 → 기능 명세·의존관계·TDD 적용 계획 |
| `$feature` | 불러오기·TDD 구현·리뷰·회귀 검증·완료 기록 |
| `$research` | 근거 기반 조사 |
| `$cleanup` | 작업·코드·문서 정리 |
| `$list-components` | 실제 컴포넌트 목록 확인 |

스킬 목록에 나타나지 않으면 프로젝트 루트에서 새 세션을 열어 확인하고 `.agents/skills/feature/SKILL.md`처럼 정확한 경로를 직접 지정할 수 있다. 이 배포본에는 심볼릭 링크나 경로 문자열만 든 스킬 파일이 없다.

## 가이드

- [사용 가이드](사용가이드.md)
- [TDD 사용 가이드](docs/tdd-guide.md)
- [TDD 정책](context/tdd-policy.md)
- [로컬 개발](docs/local-development.md)
- [배포](docs/deployment.md)
- [변경 내역](TDD-CHANGES.md)
- [원본 작성자의 검증 기록](docs/verification.md)
- [이번 작업폴더 검증](docs/tdd-package-verification.md)

두 배포본의 개발 규칙은 같고 에이전트 지침 파일·스킬 위치·명령 표기가 다르다. Compose 프로젝트 이름과 호스트 포트도 분리해 두 폴더의 데이터·볼륨 충돌을 피한다. 원본의 `main` 작업 정책은 유지했다. 세 명이 동시에 개발할 저장소에서는 브랜치와 진행 기록 정책을 별도로 정한다. Claude용 기본 포트는 앱 3000 / DB 55432 / Studio 5555, Codex용은 앱 3001 / DB 55433 / Studio 5556이다. 기존 `.env`를 가져올 때도 프로젝트 이름·포트의 분리를 유지한다.
