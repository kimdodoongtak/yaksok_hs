# TDD 사용 가이드

## 준비

이 작업폴더는 원본 Next.js 풀스택 템플릿에 TDD 방법론을 연결한 것이다. 제품 소스와 제품 테스트는 아직 없다. `apps/web/package.json`과 잠금 파일, 기술 스택은 원본을 유지한다.

1. 이 작업폴더 루트에서 AI 도구를 연다.
2. PRD·ERD·정책 자료를 `context/inputs/`에 두고 관련 Figma 링크를 제공한다.
3. `$prd-to-specs context/inputs/`로 명세를 작성하고 중요한 미정 정책을 결정한다.
4. Docker 환경은 [로컬 개발](local-development.md)을 따른다. 앱이 없으면 초기화 스펙을 먼저 구현한다.

## 기능 구현

```text
$feature 불러오기 <실제 스펙 파일명>
$feature 시작
$feature 검토
$feature 테스트
$feature 완료
```

`시작` 자체가 [TDD 정책](../context/tdd-policy.md)을 적용한다. 테스트를 뒤로 미루는 별도 명령은 필요 없다. `검토/테스트`는 명세 대조와 전체 회귀 검증이며 `완료`는 필수 검증이 통과한 뒤에만 기록한다.

## 실제 명령

프로젝트 루트에서 실행한다.

```bash
docker compose exec tools npm run test
docker compose exec tools npm run test:watch
docker compose exec tools npm run lint
docker compose exec tools npm run typecheck
docker compose exec tools npm run build
```

테스트 파일과 테스트 이름이 생긴 뒤 해당 실제 경로·이름을 지정해 한 동작만 검증할 수 있다. 다음 명령의 파일과 이름은 형식 예시이며 현재 제공된 테스트가 아니다.

```bash
docker compose exec tools npm run test -- src/lib/example.test.ts -t "경계 조건을 처리한다"
```

현재 Vitest는 Node 환경의 `src/**/*.test.ts`를 수집한다. 제품 테스트가 없는 초기 상태에서는 테스트 실행 성공을 기대하지 않는다. 브라우저 컴포넌트 테스트·E2E에는 별도 환경 구성이 필요하다.

## 약속잡기에 적용할 때

아래는 검증 범위 예시이며 약속잡기의 확정 정책을 새로 정의하지 않는다. 기대값과 경계의 포함 여부는 제공한 최신 명세에서 정한다.

| 대상 | 우선 검증 방법 |
| --- | --- |
| 후보 시간 계산·정렬 | 공개 계산 함수에 다양한 입력과 독립된 기대값을 주는 단위 테스트 |
| 마감·권한·상태 전환 | 고정 시간·사용자 역할을 사용한 서비스/API 테스트 |
| 마지막 정원·닉네임 경쟁·제출 버전 충돌 | 독립 연결로 동시에 요청하는 실제 PostgreSQL 통합 테스트 |
| 참여·제출·결과 확인 | 핵심 사용자 흐름의 E2E와 실제 브라우저 확인 |
| 피그마의 배치·색상·반응형 | 해당 화면 크기에서 시각 비교 |

현재 Compose는 개발 DB만 제공한다. 최초 DB 통합 테스트 기능에서 격리된 DB, 마이그레이션·정리 방식과 실행 명령을 함께 구현한다. 테스트를 위해 원본 개발 DB를 임의 삭제하거나 초기화하지 않는다.

## 실행 기록과 완료

각 기능의 기록은 [기록 양식](../context/tdd/_template.md)을 사용해 `context/tdd/<스펙-ID>.md`에 남긴다. 기대값은 스펙에, 실제 RED·GREEN 결과는 기록에 둔다. 에이전트의 체크박스만으로 TDD를 수행했다고 판단하지 말고 실제 명령과 실패·성공 결과를 확인한다.

## 원본과의 범위

원본의 Git 정책(`main` 작업, 요청 시에만 커밋·푸시)과 현재 기능 파일 구조를 유지한다. 여러 팀원이 동시 개발하기 전에는 기능 브랜치·PR 및 작업 기록 분리 정책을 별도 결정한다. 이 폴더는 개인 ChatGPT 스킬을 설치하거나 외부 저장소에 연결하지 않는다.
