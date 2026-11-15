# Neon Postgres 연결 설정

- 요청: 기존 앱을 지정된 Neon 프로젝트 `wispy-resonance-33468060`의 `production` 브랜치에 연결하고 빌드·실제 앱 흐름을 검증한다.
- 범위: `apps/web/`에서 Neon CLI 초기화·Postgres 설정 적용·환경 변수 연결·기존 Prisma 마이그레이션 적용. Next.js 앱의 공개 호스팅은 Vercel 후속 작업이다.
- 기존 Node.js 24·Prisma 7·`@prisma/adapter-pg`를 유지한다. 서비스 추가·인증 교체·새 도메인 모델은 없다.
- Neon CLI의 `DATABASE_URL`은 앱에, `DATABASE_URL_UNPOOLED`는 Prisma CLI에 연결한다. 기존 `DIRECT_URL`이 있으면 우선하며 Docker 개발 DB 고정값은 보존한다.
- 환경 파일·`.neon`은 Git에서 제외하고 연결 문자열을 출력하지 않는다.
- 검증: Docker Node.js 24의 `npm run build`, 앱 시작 후 Neon에 연결한 등록·설정·참여 흐름과 DB 저장 확인. 기존 테스트를 운영 DB로 돌리지 않고 이번 요청의 전용 확인 데이터를 사용한다.
- TDD 비대상: 인프라·환경 연결 변경이다. 실행 근거는 [검증 기록](../tdd/neon-setup.md)에 남긴다.
