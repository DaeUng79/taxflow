"""Consultation purchase and sale contracts share analysis but retain separate files."""
import base64
import binascii
import hashlib
import json
from urllib.parse import parse_qs, urlsplit

from ...db import connect
from ...db.payment_dates import add_payment_dates
from ..ch02_intake import api as vision
from ..ch02_intake import documents as shared_documents


def handle(handler):
    request = urlsplit(handler.path)
    parts = request.path.strip('/').split('/')
    method = handler.command
    if len(parts) >= 2 and parts[:2] == ['api', 'acquisition']:
        parts[1] = 'contracts'  # Keep existing acquisition URLs working.
    values = parse_qs(request.query).get('document_type', ['acquisition_contract'])
    if len(values) != 1 or values[0] not in ('acquisition_contract', 'transfer_contract'):
        handler.send_json_error('서류 유형이 올바르지 않습니다.', 400)
        return
    document_type = values[0]
    result_table = {'acquisition_contract': 'acquisition_results', 'transfer_contract': 'transfer_results'}[document_type]
    host = handler.headers.get('Host', '')
    allowed = (f'127.0.0.1:{handler.server.server_port}', f'localhost:{handler.server.server_port}')
    origin = handler.headers.get('Origin')
    if host not in allowed or (origin and origin not in tuple('http://' + h for h in allowed)):
        handler.send_error(403)
        return
    try:
        if method == 'POST' and parts == ['api', 'contracts', 'render']:
            if handler.headers.get_content_type() != 'application/pdf':
                raise ValueError('PDF 파일이 필요합니다.')
            size = int(handler.headers.get('Content-Length', '0'))
            if not 0 < size <= vision.MAX_PDF:
                raise ValueError('PDF는 20MB 이하여야 합니다.')
            handler.send_json(vision.render_pdf(handler.rfile.read(size)))
            return
        if method == 'POST' and parts == ['api', 'contracts', 'parse']:
            data = shared_documents.read_json(handler)
            handler.send_json(vision.parse_image(data.get('image'), data.get('model', '8b')))
            return
        if parts == ['api', 'contracts', 'documents']:
            if method == 'POST':
                save_contract(handler, document_type)
                return
            if method == 'GET':
                values = parse_qs(request.query).get('consultation_id', [])
                if len(values) != 1 or not values[0].isdigit():
                    raise ValueError('상담 번호가 필요합니다.')
                with connect() as db:
                    rows = db.execute('''SELECT d.id,d.document_type,d.filename,d.page_count,d.status,d.created_at,d.sha256,f.size_bytes
                        FROM documents d LEFT JOIN document_files f ON f.document_id=d.id
                        WHERE d.consultation_id=? AND d.document_type=? ORDER BY d.id DESC LIMIT 1''',
                        (int(values[0]), document_type)).fetchall()
                handler.send_json({'items': [dict(row) for row in rows]})
                return
        if len(parts) == 5 and parts[:3] == ['api', 'contracts', 'documents'] and parts[3].isdigit():
            document_id = int(parts[3])
            if method == 'GET' and parts[4] == 'pdf':
                with connect() as db:
                    row = db.execute('''SELECT f.content FROM document_files f JOIN documents d ON d.id=f.document_id
                        WHERE d.id=? AND d.document_type=? ''', (document_id, document_type)).fetchone()
                if row is None:
                    handler.send_error(404)
                    return
                blob = row['content']
                handler.send_response(200)
                handler.send_header('Content-Type', 'application/pdf')
                handler.send_header('Content-Length', str(len(blob)))
                handler.send_header('Cache-Control', 'no-store')
                handler.end_headers()
                handler.wfile.write(blob)
                return
            if parts[4] == 'result' and method in ('GET', 'PUT'):
                with connect() as db:
                    if method == 'PUT':
                        db.execute('BEGIN IMMEDIATE')
                    doc = db.execute("SELECT page_count,status,sha256 FROM documents WHERE id=? AND document_type=?", (document_id, document_type)).fetchone()
                    if doc is None:
                        handler.send_error(404)
                        return
                    if method == 'GET':
                        result = db.execute(f'SELECT pages_json,model,confirmed FROM {result_table} WHERE document_id=?', (document_id,)).fetchone()
                        if result is None:
                            # Earlier versions stored runs; show the latest successful result without changing that history.
                            old = db.execute("SELECT raw_json,reviewed_json,model FROM extraction_runs WHERE document_id=? AND status='completed' ORDER BY id DESC LIMIT 1", (document_id,)).fetchone()
                            if old is None:
                                handler.send_json({'result': None})
                                return
                            handler.send_json({'result': {'pages': add_payment_dates(json.loads(old['reviewed_json'] or old['raw_json'])), 'model': old['model'], 'confirmed': bool(old['reviewed_json'] and doc['status'] == 'confirmed')}})
                            return
                        handler.send_json({'result': {'pages': add_payment_dates(json.loads(result['pages_json'])), 'model': result['model'], 'confirmed': bool(result['confirmed'])}})
                        return
                    data = shared_documents.read_json(handler)
                    if data.get('expected_sha256') != doc['sha256']:
                        handler.send_json_error('계약서가 다른 화면에서 변경되었습니다. 창을 다시 열어 주세요.', 409)
                        return
                    model, pages, confirmed = data.get('model'), data.get('pages'), data.get('confirmed')
                    if model not in ('4b', '8b') or not isinstance(confirmed, bool):
                        raise ValueError('분석 결과 형식이 올바르지 않습니다.')
                    shared_documents.validate_pages(pages, doc['page_count'])
                    add_payment_dates(pages)
                    db.execute(f'''INSERT INTO {result_table}(document_id,model,pages_json,confirmed)
                        VALUES(?,?,?,?) ON CONFLICT(document_id) DO UPDATE SET model=excluded.model,
                        pages_json=excluded.pages_json, confirmed=excluded.confirmed, updated_at=CURRENT_TIMESTAMP''',
                        (document_id, model, json.dumps(pages, ensure_ascii=False), int(confirmed)))
                    db.execute('UPDATE documents SET status=? WHERE id=?', ('confirmed' if confirmed else 'review_needed', document_id))
                handler.send_json({'saved': True})
                return
        handler.send_error(404)
    except (ValueError, TypeError, KeyError, binascii.Error, UnicodeDecodeError, json.JSONDecodeError) as exc:
        handler.send_json_error(str(exc) or '요청 형식이 올바르지 않습니다.', 400)
    except RuntimeError as exc:
        handler.send_json_error(str(exc), 502)


def save_contract(handler, document_type):
    """Atomically replace the current contract only after validating the new PDF."""
    data = shared_documents.read_json(handler)
    cid, filename = data.get('consultation_id'), data.get('filename')
    expected_id, expected_hash = data.get('expected_document_id'), data.get('expected_sha256')
    if (type(cid) is not int or cid <= 0 or not isinstance(filename, str) or not filename.strip()
            or len(filename) > 255 or data.get('document_type') != document_type
            or (expected_id is not None and (type(expected_id) is not int or expected_id <= 0))
            or (expected_hash is not None and not isinstance(expected_hash, str))):
        raise ValueError('상담 번호 또는 서류 정보가 올바르지 않습니다.')
    raw = base64.b64decode(data['pdf'], validate=True)
    if len(raw) > vision.MAX_PDF:
        raise ValueError('PDF는 20MB 이하여야 합니다.')
    page_count = len(vision.render_pdf(raw)['pages'])
    digest = hashlib.sha256(raw).hexdigest()
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        consultation = db.execute('SELECT data FROM consultations WHERE id=?', (cid,)).fetchone()
        if consultation is None:
            handler.send_error(404)
            return
        consultation_data = json.loads(consultation['data'])
        if not isinstance(consultation_data, dict):
            raise ValueError('상담 정보를 읽을 수 없습니다.')
        current = db.execute("""SELECT id,sha256 FROM documents WHERE consultation_id=?
            AND document_type=? ORDER BY id DESC LIMIT 1""", (cid, document_type)).fetchone()
        if ((current is None and (expected_id is not None or expected_hash is not None))
                or (current is not None and (current['id'] != expected_id or current['sha256'] != expected_hash))):
            handler.send_json_error('등록된 계약서가 변경되었습니다. 창을 다시 열고 확인해 주세요.', 409)
            return
        if current is None:
            document_id = db.execute("""INSERT INTO documents(consultation_id,document_type,filename,page_count,sha256)
                VALUES(?,?,?,?,?)""", (cid, document_type, filename, page_count, digest)).lastrowid
        else:
            document_id = current['id']
            db.execute("""UPDATE documents SET filename=?,page_count=?,sha256=?,status='registered',
                created_at=CURRENT_TIMESTAMP WHERE id=?""", (filename, page_count, digest, document_id))
            result_table = {'acquisition_contract': 'acquisition_results', 'transfer_contract': 'transfer_results'}[document_type]
            db.execute(f'DELETE FROM {result_table} WHERE document_id=?', (document_id,))
            db.execute('DELETE FROM extraction_runs WHERE document_id=?', (document_id,))
            db.execute('DELETE FROM document_pages WHERE document_id=?', (document_id,))
        db.execute("""INSERT INTO document_files(document_id,content,size_bytes) VALUES(?,?,?)
            ON CONFLICT(document_id) DO UPDATE SET content=excluded.content,size_bytes=excluded.size_bytes""",
            (document_id, raw, len(raw)))
        db.executemany('INSERT INTO document_pages(document_id,page_number) VALUES(?,?)',
                       [(document_id, number) for number in range(1, page_count + 1)])
        field = {'acquisition_contract': 'acquisitionDocument', 'transfer_contract': 'transferDocument'}[document_type]
        consultation_data[field] = '받음'
        db.execute('UPDATE consultations SET data=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
                   (json.dumps(consultation_data, ensure_ascii=False), cid))
    handler.send_json({'id': document_id, 'page_count': page_count, 'sha256': digest})
