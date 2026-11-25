"""Reviewed resident registration extracts attached to consultations."""
import base64
import binascii
import datetime
import hashlib
import json
import re
from urllib.parse import parse_qs, urlsplit
from ...access import allowed_request
from ...db import connect
from ..ch01_pdf_Parsing import api
from ..ch01_pdf_Parsing.documents import read_json, validate_pages


def handle(handler):
    req = urlsplit(handler.path)
    if not allowed_request(handler):
        handler.send_error(403); return
    try:
        if handler.command == 'POST' and req.path == '/api/resident/render':
            if handler.headers.get_content_type() != 'application/pdf': raise ValueError('PDF 파일이 필요합니다.')
            size = int(handler.headers.get('Content-Length', '0'))
            if not 0 < size <= api.MAX_PDF: raise ValueError('PDF는 20MB 이하여야 합니다.')
            handler.send_json(api.render_pdf(handler.rfile.read(size))); return
        if handler.command == 'POST' and req.path == '/api/resident/parse':
            payload = read_json(handler)
            handler.send_json(api.parse_image(payload.get('image'), payload.get('model','8b'), 'resident')); return
        if handler.command == 'GET' and req.path == '/api/resident/result':
            ids = parse_qs(req.query).get('consultation_id', [])
            if len(ids) != 1 or not ids[0].isdigit(): raise ValueError('상담 번호가 필요합니다.')
            with connect() as db:
                row = db.execute("""SELECT d.id,d.filename,d.sha256,r.model,r.reviewed_json FROM documents d JOIN extraction_runs r ON r.document_id=d.id WHERE d.consultation_id=? AND d.document_type='resident_extract' AND r.reviewed_json IS NOT NULL ORDER BY d.id DESC,r.id DESC LIMIT 1""", (int(ids[0]),)).fetchone()
            handler.send_json({'result': dict(row) if row else None}); return
        if handler.command == 'GET' and req.path == '/api/resident/pdf':
            ids = parse_qs(req.query).get('id', [])
            if len(ids) != 1 or not ids[0].isdigit(): raise ValueError('문서 번호가 필요합니다.')
            with connect() as db:
                row = db.execute("SELECT f.content FROM documents d JOIN document_files f ON f.document_id=d.id WHERE d.id=? AND d.document_type='resident_extract'", (int(ids[0]),)).fetchone()
            if not row: handler.send_error(404); return
            handler.send_response(200); handler.send_header('Content-Type','application/pdf'); handler.send_header('Content-Length',str(len(row['content']))); handler.send_header('Cache-Control','no-store'); handler.end_headers(); handler.wfile.write(row['content']); return
        if handler.command == 'POST' and req.path == '/api/resident/save':
            payload = read_json(handler); cid = payload.get('consultation_id'); data = payload.get('data'); pages = payload.get('pages'); model = payload.get('model'); token = payload.get('token'); filename = payload.get('filename')
            if not isinstance(token,str) or not re.fullmatch(r'[a-zA-Z0-9-]{20,80}',token): raise ValueError('접수 요청 번호를 확인하세요.')
            if cid is not None and (not isinstance(cid,int) or isinstance(cid,bool) or cid <= 0): raise ValueError('상담 번호를 확인하세요.')
            if not isinstance(filename,str) or not 1 <= len(filename.strip()) <= 255 or model not in ('4b','8b'): raise ValueError('파일 또는 모델 정보를 확인하세요.')
            if not isinstance(data,dict) or any(not isinstance(k,str) or not isinstance(v,str) or len(v)>4000 for k,v in data.items()) or not data.get('taxpayerName','').strip() or len(json.dumps(data))>65536: raise ValueError('신고자 성명과 상담 내용을 확인하세요.')
            raw = base64.b64decode(payload.get('pdf',''),validate=True)
            if len(raw)>api.MAX_PDF: raise ValueError('PDF는 20MB 이하여야 합니다.')
            count = len(api.render_pdf(raw)['pages']); validate_pages(pages,count)
            for page in pages:
                if not isinstance(page.get('name'),str) or not isinstance(page.get('history'),list) or any(not isinstance(row,dict) or any(not isinstance(row.get(k),str) or len(row[k])>2000 for k in ('address','date','reason')) for row in page['history']): raise ValueError('초본 분석 결과를 확인하세요.')
            digest=hashlib.sha256(raw).hexdigest(); data=dict(data); data['residentDocument']='받음'; data['consultedAt']=datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            with connect() as db:
                db.execute('BEGIN IMMEDIATE')
                old=db.execute('SELECT consultation_id,sha256 FROM contract_intake_requests WHERE token=?',(token,)).fetchone()
                if old:
                    if old['sha256'] != digest or (cid is not None and old['consultation_id'] != cid): raise ValueError('접수 요청이 일치하지 않습니다.')
                    handler.send_json({'id':old['consultation_id']}); return
                if cid is None:
                    cid=db.execute('INSERT INTO consultations(taxpayer_name,consulted_at,data) VALUES(?,?,?)',(data['taxpayerName'].strip(),data['consultedAt'],json.dumps(data,ensure_ascii=False))).lastrowid
                else:
                    current=db.execute('SELECT data FROM consultations WHERE id=?',(cid,)).fetchone()
                    if not current: raise ValueError('상담 정보를 찾을 수 없습니다.')
                    previous=json.loads(current['data']); previous.update(data); data=previous
                    db.execute('UPDATE consultations SET taxpayer_name=?,consulted_at=?,data=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',(data['taxpayerName'].strip(),data['consultedAt'],json.dumps(data,ensure_ascii=False),cid))
                did=db.execute("INSERT INTO documents(consultation_id,document_type,filename,page_count,sha256,status) VALUES(?,?,?,?,?,'confirmed')",(cid,'resident_extract',filename,count,digest)).lastrowid
                db.execute('INSERT INTO document_files(document_id,content,size_bytes) VALUES(?,?,?)',(did,raw,len(raw)))
                db.executemany('INSERT INTO document_pages(document_id,page_number) VALUES(?,?)',[(did,n) for n in range(1,count+1)])
                serialized=json.dumps(pages,ensure_ascii=False)
                db.execute("INSERT INTO extraction_runs(document_id,model,status,raw_json,reviewed_json,reviewed_at) VALUES(?,?,'completed',?,?,CURRENT_TIMESTAMP)",(did,model,serialized,serialized))
                db.execute('INSERT INTO contract_intake_requests(token,consultation_id,sha256) VALUES(?,?,?)',(token,cid,digest))
            handler.send_json({'id':cid}); return
        handler.send_error(404)
    except (ValueError,TypeError,KeyError,binascii.Error,UnicodeDecodeError,json.JSONDecodeError) as exc:
        handler.send_json_error(str(exc) or '요청 형식이 올바르지 않습니다.',400)
    except RuntimeError as exc:
        handler.send_json_error(str(exc),502)
