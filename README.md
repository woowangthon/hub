# AI 우왕톤 아카이브

충북대 멋쟁이사자처럼 AI 우왕톤의 행사 소개와 작품 전시 사이트입니다. 스플래시, 검색 가능한 전시회, 공유 주소가 있는 작품 상세 화면을 제공합니다. 개발 실행에는 임시 작품을 표시하지 않으며, 게시 빌드는 W01~W51 브랜치에서 검증·수집한 자료만 사용합니다. 행사 통계의 실제 값은 공개 전 확인해야 합니다.

## 실행과 검증

Node.js 24와 `package.json`의 pnpm 버전을 사용합니다.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm verify
pnpm preview
```

`pnpm verify`는 제출 검사·캐시·GitHub 어댑터 회귀 검사, 접근성·탐색 테스트, 타입 검사·기본 빌드를 실행합니다. 실제 자료 빌드는 수집 후 `pnpm build:archive`이며 수집 결과가 없으면 실패합니다. 개발 서버 주소는 실행 시 출력됩니다.

## 화면과 데이터

- 스플래시는 같은 탭에서 최초 한 번 표시합니다. 새로고침은 생략하며 `#exhibition`과 `#exhibition/project/{id}`로 직접 들어와도 생략합니다.
- 작품 상세를 닫으면 목록의 검색어·스크롤 위치·초점이 복원됩니다. 브라우저 뒤로/앞으로와 작품 주소 공유를 지원합니다.
- 행사 정보: `src/content.ts`, 제출 필드: `src/project.ts`, 검증 스키마: `schemas/archive.schema.json`.
- 별도 파비콘을 사용하지 않습니다. 기관·행사 로고의 권리는 각 권리자에게 있습니다.

## GitHub Pages

게시 대상은 `pnpm build:archive`로 생성되는 **`dist/`의 내용만**입니다. 상대 자산 경로와 해시 기반 탐색을 사용하므로 `/hub/` 같은 저장소 경로에서도 작동하며 서버의 별도 경로 처리가 필요하지 않습니다.

저장소에는 사이트 소스·실사용 자산·빌드 설정·라이선스·수집기·스키마·테스트와 워크플로를 관리합니다. `dist/`, `.archive/`, `public/archives/`, 의존성, 로컬 설계 문서·캡처·백업은 Git 추적 대상에서 제외합니다. `.github/workflows/validate.yml`은 archive-page 코드 검증만 수행합니다.

## 제출 수집과 배포 운영

- 참가자는 main에서 W01~W51 중 자기 팀 브랜치 하나를 만들고 `archive/archive.json`과 이미지 파일을 커밋·푸시합니다. PR·머지는 필요 없습니다. 제출 안내·예시는 main에서 관리합니다.
- `archive-auto.yml`: W* push에는 해당 제출 검사만 실행합니다. 한국 시간 매일 00:10에는 main에서 전체 등록 팀의 변경을 확인하고 증분 수집·검증·게시합니다.
- `archive-full.yml`: main의 Run workflow로 전체 자료를 다시 수집·검증·빌드합니다. 제출 자료 캐시를 우회합니다.
- 두 배포 파일은 main에도 있어야 합니다. archive-page의 사본은 검토·회귀 테스트용 원본이며 두 브랜치에서 함께 갱신합니다. 실제 공개는 별도 운영 설정·승인이 필요합니다.
- `config/archive.json`은 팀 1~51, 제출 예시 archive tree SHA와 크기 상한을 관리합니다. 예시를 바꿀 때 templateTreeSha도 갱신합니다. stable ID는 `team-01` 형식입니다.
- 자동 실행은 archive tree SHA·코드/워크플로/규칙/설정이 같으면 빌드와 배포를 생략합니다. 파일별 Git blob SHA가 같으면 캐시를 재사용하며 이미지 검사 결과는 규칙 버전까지 일치할 때만 재사용합니다. 캐시가 없거나 손상되면 다시 수집합니다.
- 실패한 제출 자료를 이전 자료로 대체하지 않습니다. 오류는 팀·필드·수정 방법을 Actions 오류/요약으로 표시하고 새 배포를 중단합니다. demoUrl만 선택이며 다른 필수 항목은 비워 둘 수 없습니다.
- 허용 이미지: 정적 PNG/JPEG/WebP, 장당 20MiB/40MP, 팀 폴더 100MiB, JSON 100KiB, 전체 500MiB. 추가 화면은 원본 바이트를 유지합니다.
- Pages Source는 GitHub Actions, github-pages 환경의 허용 실행 브랜치는 main으로 설정해야 합니다. main·archive-page 운영진 전용 권한과 참가 팀별 브랜치 권한도 별도로 적용합니다.
- 빌드/게시 명세는 실행 ID·시도 번호별로 변경 불가능한 artifact로 90일 보관합니다. 실제 Pages 단계의 결과와 빌드 식별값을 조회해 최신 상태를 판단하며, 게시 후 기록 저장 실패는 해당 빌드 명세로 복구합니다. 두 명세가 모두 없거나 만료된 경우 이전 기록으로 되돌아가지 않고 중단합니다.
- Pages 응답이 실패·취소돼 실제 게시 여부가 불확실하면 해당 후보를 보수적인 기준으로 사용해 팀 소실을 막고 다음 실행에서 반드시 재게시합니다. 배포 단계만 재실행하면 같은 빌드의 artifact를 사용하며, 다른 게시가 그 사이 완료됐다면 오래된 후보를 거부합니다.
- 게시 전 검사는 설치 의존성 없이 Node 기본 모듈만 사용합니다. 게시 job만 pages/id-token 쓰기 권한을 받고, 이력 조회에는 actions/deployments 읽기 권한만 사용합니다. 최종 명세와 사이트 artifact는 별도 백업하세요.
- 실제 Actions→Pages 통합 시험용 브랜치는 나중에 별도 작업으로 만듭니다. 회귀 테스트의 데이터는 src/test/에 격리되어 앱 빌드에 포함되지 않습니다.

로컬 Git 저장소로 원격 쓰기 없이 검사할 수 있습니다. `--repo`를 생략하면 GH_REPO의 GitHub 자료를 읽으므로 로컬 시험에는 반드시 지정합니다.

```sh
node scripts/archive.mjs validate --repo /path/to/submissions --branch W01
node scripts/archive.mjs plan --repo /path/to/submissions
node scripts/archive.mjs collect --repo /path/to/submissions
pnpm build:archive
# 전체 재수집: plan에 --full 추가
# 무변경 비교: plan에 --previous /path/to/successful/manifest.json 추가
```

사용 중인 폰트·아이콘·공통 컴포넌트의 라이선스는 `public/licenses/`에 있으며 빌드 결과에도 포함됩니다.
