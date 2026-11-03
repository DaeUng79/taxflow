# TAXFLOW 작업 지침

- 사용자가 특정 챕터를 지정하면 `public/chapters/NN/` 안에서 구현하고, `docs/chapters/NN.md`에 변경 내용과 실행 방법을 기록합니다.
- 메인 화면 변경 요청이 있을 때만 `public/index.html`과 `public/assets/`를 수정합니다.
- 각 챕터는 정적 파일만으로 로컬 서버에서 열리도록 유지합니다. 챕터 사이의 공유가 필요하면 목적과 경로를 문서에 명시합니다.
- `public/`과 공개 Git 저장소에 실사용 납세자 정보나 비공개 증빙을 추가하지 않습니다. 예시는 가상자료를 사용합니다.
- 변경 후 화면의 로컬 링크, JavaScript 문법, Git diff를 확인합니다.
