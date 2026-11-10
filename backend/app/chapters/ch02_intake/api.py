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
{"property":[{"label":"소재지","value":"원문의 소재지"}],"payments":[{"label":"계약금","value":"원문에 적힌 계약금","payment_date":"원문에 적힌 지급일"}],"seller":[{"name":"성명","address":"주소","resident_registration_number":"주민등록번호","ownership_share":"지분"}],"buyer":[{"name":"성명","address":"주소","resident_registration_number":"주민등록번호","ownership_share":"지분"}]}.
property는 보이는 항목을 label과 value 문자열로 추출하세요. property에는 소재지와 토지·건물의 표시를 기록하세요. payments의 각 항목은 label, value, payment_date 세 문자열을 포함합니다. 매매대금, 계약금, 중도금, 잔금은 각각 별도 항목으로 기록하고, 각 금액에 명시된 약정 지급일을 같은 항목의 payment_date에 원문 그대로 기록하세요. 서로 다른 중도금은 순번과 함께 별도 항목으로 구분하세요. 해당 지급일이 없거나 어떤 금액의 지급일인지 불확실하면 빈 문자열로 두고 추측하지 마세요. 지급일만 보이고 해당 금액과의 관계가 불명확하면 원문 항목명과 날짜를 별도 항목의 label과 value에 기록하고 payment_date는 비워 두세요. 지급방식은 추출하지 마세요. 금액 항목의 value에는 보이는 아라비아 숫자의 금액만 쉼표와 원을 붙여 기재하세요. 예시 값을 복사하지 말고 해당 계약서에 보이는 금액만 기재하세요. 원문에 숫자 금액이 없거나 판독이 불확실하면 한글 금액을 임의로 숫자로 변환하지 말고 원문 또는 [판독 불가]로 기재하세요.
seller와 buyer는 사람별 객체의 배열입니다. 각각 매도인과 매수인을 구분하고 공동명의를 포함한 각 사람마다 별도의 객체를 만드세요. 각 객체에는 name, address, resident_registration_number, ownership_share 네 문자열을 모두 포함하세요. 주민등록번호는 보이는 전체 숫자와 하이픈을 보존하세요. 사람과 해당 주소, 주민등록번호, 지분의 관계가 불명확하면 임의로 연결하지 마세요. 원문에 없는 값은 빈 문자열, 글자가 있으나 판독할 수 없는 값은 '[판독 불가]'로 표시하세요. 다른 사람의 정보를 복사하거나 공동명의 여부, 지분 등을 추측하지 마세요. 이 페이지에 해당 항목이 없으면 해당 배열을 빈 배열 []로 두세요. 중개인 정보는 제외하세요. 금액 이외의 숫자와 단위, 표기는 원문을 그대로 유지하세요."""

DATE_PROMPT = """매매계약서의 매매대금 표를 읽으세요. 각 행의 이름, 금액란의 내용을 보이는 그대로, 그 행의 지급 날짜를 각각 기록하세요. 다른 행의 금액이나 날짜를 절대 가져오지 마세요. 날짜는 같은 행에 명확하게 기재된 연월일만 사용합니다. 금액란에 금액이 없고 '금', '원정'만 있는 경우 amount_text는 반드시 빈 문자열이고 date도 빈 문자열입니다. 특히 중도금 행이 비어 있다면 다른 행의 날짜를 중도금에 기입하지 마세요. 계약금 행에 계약시 또는 계약시에 지급한다고 적힌 경우 timing에는 반드시 계약시라고 적고 date는 빈 문자열입니다. 계약시 표현이 보이지 않으면 timing은 빈 문자열입니다. 인쇄한 빈칸 '년 월 일'도 빈 문자열입니다. 그밖에 불확실하거나 보이지 않는 값은 추측하지 말고 빈 문자열로 둡니다. JSON 객체만 출력하세요. {"payments":[{"label":"계약금","amount_text":"해당 행의 금액","date":"해당 행의 날짜 또는 빈 문자열","timing":"계약시 또는 빈 문자열"}]}"""


CONTRACT_DATE_PROMPT = """부동산 매매계약서 하단에서 계약 당사자가 서명·날인하는 곳 바로 위에 적힌 계약 체결일만 읽으세요. 본문의 잔금일, 특약 날짜, 주소, 주민등록번호, 전화번호 등 다른 숫자를 사용하지 마세요. 계약일 숫자 위나 주변에 손글씨로 다른 숫자를 덧쓰거나 지운 흔적이 보이면 correction_or_ambiguity를 true로 하고 날짜는 빈 문자열로 남기세요. 숫자가 선명하고 수정 흔적이 없을 때만 false로 합니다. 수정되었거나 불분명하면 추측하지 마세요. 연월일이 전부 보일 때만 읽은 날짜를 기입하세요. 날짜 외의 개인정보는 출력하지 마세요. JSON으로만 답하세요: {\"contract_date\":\"날짜 또는 빈 문자열\", \"correction_or_ambiguity\": false}"""

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


def _payment_key(label):
    return re.sub(r'[\s:：·()\-]', '', label)


def _date_crop(raw, bottom=False):
    # The payment table is normally near the top; magnification makes small dates legible.
    import fitz
    image = fitz.open(stream=raw, filetype='jpeg')
    try:
        page = image[0]
        rect = page.rect
        pix = page.get_pixmap(matrix=fitz.Matrix(1.4, 1.4),
                              clip=fitz.Rect(0, rect.height * .65 if bottom else 0, rect.width, rect.height * .84 if bottom else rect.height * .55), alpha=False)
        return base64.b64encode(pix.tobytes('jpeg', jpg_quality=90)).decode('ascii')
    finally:
        image.close()


def _amount_number(value):
    """Read unambiguous numeric or Korean amounts for comparison only."""
    value = value.strip()
    marked = re.search(r'[₩W]\s*([0-9][0-9,]*)', value, re.I)
    if marked:
        return int(marked.group(1).replace(',', ''))
    numeric = re.fullmatch(r'(?:금\s*)?([0-9][0-9,]*)\s*(?:원(?:정)?)?', value)
    if numeric:
        return int(numeric.group(1).replace(',', ''))
    word = re.sub(r'\s+', '', value)
    word = re.sub(r'^금', '', word)
    word = re.sub(r'원정?$', '', word)
    if not word or not re.fullmatch(r'[영공일이삼사오육칠팔구십백천만억조]+', word):
        return None
    digits = dict(zip('영공일이삼사오육칠팔구', (0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9)))
    small, large = {'십':10, '백':100, '천':1000}, {'만':10000, '억':100000000, '조':1000000000000}
    total = section = 0
    digit = None
    for ch in word:
        if ch in digits:
            if digit is not None:  # Digit-by-digit Korean readings are ambiguous.
                return None
            digit = digits[ch]
        elif ch in small:
            section += (digit if digit is not None else 1) * small[ch]
            digit = None
        else:
            section += digit if digit is not None else 0
            total += (section or 1) * large[ch]
            section, digit = 0, None
    return total + section + (digit if digit is not None else 0)


def merge_payment_dates(payments, date_rows, contract_date=""):
    """Connect dates only to their confirmed payment rows."""
    labels = {}
    for row in date_rows:
        if isinstance(row, dict) and all(isinstance(row.get(key), str) for key in ('label', 'amount_text', 'date')):
            labels.setdefault(_payment_key(row['label']), []).append(row)
    primary = {}
    for item in payments:
        primary.setdefault(_payment_key(item['label']), []).append(item)
        item['payment_date'] = ''  # The first pass can copy one row's date to others.
    amount = re.compile(r'^(?:[₩W]\s*)?(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원?$', re.I)
    korean_amount = re.compile(r'^(?:금\s*)?[일이삼사오육칠팔구십백천만억조\s]+(?:원(?:정)?)?$')
    matched, uncertain_amounts = [], []
    for key, items in primary.items():
        rows = labels.get(key, [])
        if len(items) != 1 or len(rows) != 1:
            continue
        item, row = items[0], rows[0]
        value = item['value'].strip()
        has_amount = bool(amount.fullmatch(value) or (korean_amount.fullmatch(value) and re.search(r'[십백천만억조원]', value)))
        # Require the focused pass to see an amount in this row as well.
        visible_amount = row['amount_text'].strip()
        has_visible_amount = bool(re.search(r'\d', visible_amount) or re.search(r'[십백천만억조]', visible_amount))
        main_amount, focused_amount = _amount_number(value), _amount_number(visible_amount)
        if (has_amount and not has_visible_amount) or (main_amount is not None and focused_amount is not None and main_amount != focused_amount):
            uncertain_amounts.append(item['label'])
            if not has_visible_amount and re.fullmatch(r'(?:금|원|원정|금원|금원정)?', re.sub(r'\s+', '', visible_amount)):
                item['unverified_value'] = item['value']
                item['value'] = ''
        if not (has_amount and has_visible_amount and not re.search(r'날짜|지급일|입금일|기일|일자', item['label']) and not re.search(r'매매대금|매매금액', item['label'])):
            continue
        date = formatted_date(row['date'])
        if not date and '계약금' in key and re.search(r'계약\s*(?:시|당일)', row.get('timing') if isinstance(row.get('timing'), str) else ''):
            date = formatted_date(contract_date)
        if date:
            matched.append((item, date, date))
    # Repeated dates across different rows may be valid, but often indicate copied output.
    counts = {}
    for _, _, normalized in matched:
        counts[normalized] = counts.get(normalized, 0) + 1
    for item, date, normalized in matched:
        if counts[normalized] == 1 or ('계약금' in item['label'] and date == formatted_date(contract_date)):
            item['payment_date'] = date
    return any(count > 1 for count in counts.values()), uncertain_amounts



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
        ) or not all(isinstance(item.get("payment_date", ""), str) for item in parsed["payments"]) or not all(
            isinstance(parsed.get(key), list) and all(
                isinstance(person, dict) and all(isinstance(person.get(field), str) for field in person_fields)
                for person in parsed[key]
            ) for key in ("seller", "buyer")
        ):
            raise RuntimeError("모델이 필요한 핵심 항목 JSON 형식을 생성하지 못했습니다. 다시 시도하세요.")
        for item in parsed["payments"]:
            item["value"] = normalize_payment_value(item["label"], item["value"])
        duplicate_dates, uncertain_amounts, contract_date_warning = False, [], False
        if parsed["payments"]:
            # A separate, magnified pass prevents dates from being copied between rows.
            date_body = json.dumps({"messages": [{"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + _date_crop(raw)}},
                {"type": "text", "text": DATE_PROMPT}]}], "temperature": 0,
                "max_tokens": 1000, "response_format": {"type": "json_object"}}).encode()
            date_request = urllib.request.Request(f"http://127.0.0.1:{port}/v1/chat/completions", data=date_body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(date_request, timeout=600) as response:
                date_result = json.load(response)
            if date_result["choices"][0].get("finish_reason") == "length":
                raise RuntimeError("지급일 분석 결과가 잘렸습니다. 다시 분석해 주세요.")
            try:
                date_payload = json.loads(date_result["choices"][0]["message"]["content"])
                date_rows = date_payload["payments"]
                if not isinstance(date_rows, list) or not all(isinstance(row, dict) and all(isinstance(row.get(key), str) for key in ('label', 'amount_text', 'date')) for row in date_rows):
                    raise ValueError()
            except (ValueError, KeyError, TypeError) as exc:
                raise RuntimeError("지급일 분석 결과를 읽을 수 없습니다. 다시 분석해 주세요.") from exc
            needs_contract_date = any('계약금' in row['label'] and re.search(r'계약\s*(?:시|당일)', row.get('timing') if isinstance(row.get('timing'), str) else '') for row in date_rows)
        else:
            needs_contract_date = False
        contract_date = ''
        contract_body = json.dumps({"messages": [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + _date_crop(raw, bottom=True)}},
            {"type": "text", "text": CONTRACT_DATE_PROMPT}]}], "temperature": 0,
            "max_tokens": 300, "response_format": {"type": "json_object"}}).encode()
        contract_request = urllib.request.Request(f"http://127.0.0.1:{port}/v1/chat/completions", data=contract_body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(contract_request, timeout=600) as response:
            contract_result = json.load(response)
        try:
            contract_payload = json.loads(contract_result["choices"][0]["message"]["content"])
            if contract_result['choices'][0].get('finish_reason') != 'length' and contract_payload.get('correction_or_ambiguity') is False:
                contract_date = formatted_date(contract_payload.get('contract_date', ''))
        except (ValueError, KeyError, TypeError, IndexError):
            contract_date = ''
        contract_date_warning = needs_contract_date and not bool(contract_date)
        if contract_date:
            parsed['property'].append({'label': '계약 체결일', 'value': contract_date})
        if parsed['payments']:
            duplicate_dates, uncertain_amounts = merge_payment_dates(parsed["payments"], date_rows, contract_date)
        return {"text": json.dumps(parsed, ensure_ascii=False, indent=2), "date_warning": duplicate_dates, "contract_date_warning": contract_date_warning, "amount_warnings": uncertain_amounts}
    except urllib.error.HTTPError as exc:
        detail = exc.read(2048).decode("utf-8", "replace")
        raise RuntimeError(f"llama-server 오류 ({exc.code}): {detail}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise RuntimeError(f"선택한 {model.upper()} 모델 서버(127.0.0.1:{port})에 연결하지 못했습니다. 해당 모델과 mmproj로 llama-server를 실행하세요.") from exc
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError("llama-server 응답을 읽을 수 없습니다.") from exc
