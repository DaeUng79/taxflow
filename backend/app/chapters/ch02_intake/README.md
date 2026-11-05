# 스캔 계약서 파싱

프로젝트 루트에서 의존성을 설치하고 TAXFLOW 서버를 실행합니다. 코드를 변경한 뒤에는 서버를 재시작하세요.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m backend
```

## 모델 서버 실행

화면에서 4B 또는 8B를 선택할 수 있습니다. 각 모델의 서버를 아래 포트로 별도 실행해야 하며, 화면에서 선택하는 것만으로 서버가 시작되지는 않습니다. 모델 파일과 같은 모델의 mmproj가 필요합니다. 선택한 모델 하나만 실행해도 됩니다. 두 모델을 동시에 올리면 메모리 사용량이 커집니다.

프로젝트 루트에서 4B 모델을 실행합니다.

```bash
llama-server -m models/qwen3-vl-4b/Qwen3VL-4B-Instruct-Q4_K_M.gguf \
  --mmproj models/qwen3-vl-4b/mmproj-Qwen3VL-4B-Instruct-F16.gguf \
  --host 127.0.0.1 --port 8081 -ngl 99 -c 8192
```

8B 모델을 사용하려면 별도 터미널에서 다음 명령을 실행합니다.

```bash
llama-server -m models/qwen3-vl-8b/Qwen3VL-8B-Instruct-Q4_K_M.gguf \
  --mmproj models/qwen3-vl-8b/mmproj-Qwen3VL-8B-Instruct-F16.gguf \
  --host 127.0.0.1 --port 8080 -ngl 99 -c 8192
```

`LLAMA_4B_PORT`, `LLAMA_SERVER_PORT` 환경변수로 TAXFLOW의 연결 포트를 각각 변경할 수 있습니다. 모델 서버의 포트도 일치해야 합니다. 최신 llama.cpp가 필요합니다.

`http://127.0.0.1:8765/chapters/ch02_intake/`에서 모델을 선택하고 PDF를 등록하면 페이지별로 바로 구조화합니다. 다른 모델을 선택하고 **계약 내용 구조화**를 누르면 PDF를 다시 등록하지 않고 비교할 수 있습니다. 새 분석이 완료되면 기존 결과를 교체하므로 보관할 결과는 먼저 저장하세요. 분석이 실패하면 기존 결과를 유지합니다.

PDF는 최대 20MB, 20페이지이며 페이지별로 순서대로 분석합니다. 문서와 결과는 메모리에서 처리되며 결과 저장 버튼으로 텍스트를 저장할 수 있습니다. 작은 글씨나 손글씨가 누락될 수 있으므로 금액·주소·날짜·특약 등을 원문과 직접 대조하세요.

## JSON 결과

각 페이지는 `property`(부동산의 표시), `payments`(매매대금 및 지급), `seller`(매도인), `buyer`(매수인) 배열을 포함합니다. `property`는 `label`과 `value` 항목의 배열이고, `payments`는 추가로 `payment_method` 문자열을 포함합니다. 지급방식이 명시되지 않으면 빈 문자열입니다. 금액 값이 명확한 숫자 원화로 확인되면 JSON에 쉼표와 원을 붙인 금액만 저장합니다. 숫자 금액을 확실히 분리할 수 없으면 추측하지 않고 모델이 출력한 값을 보존합니다. `seller`, `buyer`는 사람별 `name`, `address`, `resident_registration_number`, `ownership_share` 문자열을 포함하는 배열입니다. 해당 페이지에서 보이는 내용만 표시하며, 원문에 보이는 주민등록번호는 JSON 파일에도 포함됩니다. 단 한 명만 보이더라도 다른 페이지에 공동명의자가 있을 수 있습니다. 화면에서는 핵심 내용을 카드로 보여주고 JSON 보기에서 수정할 수 있습니다. JSON 저장 버튼은 페이지 번호와 결과를 하나의 파일로 저장합니다.

인식 결과는 모델이 이미지에서 추정합니다. 빈 배열은 해당 페이지에서 확인한 내용이 없다는 뜻이며 전체 문서에 해당 정보가 없다는 뜻은 아닙니다. 금액·날짜·인적사항은 반드시 원본과 대조하세요.
