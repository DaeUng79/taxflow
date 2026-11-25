"""Atomic registration of a reviewed contract and its first consultation."""
import base64
import datetime
import hashlib
import json
import re
from ...db import connect
from ..ch01_pdf_Parsing import api as vision
from ..ch01_pdf_Parsing.documents import read_json, validate_pages


def create(handler, document_type):
    from .acquisition import store_property_facts
    payload = read_json(handler)
    token, filename, data = payload.get('token'), payload.get('filename'), payload.get('data')
    pages, model = payload.get('pages'), payload.get('model')
    if not isinstance(token, str) or not re.fullmatch(r'[a-zA-Z0-9-]{20,80}', token):
        raise ValueError('접수 요청 번호를 확인하세요.')
    if not isinstance(filename, str) or not 1 <= len(filename.strip()) <= 255:
        raise ValueError('파일 이름을 확인하세요.')
    if (not isinstance(data, dict) or any(not isinstance(v, str) or len(v)>4000 for v in data.values())
            or not data.get('taxpayerName','').strip() or len(json.dumps(data)) > 65536):
        raise ValueError('신고자 성명과 상담 내용을 확인하세요.')
    if model not in ('4b','8b') or payload.get('confirmed') is not True:
        raise ValueError('원본과 분석 내용을 확인한 뒤 저장하세요.')
    raw = base64.b64decode(payload['pdf'], validate=True)
    if len(raw)>vision.MAX_PDF:
        raise ValueError('PDF는 20MB 이하여야 합니다.')
    digest = hashlib.sha256(raw).hexdigest()
    with connect() as db:
        old=db.execute('SELECT consultation_id,sha256 FROM contract_intake_requests WHERE token=?',(token,)).fetchone()
        if old:
            if old['sha256'] != digest: raise ValueError('다른 파일의 접수 요청 번호입니다.')
            handler.send_json({'id':old['consultation_id']});return
    count=len(vision.render_pdf(raw)['pages']);validate_pages(pages,count)
    for page in pages:
        for key in ('property','payments','seller','buyer'):
            if not isinstance(page.get(key),list): raise ValueError('분석 결과 형식을 확인하세요.')
        for key, fields in [('property',('label','value')),('payments',('label','value')),('seller',('name','address','resident_registration_number','ownership_share')),('buyer',('name','address','resident_registration_number','ownership_share'))]:
            if any(not isinstance(row,dict) or any(not isinstance(row.get(f),str) for f in fields) for row in page[key]):
                raise ValueError('분석 결과 항목을 확인하세요.')
        if any(not isinstance(row.get('payment_date',''),str) for row in page['payments']): raise ValueError('지급일 형식을 확인하세요.')
    prefix='acquisition' if document_type=='acquisition_contract' else 'transfer'
    data=dict(data);data[prefix+'Document']='받음';data['consultedAt']=datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        old=db.execute('SELECT consultation_id,sha256 FROM contract_intake_requests WHERE token=?',(token,)).fetchone()
        if old:
            if old['sha256'] != digest: raise ValueError('다른 파일의 접수 요청 번호입니다.')
            cid=old['consultation_id']
        else:
            cid=db.execute('INSERT INTO consultations(taxpayer_name,consulted_at,data) VALUES(?,?,?)',(data['taxpayerName'].strip(),data['consultedAt'],json.dumps(data,ensure_ascii=False))).lastrowid
            did=db.execute("INSERT INTO documents(consultation_id,document_type,filename,page_count,sha256,status) VALUES(?,?,?,?,?,'confirmed')",(cid,document_type,filename,count,digest)).lastrowid
            db.execute('INSERT INTO document_files(document_id,content,size_bytes) VALUES(?,?,?)',(did,raw,len(raw)))
            db.executemany('INSERT INTO document_pages(document_id,page_number) VALUES(?,?)',[(did,n) for n in range(1,count+1)])
            db.execute(f'INSERT INTO {prefix}_results(document_id,model,pages_json,confirmed) VALUES(?,?,?,1)',(did,model,json.dumps(pages,ensure_ascii=False)))
            store_property_facts(db,did,pages)
            db.execute('INSERT INTO contract_intake_requests(token,consultation_id,sha256) VALUES(?,?,?)',(token,cid,digest))
    handler.send_json({'id':cid})
