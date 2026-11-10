"""Storage for consultation documents and immutable extraction runs."""
import base64
import binascii
import hashlib
import json
from urllib.parse import parse_qs, urlsplit

from ...db import connect
from . import api

MAX_JSON = 30 * 1024 * 1024


def handle(handler):
    path = urlsplit(handler.path)
    parts = path.path.strip('/').split('/')
    method = handler.command
    host = handler.headers.get('Host', '')
    allowed = (f'127.0.0.1:{handler.server.server_port}', f'localhost:{handler.server.server_port}')
    origin = handler.headers.get('Origin')
    if host not in allowed or (origin and origin not in tuple('http://' + h for h in allowed)):
        handler.send_error(403); return
    try:
        if method == 'GET' and parts == ['api', 'documents']:
            values = parse_qs(path.query).get('consultation_id', [])
            if len(values) != 1 or not values[0].isdigit(): raise ValueError('상담 번호가 필요합니다.')
            with connect() as db:
                rows = db.execute('SELECT d.id,d.document_type,d.filename,d.page_count,d.status,d.created_at,f.size_bytes FROM documents d LEFT JOIN document_files f ON f.document_id=d.id WHERE d.consultation_id=? ORDER BY d.id DESC', (int(values[0]),)).fetchall()
            handler.send_json({'items':[dict(row) for row in rows]}); return
        if len(parts) < 3 or parts[:2] != ['api', 'documents'] or not parts[2].isdigit():
            if method == 'POST' and parts == ['api', 'documents']:
                return create(handler)
            handler.send_error(404); return
        did = int(parts[2])
        if method == 'GET' and len(parts) == 4 and parts[3] == 'pdf':
            with connect() as db:
                row = db.execute('SELECT content FROM document_files WHERE document_id=?', (did,)).fetchone()
            if not row: handler.send_error(404); return
            data = row['content']; handler.send_response(200); handler.send_header('Content-Type','application/pdf'); handler.send_header('Content-Length',str(len(data))); handler.send_header('Cache-Control','no-store'); handler.end_headers(); handler.wfile.write(data); return
        if len(parts) == 4 and parts[3] == 'runs':
            if method == 'GET':
                with connect() as db:
                    rows = db.execute('SELECT id,model,schema_version,status,raw_json,reviewed_json,error,created_at,reviewed_at FROM extraction_runs WHERE document_id=? ORDER BY id DESC', (did,)).fetchall()
                handler.send_json({'items':[dict(row) for row in rows]}); return
            if method == 'POST':
                data = read_json(handler); state = data.get('status'); model = data.get('model'); pages = data.get('pages'); error = data.get('error','')
                if state not in ('completed','failed') or model not in ('4b','8b') or not isinstance(error,str) or len(error)>2000: raise ValueError('분석 이력 형식이 올바르지 않습니다.')
                with connect() as db:
                    doc = db.execute('SELECT page_count FROM documents WHERE id=?',(did,)).fetchone()
                    if not doc: handler.send_error(404); return
                    if state == 'completed': validate_pages(pages, doc['page_count'])
                    raw = json.dumps(pages,ensure_ascii=False) if state == 'completed' else None
                    cur = db.execute('INSERT INTO extraction_runs(document_id,model,status,raw_json,error) VALUES (?,?,?,?,?)',(did,model,state,raw,error if state == 'failed' else None))
                    db.execute('UPDATE documents SET status=? WHERE id=?',('review_needed' if state == 'completed' else 'failed',did))
                    run_id = cur.lastrowid
                handler.send_json({'id':run_id}); return
        if method == 'PUT' and len(parts) == 5 and parts[3] == 'runs' and parts[4].isdigit():
            data=read_json(handler); pages=data.get('pages'); run_id=int(parts[4]); reviewed=data.get('confirmed')
            if not isinstance(reviewed,bool): raise ValueError('확인 상태가 올바르지 않습니다.')
            with connect() as db:
                row=db.execute('SELECT d.page_count FROM documents d JOIN extraction_runs r ON r.document_id=d.id WHERE d.id=? AND r.id=? AND r.status=?',(did,run_id,'completed')).fetchone()
                if not row: handler.send_error(404); return
                validate_pages(pages,row['page_count'])
                db.execute('UPDATE extraction_runs SET reviewed_json=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?',(json.dumps(pages,ensure_ascii=False),run_id))
                # An old run's review must not change the status of a newer run.
                latest=db.execute('SELECT id FROM extraction_runs WHERE document_id=? ORDER BY id DESC LIMIT 1',(did,)).fetchone()
                if latest['id']==run_id: db.execute('UPDATE documents SET status=? WHERE id=?',('confirmed' if reviewed else 'review_needed',did))
            handler.send_json({'saved':True}); return
        handler.send_error(404)
    except (ValueError, TypeError, KeyError, binascii.Error, UnicodeDecodeError, json.JSONDecodeError) as exc:
        handler.send_json_error(str(exc) or '요청 형식이 올바르지 않습니다.',400)
    except RuntimeError as exc:
        handler.send_json_error(str(exc), 502)


def read_json(handler):
    if handler.headers.get_content_type() != 'application/json': raise ValueError('JSON 요청이 필요합니다.')
    length=int(handler.headers.get('Content-Length','0'))
    if length <= 0 or length > MAX_JSON: raise ValueError('요청 크기가 허용 범위를 벗어났습니다.')
    data=json.loads(handler.rfile.read(length))
    if not isinstance(data,dict): raise ValueError('요청 형식이 올바르지 않습니다.')
    return data


def validate_pages(pages, count):
    if not isinstance(pages,list) or len(pages)!=count or any(not isinstance(p,dict) for p in pages):
        raise ValueError('모든 페이지의 JSON 객체가 필요합니다.')


def create(handler):
    data=read_json(handler); cid=data.get('consultation_id'); filename=data.get('filename'); kind=data.get('document_type')
    if not isinstance(cid,int) or isinstance(cid,bool) or not isinstance(filename,str) or not filename.strip() or len(filename)>255 or kind != 'acquisition_contract': raise ValueError('상담 번호 또는 서류 정보가 올바르지 않습니다.')
    raw=base64.b64decode(data['pdf'],validate=True)
    if len(raw)>api.MAX_PDF: raise ValueError('PDF는 20MB 이하여야 합니다.')
    rendered=api.render_pdf(raw); count=len(rendered['pages'])
    with connect() as db:
        if not db.execute('SELECT 1 FROM consultations WHERE id=?',(cid,)).fetchone(): handler.send_error(404); return
        cur=db.execute('INSERT INTO documents(consultation_id,document_type,filename,page_count,sha256) VALUES (?,?,?,?,?)',(cid,kind,filename,count,hashlib.sha256(raw).hexdigest()))
        did=cur.lastrowid
        db.execute('INSERT INTO document_files(document_id,content,size_bytes) VALUES (?,?,?)',(did,raw,len(raw)))
        db.executemany('INSERT INTO document_pages(document_id,page_number) VALUES (?,?)',[(did,n) for n in range(1,count+1)])
    handler.send_json({'id':did,'page_count':count})
