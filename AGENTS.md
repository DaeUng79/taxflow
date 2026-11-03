# TAXFLOW 작업 지침

- 특정 챕터 화면은 `frontend/public/chapters/NN/`에서 구현하고 `docs/chapters/NN.md`에 변경 내용과 실행 방법을 기록합니다.
- Python 기능은 해당 `backend/app/chapters/chapter_NN/`에 두고, DB 연결과 스키마는 공통 `backend/app/db/`에서 관리합니다.
- 메인 화면 변경 요청이 있을 때 `frontend/public/index.html`과 `frontend/public/assets/`를 수정합니다.
- `frontend/public/`과 공개 Git 저장소에 실제 납세자 정보나 비공개 증빙을 추가하지 않습니다. `data/`는 임시 DB용이며 Git에서 제외합니다.
- 변경 후 화면의 로컬 링크, Python·JavaScript 문법, API 응답, Git diff를 확인합니다.
