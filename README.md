# TAXFLOW VibeCode

양도소득세 업무 흐름을 살펴보고, 납세자 상담 내용을 입력·관리하는 로컬 웹 프로젝트입니다.

화면, Python 서버, SQLite 데이터베이스를 한 폴더에서 관리합니다.

## 처음 실행하기 (macOS)

터미널 앱을 열고 다음 순서대로 입력합니다. Git과 Python 3가 설치되어 있는지 먼저 확인하세요. 두 명령 모두 버전 번호가 표시되어야 합니다.

```bash
git --version
python3 --version
```

원하는 작업 폴더로 이동한 뒤 프로젝트를 내려받습니다. `git clone`은 `taxflow` 폴더를 새로 만듭니다. 이미 내려받았다면 다시 복제하지 말고 기존 폴더에서 다음 단계로 진행하세요.

```bash
git clone https://github.com/DaeUng79/taxflow.git
cd taxflow
```

프로젝트 폴더(`README.md`와 `backend/`가 있는 위치)에서 가상환경을 만들고 활성화합니다. `.venv` 생성은 처음 한 번만 필요하며, 활성화되면 터미널 줄 앞에 `(.venv)`가 표시됩니다.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

의존성 설치가 끝나면 다음 명령으로 서버를 켭니다.

```bash
python -m backend
```

터미널에 `TAXFLOW http://127.0.0.1:8765/`가 표시되면 서버가 실행 중입니다. 해당 터미널은 열어 두고 브라우저에서 [첫 번째 미션](http://127.0.0.1:8765/index.html#mission-1)을 엽니다. 상담 기록 저장 화면은 메인 화면의 **납세자 상담**에서 열 수 있습니다.

## 종료하고 다시 실행하기

서버를 켠 터미널에서 `Ctrl+C`를 누르면 서버가 종료됩니다. 가상환경까지 종료하려면 `deactivate`를 입력하세요. 다음에 다시 실행할 때는 프로젝트 폴더로 이동한 뒤 가상환경을 활성화하고 서버를 켭니다. 이미 만든 `.venv`를 다시 만들 필요는 없습니다.

```bash
cd taxflow
source .venv/bin/activate
python -m backend
```

`cd taxflow`는 `taxflow`의 **상위 폴더**에 있을 때 쓰는 명령입니다. 다른 위치에 있다면 `cd` 뒤에 자신의 프로젝트 경로를 적으세요.

포트 8765가 이미 사용 중이라는 오류가 나오면 기존 서버를 실행한 터미널에서 `Ctrl+C`를 누르세요. 다른 포트로 실행하려면 `PORT=8766 python -m backend`를 입력하고 브라우저 주소도 `http://127.0.0.1:8766/`으로 바꿉니다. 화면이 열리지 않으면 터미널에 오류가 없는지, 가상환경이 활성화됐는지, `backend/` 폴더가 있는 위치에서 실행했는지 확인하세요.

Windows PowerShell에서는 Git과 Python 3를 확인한 뒤 다음 명령을 사용합니다.

```powershell
git clone https://github.com/DaeUng79/taxflow.git
cd taxflow
py -3 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m backend
```

PowerShell이 활성화 스크립트 실행을 막으면 현재 창에서 `Set-ExecutionPolicy -Scope Process RemoteSigned`를 실행한 뒤 다시 활성화하세요. 서버 종료는 `Ctrl+C`, 가상환경 종료는 `deactivate`입니다.

## 현재 사용할 수 있는 기능

납세자 상담 화면에서는 이름과 주소를 입력하고, 날짜·선택 항목·금액을 이용해 주택 거래와 거주, 가족, 비용, 증빙 상태를 기록합니다. 금액은 천 단위 쉼표로 표시되며 화살표로 조정할 수 있습니다.

- **가상 데이터 입력**: 연습용 내용을 화면에 채웁니다. 저장 버튼을 누르기 전까지는 등록되지 않습니다.
- **새 상담 / 상담 저장**: 새 기록을 작성하거나 열린 기록을 수정해 저장합니다. 저장할 때 컴퓨터의 날짜와 시간이 상담일로 기록되며, 수정 후 저장할 때 갱신됩니다.
- **상담 현황**: 이름으로 검색하고 기록을 열 수 있습니다. 삭제 버튼을 누르면 확인창이 표시됩니다. 삭제한 기록은 복구할 수 없습니다.

챕터 02에서는 로컬 llama.cpp 비전 모델을 이용해 스캔 계약서를 페이지별로 분석할 수 있습니다. 실행 및 모델 준비 방법은 [계약서 파싱 안내](backend/app/chapters/ch02_intake/README.md)를 참고하세요. 이 기능은 상담 기록에 자동 연결되지 않습니다. 나머지 미션은 안내와 화면 예시를 제공합니다.

## 데이터 저장

서버를 처음 실행하면 기본 위치인 `data/taxflow.sqlite3`가 생성됩니다. 기존 파일이 있으면 그대로 사용합니다. `TAXFLOW_DB_PATH` 환경변수로 다른 위치를 지정할 수 있습니다.

- `consultations` 테이블: 상담 목록에 쓰는 이름·상담 시각, 입력 내용(JSON), 생성·수정 시각을 저장합니다.
- `demo_notes` 테이블: 별도의 가상 예시 메모를 저장합니다. 첫 데이터베이스 생성 시 예시가 추가됩니다.
- 데이터베이스 파일과 `data/`의 백업 파일은 Git에서 제외됩니다. 폴더 이름을 변경해도 기존 DB는 이동하거나 삭제되지 않습니다.

**실제 개인정보를 저장하기 전에** 접근 권한, 저장 파일 암호화, 백업과 삭제 정책을 마련해야 합니다. 현재 서버에는 로그인과 사용자별 접근 권한이 없고 기본 SQLite 파일은 암호화되지 않습니다.

## 폴더 구성

```text
TAXFLOW_VibeCode/
├── frontend/public/
│   ├── index.html                         # 메인 화면
│   ├── assets/css/ · assets/js/           # 메인 화면 스타일과 미션 내용
│   └── chapters/
│       ├── ch01_consultation/             # 납세자 상담
│       │   └── consultation/              # 상담 화면과 전용 코드
│       ├── ch02_intake/                   # 자료 접수·구조화 시작 화면
│       ├── ch03_evidence/                 # 충돌·근거 확인 시작 화면
│       ├── ch04_review/                   # 검토·신고서 대조 시작 화면
│       └── ch05_report/                   # 리포트·실무 적용 시작 화면
├── backend/
│   ├── __main__.py                        # 실행 진입점
│   └── app/
│       ├── main.py                        # 화면 제공과 상담 API
│       ├── db/                            # SQLite 연결·스키마·가상 메모 조회
│       └── chapters/                      # 프런트엔드와 같은 ch01~ch05 폴더
├── data/                                  # 로컬 DB 보관 위치
├── requirements.txt                       # 외부 Python 패키지 목록
└── README.md
```

`ch03_evidence`부터 `ch05_report`까지는 현재 챕터 시작 화면입니다. 백엔드의 `chapters/` 하위 폴더 이름도 프런트엔드와 일치하며, `ch` 접두사를 붙여 Python 모듈로 import할 수 있습니다. 가상 메모 조회 코드는 `db/demo_notes.py`에, 실제 상담 기록 API는 현재 `backend/app/main.py`에 있습니다.

이전 `/chapters/01_consultation/`부터 `/chapters/05_report/`까지의 주소는 새 `ch01_`~`ch05_` 주소로 이동합니다. Python 서버를 실행 중이었다면 재시작해야 이전 주소의 자동 이동이 적용됩니다.

## 상담 API

| 기능           | 요청                               |
| -------------- | ---------------------------------- |
| 상담 목록      | `GET /api/consultations`         |
| 상담 상세      | `GET /api/consultations/{id}`    |
| 신규 상담 저장 | `POST /api/consultations`        |
| 상담 수정      | `PUT /api/consultations/{id}`    |
| 상담 삭제      | `DELETE /api/consultations/{id}` |
| 서버 상태      | `GET /api/health`                |

상담 생성·수정은 JSON을 사용하며 납세자 이름과 상담 시각을 확인합니다. 이름 검색은 화면에서 불러온 목록을 기준으로 동작합니다.

## 작업할 때

1. 화면과 전용 스타일·스크립트는 해당 `frontend/public/chapters/ch번호_역할/` 폴더에 둡니다.
2. DB 연결과 스키마는 `backend/app/db/`에서 관리하고, 사용자에게 필요한 안내는 해당 미션 화면에 반영합니다.
3. 메인 화면에서 상담 화면으로 가는 경로는 `frontend/public/assets/js/missions.js`의 `workflow` 항목에 지정합니다. 해당 페이지가 없으면 미션 안내로 이동합니다.
4. 변경 후 화면과 링크, Python·JavaScript 문법, 필요한 API 응답을 확인합니다. 새 Python 패키지가 필요하면 버전을 `requirements.txt`에 기록합니다.
