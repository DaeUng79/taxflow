"""In-memory PDF rendering and local llama.cpp vision inference."""
import base64
import datetime
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
{"property":[{"label":"소재지","value":"원문의 소재지"}],"payments":[{"label":"계약금","value":"원문에 적힌 계약금","payment_date":"원문에 적힌 지급일"}],"seller":[{"name":"성명","address":"주소","resident_registration_number":"주민등록번호","ownership_share":"지분"}],"buyer":[{"name":"성명","address":"주소","resident_registration_number":"주민등록번호","ownership_share":"지분"}],"contract_date":"","contract_date_uncertain":true}.
property는 보이는 항목을 label과 value 문자열로 추출하세요. property에는 소재지와 토지·건물의 표시를 기록하세요. payments의 각 항목은 label, value, payment_date 세 문자열을 포함합니다. 매매대금, 계약금, 중도금, 잔금은 각각 별도 항목으로 기록하고, 각 금액에 명시된 약정 지급일을 같은 항목의 payment_date에 원문 그대로 기록하세요. 서로 다른 중도금은 순번과 함께 별도 항목으로 구분하세요. 해당 지급일이 없거나 어떤 금액의 지급일인지 불확실하면 빈 문자열로 두고 추측하지 마세요. 지급일만 보이고 해당 금액과의 관계가 불명확하면 원문 항목명과 날짜를 별도 항목의 label과 value에 기록하고 payment_date는 비워 두세요. 지급방식은 추출하지 마세요. 금액 항목의 value에는 보이는 아라비아 숫자의 금액만 쉼표와 원을 붙여 기재하세요. 예시 값을 복사하지 말고 해당 계약서에 보이는 금액만 기재하세요. 원문에 숫자 금액이 없거나 판독이 불확실하면 한글 금액을 임의로 숫자로 변환하지 말고 원문 또는 [판독 불가]로 기재하세요.
seller와 buyer는 사람별 객체의 배열입니다. 각각 매도인과 매수인을 구분하고 공동명의를 포함한 각 사람마다 별도의 객체를 만드세요. 각 객체에는 name, address, resident_registration_number, ownership_share 네 문자열을 모두 포함하세요. 주민등록번호는 보이는 전체 숫자와 하이픈을 보존하세요. 사람과 해당 주소, 주민등록번호, 지분의 관계가 불명확하면 임의로 연결하지 마세요. 원문에 없는 값은 빈 문자열, 글자가 있으나 판독할 수 없는 값은 '[판독 불가]'로 표시하세요. 다른 사람의 정보를 복사하거나 공동명의 여부, 지분 등을 추측하지 마세요. 이 페이지에 해당 항목이 없으면 해당 배열을 빈 배열 []로 두세요. 중개인 정보는 제외하세요. 금액 이외의 숫자와 단위, 표기는 원문을 그대로 유지하세요."""

# Keep the existing arrays compatible while explicitly partitioning property facts.
PROMPT += "\n토지와 건물을 반드시 구분하세요. property의 label은 토지 정보에는 '토지 소재지', '토지 지목', '토지 면적', '토지 지분', 건물 정보에는 '건물 소재지', '건물 구조', '건물 용도', '건물 면적', '건물 지분'처럼 토지 또는 건물 접두어를 붙입니다. 각 필지·동·호별 항목을 보존하고 단위도 그대로 기록하세요. 공통 소재지는 '소재지'로 별도 기록할 수 있습니다. 구분이 불분명하면 임의로 분류하지 마세요. seller와 buyer에 phone 문자열도 추가해 해당 당사자의 연락처만 추출하세요. 없으면 빈 문자열입니다. 중개인의 연락처를 사용하지 마세요."

# All reading instructions are sent with the same page image in one model request.
PROMPT += """\n한 번의 응답에서 지급일과 계약 체결일도 함께 읽으세요.
payments는 각 금액 행의 금액과 날짜를 같은 행에서만 읽습니다. 금액이 비어 있거나 해당 행과 날짜의 연결이 불확실하면 payment_date는 빈 문자열입니다. 빈칸에 다른 행의 금액이나 날짜를 복사하지 마세요. 계약시라는 문구만 있으면 날짜를 추측하지 말고 빈 문자열로 두세요. 날짜가 같은 경우 원문이 명확한 경우만 기록합니다.
서명·날인란 바로 위 계약 체결일만 contract_date 문자열로 별도 추출하세요. 잔금일, 특약 날짜, 주민등록번호 등은 계약일이 아닙니다. 숫자 주변에 덧쓰기·수정 흔적이 있거나 보이지 않아 읽을 수 없으면 contract_date_uncertain을 true로 하고 contract_date는 빈 문자열로 두세요. 수정 흔적이 없고 날짜 전체가 선명할 때만 false로 하고 실제 날짜를 기록하세요. 보이지 않으면 추측하지 마세요.
기존 property, payments, seller, buyer 배열과 함께 이 두 키를 추가하세요: "contract_date":"실제로 읽은 날짜 또는 빈 문자열", "contract_date_uncertain":true 또는 false. property에는 계약일을 중복해서 쓰지 마세요."""

DATE_PATTERN = re.compile(r'(?<!\d)((?:19|20)\d{2})\s*(?:년|[./-])\s*(\d{1,2})\s*(?:월|[./-])\s*(\d{1,2})\s*(?:일|[.]|\b)')


def formatted_date(text):
    matches = list(DATE_PATTERN.finditer(text)) if isinstance(text, str) else []
    if len(matches) != 1:
        return ''
    try:
        result = datetime.date(*(int(group) for group in matches[0].groups()))
        return result.strftime('%Y.%m.%d.')
    except ValueError:
        return ''


def normalize_single_pass(parsed):
    """Reject ambiguous dates without pretending the single pass independently verified them."""
    payments = parsed['payments']
    date_warning = False
    amount_warnings = []
    contract_fields = []
    for row in parsed['property']:
        if re.fullmatch(r'(?:계약\s*체결일|계약일|계약일자)', row['label'].strip()):
            contract_fields.append(row)
    parsed['property'] = [row for row in parsed['property'] if row not in contract_fields]
    contract_candidates = [formatted_date(row['value']) for row in contract_fields if row['value'].strip()]
    top_date = parsed.pop('contract_date', '')
    uncertain = parsed.pop('contract_date_uncertain', None)
    if isinstance(top_date, str) and top_date.strip():
        contract_candidates.append(formatted_date(top_date))
    contract_date = ''
    if uncertain is False and contract_candidates and all(contract_candidates) and len(set(contract_candidates)) == 1:
        contract_date = contract_candidates[0]
        parsed['property'].append({'label':'계약 체결일', 'value':contract_date, 'source':'model_unverified'})
    contract_date_warning = bool(contract_candidates or (uncertain is True and payments)) and not contract_date
    dates = []
    for row in payments:
        label = row['label'].strip()
        row['value'] = normalize_payment_value(label, row['value'])
        original_date = row.get('payment_date', '').strip()
        date = formatted_date(original_date)
        amount = row['value'].strip()
        # A date alone or a blank printed amount cannot establish a payment row.
        has_amount = bool(re.search(r'\d|[십백천만억조]', amount)) and not re.search(r'판독\s*불가', amount)
        is_payment = bool(re.search(r'계약금|중도금|잔금', label)) and not re.search(r'날짜|지급일|입금일|기일|일자', label)
        if original_date and (not date or not has_amount or not is_payment):
            date_warning = True
            date = ''
        row['payment_date'] = date
        if date: dates.append((row, date))
    counts = {}
    for _, date in dates: counts[date] = counts.get(date, 0) + 1
    for row, date in dates:
        if counts[date] > 1 and not ('계약금' in row['label'] and date == contract_date):
            row['payment_date'] = ''
            date_warning = True
    return date_warning, contract_date_warning, amount_warnings


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
                scale = min(1.5, 2400 / max(page.rect.width, page.rect.height))
                pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
                pages.append(base64.b64encode(pix.tobytes("jpeg", jpg_quality=90)).decode("ascii"))
            return {"pages": pages}
        finally:
            doc.close()
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("PDF를 열거나 렌더링하지 못했습니다.") from exc


RESIDENT_PROMPT = """이 주민등록표 초본 페이지에서 성명과 과거 주소 변동사항만 읽어 JSON으로 출력하세요.
형식: {"name":"성명 또는 빈 문자열","history":[{"address":"주소 원문","date":"전입일 또는 변동일 원문","reason":"변동사유 원문"}]}.
각 행의 주소와 날짜, 사유를 같은 행에서 읽고 원문 순서대로 보존하세요. 불명확하거나 없는 항목은 빈 문자열로 두세요. 날짜와 주소를 추측하거나 다른 행에서 가져오지 마세요. 주민등록번호, 세대주, 병역 등은 추출하지 마세요. 행이 없으면 history는 빈 배열입니다. JSON 외 다른 내용은 출력하지 마세요."""


def parse_image(image, model="8b", document_type="contract"):
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
        {"type": "text", "text": RESIDENT_PROMPT if document_type == "resident" else PROMPT}]}], "temperature": 0.1, "max_tokens": 4096, "response_format": {"type": "json_object"}}).encode()
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
        if document_type == "resident":
            if not isinstance(parsed, dict) or not isinstance(parsed.get('name'), str) or not isinstance(parsed.get('history'), list) or any(not isinstance(row, dict) or any(not isinstance(row.get(key), str) for key in ('address', 'date', 'reason')) for row in parsed['history']):
                raise RuntimeError('초본 주소 이력 형식이 올바르지 않습니다. 다시 분석하세요.')
            return {'result': {'name': parsed['name'], 'history': [{key: row[key] for key in ('address','date','reason')} for row in parsed['history']]}}
        person_fields = ("name", "address", "resident_registration_number", "ownership_share")
        if not isinstance(parsed, dict) or not all(
            isinstance(parsed.get(key), list) and all(
                isinstance(item, dict) and isinstance(item.get("label"), str) and isinstance(item.get("value"), str)
                for item in parsed[key]
            ) for key in ("property", "payments")
        ) or not all(isinstance(item.get("payment_date", ""), str) for item in parsed["payments"]) or not all(
            isinstance(parsed.get(key), list) and all(
                isinstance(person, dict) and all(isinstance(person.get(field), str) for field in person_fields)
                for person in parsed[key]
            ) for key in ("seller", "buyer")
        ):
            raise RuntimeError("모델이 필요한 핵심 항목 JSON 형식을 생성하지 못했습니다. 다시 시도하세요.")
        duplicate_dates, contract_date_warning, uncertain_amounts = normalize_single_pass(parsed)
        return {"text": json.dumps(parsed, ensure_ascii=False, indent=2), "date_warning": duplicate_dates, "contract_date_warning": contract_date_warning, "amount_warnings": uncertain_amounts}
    except urllib.error.HTTPError as exc:
        detail = exc.read(2048).decode("utf-8", "replace")
        raise RuntimeError(f"llama-server 오류 ({exc.code}): {detail}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise RuntimeError(f"선택한 {model.upper()} 모델 서버(127.0.0.1:{port})에 연결하지 못했습니다. 해당 모델과 mmproj로 llama-server를 실행하세요.") from exc
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError("llama-server 응답을 읽을 수 없습니다.") from exc
