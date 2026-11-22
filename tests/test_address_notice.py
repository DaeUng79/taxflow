import io,json,os,tempfile,unittest
from email.message import Message
from types import SimpleNamespace
from unittest.mock import patch
from app.db import initialize,connect
from app.main import Handler

class Request:
    def __init__(self,payload):
        body=json.dumps(payload).encode();self.rfile=io.BytesIO(body);self.headers=Message();self.headers['Content-Type']='application/json';self.headers['Content-Length']=str(len(body));self.headers['Host']='127.0.0.1:8765';self.server=SimpleNamespace(server_port=8765)
    def send_json(self,data):self.result=data
    def send_error(self,status):self.error=status
    def send_json_error(self,message,status):self.error=status

class AddressNoticeTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.env=patch.dict(os.environ,{'TAXFLOW_DB_PATH':self.tmp.name+'/notice.sqlite3'});self.env.start();initialize();self.sha='a'*64
        with connect() as db:
            self.cid=db.execute('INSERT INTO consultations(taxpayer_name,consulted_at,data) VALUES(?,?,?)',('가상','2026',json.dumps({'taxpayerName':'가상','address':'기존','addressDetail':'101호','notes':'보존'}))).lastrowid
            db.execute("INSERT INTO documents(consultation_id,document_type,filename,page_count,sha256) VALUES(?,?,?,?,?)",(self.cid,'transfer_contract','가상.pdf',1,self.sha))
    def tearDown(self):self.env.stop();self.tmp.cleanup()
    def test_dismiss_and_apply_preserve_other_data(self):
        req=Request({'action':'dismiss','marker':'가상 표시','sha256':self.sha});Handler.address_notice(req,self.cid);self.assertTrue(req.result['saved'])
        with connect() as db:data=json.loads(db.execute('SELECT data FROM consultations WHERE id=?',(self.cid,)).fetchone()[0])
        self.assertEqual(data['_addressNoticeDismissed'],'가상 표시');self.assertEqual(data['notes'],'보존');self.assertEqual(data['address'],'기존')
        req=Request({'action':'apply','marker':'가상 표시','sha256':self.sha,'address':'새 주소'});Handler.address_notice(req,self.cid);self.assertTrue(req.result['saved'])
        with connect() as db:data=json.loads(db.execute('SELECT data FROM consultations WHERE id=?',(self.cid,)).fetchone()[0])
        self.assertEqual(data['address'],'새 주소');self.assertEqual(data['addressDetail'],'');self.assertEqual(data['notes'],'보존');self.assertNotIn('_addressNoticeDismissed',data);self.assertEqual(json.loads(data['_fieldSources'])['address'],{'source':'양도','value':'새 주소'})
    def test_changed_contract_rejected(self):
        req=Request({'action':'dismiss','marker':'가상 표시','sha256':'b'*64});Handler.address_notice(req,self.cid);self.assertEqual(req.error,409)
        with connect() as db:data=json.loads(db.execute('SELECT data FROM consultations WHERE id=?',(self.cid,)).fetchone()[0])
        self.assertNotIn('_addressNoticeDismissed',data)
if __name__=='__main__':unittest.main()
