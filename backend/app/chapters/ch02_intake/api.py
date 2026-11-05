"""In-memory PDF rendering and local llama.cpp vision inference."""
import base64
import json
import os
import re
import urllib.error
import urllib.request

MAX_PDF = 20 * 1024 * 1024
MAX_PAGES = 20
MAX_IMAGE = 8 * 1024 * 1024
PROMPT = """이 이미지는 부동산 매매계약서의 한 페이지입니다. 부동산의 표시, 매매대금 및 지급, 매도인과 매수인 정보만 추출해 JSON 객체로 출력하세요. JSON 외의 설명이나 마크다운은 출력하지 마세요.
반드시 다음 네 키의 배열을 모두 포함하세요:
{"property":[{"label":"소재지","value":"원문의 소재지"}],"payments":[{"label":"매매대금","value":"175,000,000원","payment_method":"원문에 명시된 지급방식"}],"seller":[{"name":"성명","address":"주소","resident_registration_number":"주민등록번호","ownership_share":"지분"}],"buyer":[{"name":"성명","address":"주소","resident_registration_number":"주민등록번호","ownership_share":"지분"}]}.
property는 보이는 항목을 label과 value 문자열로 추출하세요. property에는 소재지와 토지·건물의 표시를 기록하세요. payments의 각 항목은 label, value, payment_method 세 문자열을 모두 포함하며 매매대금과 계약금·중도금·잔금 및 지급일을 기록하세요. payment_method에는 해당 금액의 계좌이체, 현금 등 지급방식이 명시되어 있을 때 원문 그대로 적고, 방법이 없거나 알 수 없으면 빈 문자열로 두세요. 지급일과 지급방식은 구분하고 추측하지 마세요. 금액 항목의 value에는 보이는 아라비아 숫자의 금액만 쉼표와 원을 붙여 기재하세요. 예를 들어 금 일억칠천오백만 원정 (W175,000,000)은 175,000,000원으로 기재하세요. 원문에 숫자 금액이 없거나 판독이 불확실하면 한글 금액을 임의로 숫자로 변환하지 말고 원문 또는 [판독 불가]로 기재하세요. 한글 금액의 원정이라는 단어와 지급방식은 무관하므로 이를 지급방식으로 기재하지 마세요.
seller와 buyer는 사람별 객체의 배열입니다. 각각 매도인과 매수인을 구분하고 공동명의를 포함한 각 사람마다 별도의 객체를 만드세요. 각 객체에는 name, address, resident_registration_number, ownership_share 네 문자열을 모두 포함하세요. 주민등록번호는 보이는 전체 숫자와 하이픈을 보존하세요. 사람과 해당 주소, 주민등록번호, 지분의 관계가 불명확하면 임의로 연결하지 마세요. 원문에 없는 값은 빈 문자열, 글자가 있으나 판독할 수 없는 값은 '[판독 불가]'로 표시하세요. 다른 사람의 정보를 복사하거나 공동명의 여부, 지분 등을 추측하지 마세요. 이 페이지에 해당 항목이 없으면 해당 배열을 빈 배열 []로 두세요. 중개인 정보는 제외하세요. 금액 이외의 숫자와 단위, 표기는 원문을 그대로 유지하세요."""


def normalize_payment_value(label, value):
    """Normalize only unambiguous numeric won amounts, leaving other text intact."""
    if not re.search(r"대금|계약금|중도금|잔금|금액", label) or re.search(r"날짜|지급일|입금일|기일", label):
        return value
    number = r"([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)"
    text = value.strip()
    simple = re.fullmatch(rf"(?:[₩W]\s*)?{number}(?:\s*원)?", text, re.IGNORECASE)
    bilingual = re.fullmatch(rf"(?:금\s*)?[가-힣\s]+\s*\(\s*[₩W]\s*{number}\s*\)", text, re.IGNORECASE)
    match = simple or bilingual
    if not match:
        return value
    digits = match.group(1).replace(",", "")
    return f"{int(digits):,}원"


def render_pdf(data):
    try:
        import fitz
    except ImportError as exc:
        raise RuntimeError("PyMuPDF가 필요합니다. python -m pip install -r requirements.txt 를 실행하세요.") from exc
    if not data.startswith(b"%PDF-"):
        raise ValueError("올바른 PDF 파일을 선택하세요.")
    try:
        doc = fitz.open(stream=data, filetype="pdf")
        try:
            if doc.needs_pass:
                raise ValueError("암호가 설정된 PDF는 지원하지 않습니다.")
            if not 1 <= len(doc) <= MAX_PAGES:
                raise ValueError(f"PDF는 1~{MAX_PAGES}페이지만 지원합니다.")
            pages = []
            for page in doc:
                # Cap the longest edge to avoid excessive memory for unusually large pages.
                scale = min(2.0, 2400 / max(page.rect.width, page.rect.height))
                pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
                pages.append(base64.b64encode(pix.tobytes("jpeg", jpg_quality=90)).decode("ascii"))
            return {"pages": pages}
        finally:
            doc.close()
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("PDF를 열거나 렌더링하지 못했습니다.") from exc


def parse_image(image, model="8b"):
    if model not in ("4b", "8b"):
        raise ValueError("지원하지 않는 모델입니다.")
    if not isinstance(image, str) or len(image) > MAX_IMAGE * 4 // 3 + 8:
        raise ValueError("이미지 크기가 너무 큽니다.")
    try:
        raw = base64.b64decode(image, validate=True)
    except Exception as exc:
        raise ValueError("이미지 데이터가 올바르지 않습니다.") from exc
    if not raw.startswith(b"\xff\xd8\xff"):
        raise ValueError("JPEG 이미지가 아닙니다.")
    port = int(os.environ.get("LLAMA_4B_PORT", "8081") if model == "4b" else os.environ.get("LLAMA_SERVER_PORT", "8080"))
    if not 1 <= port <= 65535:
        raise ValueError("LLAMA_SERVER_PORT가 올바르지 않습니다.")
    body = json.dumps({"messages": [{"role": "user", "content": [
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + image}},
        {"type": "text", "text": PROMPT}]}], "temperature": 0.1, "max_tokens": 4096, "response_format": {"type": "json_object"}}).encode()
    request = urllib.request.Request(f"http://127.0.0.1:{port}/v1/chat/completions", data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/v1/models", timeout=10) as response:
            models = json.load(response).get("data", [])
        expected = f"Qwen3VL-{model.upper()}-Instruct"
        if not any(expected.lower() in str(item.get("id", "")).lower() for item in models if isinstance(item, dict)):
            raise RuntimeError(f"{port}번 포트에 선택한 {model.upper()} 모델이 실행 중인지 확인하세요.")
        with urllib.request.urlopen(request, timeout=600) as response:
            result = json.load(response)
        content = result["choices"][0]["message"]["content"]
        if not isinstance(content, str) or not content.strip():
            raise ValueError("모델이 빈 결과를 반환했습니다.")
        if result["choices"][0].get("finish_reason") == "length":
            raise RuntimeError("모델 출력이 길이 제한으로 잘렸습니다. 컨텍스트 크기를 늘리거나 페이지를 나누어 다시 시도하세요.")
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as exc:
            raise RuntimeError("모델이 유효한 JSON을 생성하지 못했습니다. 다시 시도하세요.") from exc
        person_fields = ("name", "address", "resident_registration_number", "ownership_share")
        if not isinstance(parsed, dict) or not all(
            isinstance(parsed.get(key), list) and all(
                isinstance(item, dict) and isinstance(item.get("label"), str) and isinstance(item.get("value"), str)
                for item in parsed[key]
            ) for key in ("property", "payments")
        ) or not all(isinstance(item.get("payment_method"), str) for item in parsed["payments"]) or not all(
            isinstance(parsed.get(key), list) and all(
                isinstance(person, dict) and all(isinstance(person.get(field), str) for field in person_fields)
                for person in parsed[key]
            ) for key in ("seller", "buyer")
        ):
            raise RuntimeError("모델이 필요한 핵심 항목 JSON 형식을 생성하지 못했습니다. 다시 시도하세요.")
        for item in parsed["payments"]:
            item["value"] = normalize_payment_value(item["label"], item["value"])
        return {"text": json.dumps(parsed, ensure_ascii=False, indent=2)}
    except urllib.error.HTTPError as exc:
        detail = exc.read(2048).decode("utf-8", "replace")
        raise RuntimeError(f"llama-server 오류 ({exc.code}): {detail}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise RuntimeError(f"선택한 {model.upper()} 모델 서버(127.0.0.1:{port})에 연결하지 못했습니다. 해당 모델과 mmproj로 llama-server를 실행하세요.") from exc
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError("llama-server 응답을 읽을 수 없습니다.") from exc
