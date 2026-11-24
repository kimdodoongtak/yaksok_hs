# 코딩 규칙

이 문서의 파일 경로는 프로젝트 루트 기준이다. 앱 소스와 설정은 `apps/web/`에 모은다. 아래 npm 명령은 그 폴더에서 실행하거나 프로젝트 루트에서 `docker compose exec tools`를 앞에 붙인다.

## TypeScript와 Next.js

- TypeScript 5의 `strict`를 유지한다. `any` 대신 정확한 타입이나 `unknown`과 검증을 사용한다.
- 함수 컴포넌트를 사용하고 Server Component를 기본으로 한다. 상태·이벤트·브라우저 API가 필요한 경계에만 `"use client"`를 둔다.
- 서버 컴포넌트는 서버 전용 데이터 계층을 직접 호출한다. 같은 앱의 Route Handler를 HTTP로 우회 호출하지 않는다.
- 앱 내부 폼과 데이터 변경은 Server Action으로, 웹훅·외부 클라이언트·HTTP 상태/헤더 계약은 Route Handler로 처리한다.
- DB 모듈에는 `server-only` 경계를 두며 비밀값·Prisma Client를 클라이언트로 보내지 않는다.
- 입력 검증과 접근 권한 확인은 각 서버 진입점에서 수행한다. 화면이나 `proxy.ts`의 접근 제어만으로 대체하지 않는다.
- Next.js 16의 비동기 요청 API와 라우트 매개변수는 해당 버전 공식 문서에 맞춰 처리한다.
- 긴 작업은 요청 제한 시간을 확인하고 필요하면 별도 작업 처리 방식을 스펙으로 설계한다.

## Tailwind CSS 4

`apps/web/postcss.config.mjs`에서 `@tailwindcss/postcss`를 사용한다. 초기 앱의 `apps/web/src/app/globals.css`에는 `@import "tailwindcss";`를 두고 테마는 CSS의 `@theme`에서 정의한다. v3 방식의 `tailwind.config.js`를 새로 만들지 않는다. 색상·컴포넌트 라이브러리·다크 모드는 제품 스펙에서 정한다.

## 데이터

- Prisma 7 CLI의 URL은 `apps/web/prisma.config.ts`에서 `DIRECT_URL`로 설정한다. 이 값이 없으면 Neon CLI가 제공한 `DATABASE_URL_UNPOOLED`를 사용한다. `.env.local` → `.env` 순서로 읽고 기존 주입 값을 우선한다. `apps/web/prisma/schema.prisma`의 datasource에 URL을 넣지 않는다.
- 앱은 `DATABASE_URL`과 `@prisma/adapter-pg`로 Prisma Client를 만든다. 이 TCP 어댑터를 로컬 PostgreSQL과 Neon에 공통으로 사용한다.
- `prisma-client` 생성기를 사용하고 결과는 `apps/web/src/generated/prisma`에 생성한다. 생성 파일은 Git에서 제외한다.
- 스키마 변경은 `npm run db:migrate -- --name <변경명>`으로 기록한다. `db push`로 마이그레이션을 생략하지 않는다.
- Prisma 7에서는 마이그레이션 뒤 `npm run db:generate`를 명시적으로 실행한다.
- 배포는 `npm run db:deploy`로 기존 마이그레이션만 적용한다. 운영에서 `migrate dev`, 초기화, 개발 시드를 실행하지 않는다.
- 조회 범위·정렬·페이지네이션, 소유권, 제약조건, 트랜잭션은 기능의 수용 기준에 맞춰 설계한다.

## 파일 배치 — 앱 생성 후

| 경로 | 역할 |
| --- | --- |
| `apps/web/src/app/` | 페이지, 레이아웃, Route Handler |
| `apps/web/src/components/<기능>/` | UI 컴포넌트 |
| `apps/web/src/actions/<기능>.ts` | Server Action |
| `apps/web/src/lib/db/` | 서버 전용 데이터 접근 |
| `apps/web/src/lib/prisma.ts` | Prisma Client 재사용과 연결 |
| `apps/web/src/lib/` | 공통 서버 로직과 유틸리티 |
| `apps/web/src/types/` | 공유 타입 |
| `apps/web/prisma/` | 스키마와 마이그레이션 |

## 오류와 검증

예상 가능한 오류는 일관된 결과 타입으로 반환하고 사용자에게 복구 방법을 안내한다. 원시 DB 오류나 스택·비밀값을 응답에 노출하지 않는다. Next.js의 `redirect` 같은 제어 흐름을 일반 오류로 삼키지 않는다.

Vitest는 권한·입력 검증·데이터 변경·유틸리티의 의미 있는 동작을 검증한다. `context/tdd-policy.md`에 따라 실패 테스트를 실제로 확인한 뒤 동작을 구현한다. 테스트는 대상 파일 옆에 `<이름>.test.ts`로 둔다. 외부 API와 DB 대역은 단위 테스트에서 사용하고, 제약조건·트랜잭션·동시성은 격리된 실제 PostgreSQL에서 검증한다. 실제 연결·마이그레이션과 제품 동작 검증을 구분해 기록한다. 단순 CSS 변경에 구현을 따라 쓴 테스트를 추가하지 않는다.

`npm run lint`, `npm run typecheck`, `npm run build`를 구분한다. Next.js 16 빌드는 린트를 대신하지 않는다. UI가 생기면 실제 브라우저로 기본 흐름과 반응형 화면도 확인한다.


## 화면 문구

- 2026-11-14 사용자 선호: 감성적인 표어·수사적 질문 대신 기능과 상태를 직접 설명한다. 예: “약속 참여”, “참여 정보”. “우리의 다음 만남”, “함께 만날까요?” 같은 문구는 사용하지 않는다.

## 모바일 터치와 사용감 검증

2026-11-24 사용자 지침으로 이후 UX/UI 수정과 검증에 다음 기준을 적용한다.

- 모바일 스크롤은 손가락을 화면에 댄 상태에서 시작한다. 마우스 클릭·휠 검증과 별도로 터치 시작 → 이동 → 손 떼기 흐름을 검증한다. 버튼·시간표 칸·칸 경계·여백에서 스크롤을 시작할 때 의도치 않은 선택·해제·버튼 실행이 발생하지 않는지 확인한다. 시간표의 명시적 선택 모드에서는 합의된 탭·드래그 선택과 바깥 스크롤 영역을 구분해 확인한다.
- 손가락으로 중심을 정확히 누르지 않아도 조작할 수 있도록 실제 터치 영역과 인접 요소 간격을 확인한다. 중앙뿐 아니라 가장자리·모서리·칸 사이에서 시작하는 터치와 약간 흔들리는 탭을 포함하고, 터치 영역을 넓혔을 때 이웃 요소가 잘못 실행되거나 스크롤 공간이 사라지지 않는지 확인한다.
- 작은 모바일 화면에서도 버튼·날짜·시간 칸의 실제 조작 영역을 검수한다. 접촉 면적을 설정할 수 있는 도구에서는 넓은 접촉 면적도 포함하되, 해당 설정만으로 실기기 손가락 조작을 검증했다고 간주하지 않는다.
- 터치 에뮬레이션과 실제 휴대전화 검증 결과를 구분한다. 실제 기기에서 스크롤·탭·드래그 사용감을 확인하지 못했다면 실기기 미검증으로 기록한다.
