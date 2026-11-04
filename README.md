# AI 우왕톤 작품 제출

1. 이 저장소의 `main`에서 본인 팀 번호로 브랜치를 만듭니다. 예: `W01`, `W32` (전체 `W01`~`W51`).
2. [제출 양식](archive/README.md)을 읽고 `archive/archive.json`과 이미지를 실제 작품 자료로 교체합니다.
3. 본인 팀 브랜치에 커밋·푸시합니다. PR이나 main으로의 머지는 필요 없습니다.
4. Actions에서 제출 검사 결과를 확인하고 오류가 있으면 수정하여 다시 푸시합니다.

```text
archive/
├─ archive.json
├─ thumbnail.png
└─ screenshots/
   └─ screen-1.png
```

홈페이지 코드는 `archive-page`에서 관리합니다. 매일 한국 시간 00:10에 변경 자료만 수집하며, 자료·코드·설정 변경이 없으면 배포를 생략합니다. 운영진은 `main`의 **전시회 전체 재배포 → Run workflow**로 전체 자료를 다시 수집·검증·배포할 수 있습니다.

`.github/`는 운영진이 관리합니다. 참가자는 본인 팀의 `archive/` 자료만 수정하세요. 팀별 쓰기 제한은 운영진이 GitHub 브랜치 규칙으로 설정해야 합니다.
