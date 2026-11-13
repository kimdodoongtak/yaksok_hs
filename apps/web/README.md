# 개발 영역: Next.js 풀스택 앱

이 폴더에 앱 개발 파일을 모은다. 시작 화면·Prisma 연결과 001 초대·방장 등록·세션·초안 만료 기능이 있다.

- `src/app/`: 한국어 시작 화면, `/p/[inviteToken]` 초대·설정 진입·상태 조회
- `src/lib/prisma.ts`: 개발 중 재사용하는 서버 전용 Prisma Client
- `src/generated/prisma/`: `npm run db:generate`로 생성하는 Client, Git 제외
- `public/`: 이후 추가할 정적 파일
- `prisma/`: DB 스키마와 CHECK·조건부 UNIQUE를 포함한 마이그레이션
- `package.json`과 설정 파일: 이 앱의 의존성과 실행·빌드 설정
- `.env.example`: 호스트 실행용 환경 변수 예시

AI 도구와 Docker Compose는 두 단계 위 프로젝트 루트에서 사용한다. Docker의 `tools`는 자동으로 이 앱 폴더에서 명령을 실행한다. 호스트에서 직접 `npm`을 사용할 때는 이 폴더에서 실행한다.

컨테이너를 시작하고 의존성을 설치한 뒤 `docker compose exec tools npm run db:generate`, `docker compose exec tools npm run dev`를 실행하면 `http://localhost:3001`에서 시작 화면을 확인할 수 있다. 초대 링크는 `npm run invite:local`로 만들며 단위·DB 통합·Playwright 검증 절차는 로컬 개발 안내를 따른다.

[전체 사용 가이드](../../사용가이드.md) · [로컬 개발](../../docs/local-development.md)
