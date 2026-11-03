# TAXFLOW VibeCode

프론트엔드 화면과 Python 백엔드, 교육용 SQLite 임시 데이터를 한 프로젝트에서 관리합니다. Python 표준 라이브러리만 사용하므로 별도 패키지 설치 없이 로컬에서 실행할 수 있습니다.

## 폴더 구성

```text
TAXFLOW_VibeCode/
├── frontend/public/             # 브라우저에 제공되는 정적 파일
│   ├── index.html
│   ├── assets/css/ · assets/js/
│   └── chapters/01/ ... 05/
├── backend/
│   ├── __main__.py              # 실행 진입점
│   └── app/
│       ├── main.py              # 정적 화면과 /api/ 제공
│       ├── db/                  # SQLite 연결·스키마·가상 예시
│       └── chapters/            # chapter_01~chapter_05 Python 기능
├── data/                        # 임시 DB 파일(README 외 Git 제외)
├── docs/chapters/               # 챕터별 작업 기록
├── requirements.txt             # Python 외부 패키지 목록
└── README.md                    # 실행·개발 규칙
```

## 실행

프로젝트 폴더에서 처음 실행할 때 가상환경을 만듭니다. 현재는 Python 표준 라이브러리만 사용해 가상환경이 필수는 아니지만, 앞으로 수강자별 패키지 버전을 분리하기 위해 이 방법을 권장합니다. `.venv/`는 Git에서 제외합니다.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m backend
```

현재 `requirements.txt`에는 설치할 패키지가 없습니다. 다음 실행부터는 `source .venv/bin/activate`와 `python -m backend`만 입력하면 됩니다.

첫 서버 실행 시 `data/taxflow.sqlite3`와 가상 예시 한 건이 자동 생성됩니다.

- 메인 화면: [http://127.0.0.1:8765/#overview](http://127.0.0.1:8765/#overview)

서버 종료는 실행 터미널에서 `Ctrl+C`, 포트 변경은 `PORT=8766 python -m backend`입니다. 가상환경을 나갈 때는 `deactivate`를 입력합니다. 서버는 127.0.0.1에만 연결됩니다.

## 앞으로의 바이브 코딩 규칙

앞으로 기능을 바이브 코딩할 때는 [챕터 목록](docs/chapters/README.md)을 기준으로 아래 구조를 따릅니다.

`NN`은 `01`부터 `05`까지의 챕터 번호이며 Python 폴더명은 `chapter_02`처럼 씁니다.

1. 사용자 화면과 그 화면 전용 CSS·JavaScript는 `frontend/public/chapters/NN/`에 둡니다.
2. 해당 챕터의 Python 기능은 `backend/app/chapters/chapter_NN/`에 둡니다. 현재 챕터 02의 `consultation.py`가 가상 예시 조회를 담당합니다.
3. DB 연결·스키마는 `backend/app/db/`, 여러 챕터가 함께 쓰는 기능은 `backend/app/`의 공통 모듈에서 관리합니다. 챕터마다 DB 파일을 따로 만들지 않습니다.
4. 기능의 목적, 실행 방법, 변경 내역은 `docs/chapters/NN.md`에 기록합니다.
5. 메인 화면을 바꿔야 할 때만 `frontend/public/index.html`과 `frontend/public/assets/`를 수정합니다.
6. 변경 후 해당 화면의 로컬 링크, Python·JavaScript 문법, API 응답, `git diff --check`를 확인합니다.
7. 외부 Python 패키지를 추가하면 버전을 지정해 `requirements.txt`에 기록하고, 설치 명령으로 재현되는지 확인합니다.

메인 화면의 단계 카드가 챕터 전용 페이지로 이동하게 하려면 `frontend/public/assets/js/missions.js`의 `workflow` 항목에 `page`를 지정합니다. 해당 파일이 없으면 기존 `href` 미션으로 이동합니다. 현재 [납세자 상담 샘플](frontend/public/chapters/02/consultation/)에 적용돼 있습니다.
