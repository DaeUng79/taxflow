# TAXFLOW VibeCode

정적 웹서비스와 챕터별 실습 코드를 관리하는 Git 작업폴더입니다. 현재 서비스는 HTML·CSS·JavaScript로 동작하며 별도 백엔드나 빌드 단계가 없습니다.

## 폴더 구성

```text
TAXFLOW_VibeCode/
├── public/                 # 로컬 서버가 제공하는 파일
│   ├── index.html          # 메인 TAXFLOW 화면
│   ├── assets/
│   │   ├── css/styles.css
│   │   └── js/{missions.js,app.js}
│   └── chapters/01..05/    # 챕터별 독립 화면과 추가 코드
├── scripts/serve.sh        # 로컬 정적 서버
├── docs/chapters/          # 챕터별 목표·변경 기록
├── AGENTS.md               # 바이브 코딩 작업 규칙
└── README.md
```

## 실행

이 폴더에서 다음 명령을 실행합니다.

```bash
./scripts/serve.sh
```

메인 화면: [http://127.0.0.1:8765/#overview](http://127.0.0.1:8765/#overview)

챕터 예시: [http://127.0.0.1:8765/chapters/01/](http://127.0.0.1:8765/chapters/01/)

종료는 실행한 터미널에서 `Ctrl+C`를 누릅니다. 8765 포트가 사용 중이면 `PORT=8766 ./scripts/serve.sh`로 실행합니다. 서버는 이 PC의 127.0.0.1에만 연결됩니다.

## 챕터 작업

챕터 01~05의 주제와 관련 미션은 [챕터 목록](docs/chapters/README.md)에 정리했습니다. 새 화면과 기능은 `public/chapters/NN/` 안에 추가하고, 작업 내용과 실행 방법은 `docs/chapters/NN.md`에 남깁니다. 각 챕터는 `index.html`만으로 시작할 수 있으며 필요할 때 같은 폴더에 `styles.css`, `app.js`, `assets/` 등을 추가할 수 있습니다.

메인 화면의 공통 코드만 `public/index.html`과 `public/assets/`에서 수정합니다. `public/`은 외부에 제공되는 경로이므로 실제 납세자 정보와 비공개 증빙은 여기에 두지 않습니다. 이 Git 저장소도 공개 저장소입니다.

## Git

원격 저장소는 [DaeUng79/taxflow](https://github.com/DaeUng79/taxflow)입니다. 변경을 확인한 뒤 `git status`, `git diff`, `git add`, `git commit`, `git push`로 반영합니다. 루트 `index.html`은 기존 저장소 주소가 새 `public/` 화면으로 이동하도록 하는 연결 페이지입니다.

교육 자료 원본과 단일 파일 미리보기는 상위 `TEXTFLOW_26.11.28` 폴더에 있습니다.
