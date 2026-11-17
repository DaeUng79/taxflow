import base64, io, json, os, tempfile, unittest
from email.message import Message
from types import SimpleNamespace
from unittest.mock import patch
import fitz
from backend.app.db import initialize, connect
from backend.app.chapters.ch01_consultation.resident import handle

class Request:
    def __init__(self,path,method='GET',data=None):
        self.path=path; self.command=method; self.server=SimpleNamespace(server_port=8765); self.headers=Message(); self.headers['Host']='127.0.0.1:8765'
        body=json.dumps(data,ensure_ascii=False).encode() if data is not None else b''
        self.headers['Content-Type']='application/json'; self.headers['Content-Length']=str(len(body)); self.rfile=io.BytesIO(body); self.result=None
    def send_json(self,data): self.result=data
    def send_json_error(self,msg,status): self.error=(msg,status)
    def send_error(self,status): self.error=('',status)

class ResidentTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.env=patch.dict(os.environ,{'TAXFLOW_DB_PATH':self.tmp.name+'/test.sqlite3'}); self.env.start(); initialize()
        pdf=fitz.open();pdf.new_page();raw=pdf.tobytes();pdf.close()
        self.payload={'token':'synthetic-resident-token-0001','consultation_id':None,'filename':'sample.pdf','pdf':base64.b64encode(raw).decode(),'model':'8b','data':{'taxpayerName':'검증용','residenceDetails':'테스트'},'pages':[{'name':'검증용','history':[{'address':'가상 주소','date':'2010.01.01.','reason':'전입'}]}]}
    def tearDown(self): self.env.stop();self.tmp.cleanup()
    def test_save_review_and_retry(self):
        first=Request('/api/resident/save','POST',self.payload);handle(first);self.assertIsNotNone(first.result)
        retry=Request('/api/resident/save','POST',self.payload);handle(retry);self.assertEqual(first.result,retry.result)
        with connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM documents WHERE document_type='resident_extract'").fetchone()[0],1)
            data=json.loads(db.execute('SELECT data FROM consultations').fetchone()[0]);self.assertEqual(data['residentDocument'],'받음')
        get=Request('/api/resident/result?consultation_id='+str(first.result['id']));handle(get);self.assertEqual(json.loads(get.result['result']['reviewed_json']),self.payload['pages'])
    def test_reject_invalid_pages(self):
        data={**self.payload,'pages':[{'name':'검증용','history':[{'address':'주소','date':[],'reason':'전입'}]}]}
        req=Request('/api/resident/save','POST',data);handle(req);self.assertEqual(req.error[1],400)
        with connect() as db:self.assertEqual(db.execute('SELECT count(*) FROM documents').fetchone()[0],0)
if __name__=='__main__': unittest.main()
