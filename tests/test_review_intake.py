import base64, io, json, os, sqlite3, tempfile, unittest
from email.message import Message
from unittest.mock import patch
import fitz
from app.db import initialize, connect
from app.chapters.ch01_tax_housing.intake import create
class Request:
    def __init__(self,payload):
        body=json.dumps(payload).encode(); self.rfile=io.BytesIO(body); self.headers=Message()
        self.headers['Content-Type']='application/json'; self.headers['Content-Length']=str(len(body))
    def send_json(self,result): self.result=result
class ReviewIntake(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.env=patch.dict(os.environ,{'TAXFLOW_DB_PATH':self.tmp.name+'/test.sqlite3'});self.env.start();initialize()
        pdf=fitz.open();pdf.new_page().insert_text((40,40),'SYNTHETIC CONTRACT');self.raw=pdf.tobytes();pdf.close()
        self.payload={'token':'test-reviewed-contract-0001','filename':'test.pdf','pdf':base64.b64encode(self.raw).decode(),'model':'8b','confirmed':True,'data':{'taxpayerName':'검증용','address':'가상주소','landCategory':'대','landArea':'50.3907/37394.3 m²','buildingUse':'주거용','buildingArea':'83.18 m²'},'pages':[{'property':[{'label':'토지 면적','value':'50.3907/37394.3 m²'},{'label':'건물 면적','value':'83.18 m²'}],'buyer':[],'seller':[],'payments':[]}]}
    def tearDown(self): self.env.stop();self.tmp.cleanup()
    def test_full_creation_and_retry(self):
        first=Request(self.payload);create(first,'acquisition_contract');again=Request(self.payload);create(again,'acquisition_contract');self.assertEqual(first.result,again.result)
        with connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM consultations').fetchone()[0],1)
            self.assertEqual(db.execute('SELECT content FROM document_files').fetchone()[0],self.raw)
            data=json.loads(db.execute('SELECT data FROM consultations').fetchone()[0]);self.assertEqual(data['landArea'],'50.3907/37394.3 m²');self.assertEqual(data['acquisitionDocument'],'받음')
            self.assertEqual(db.execute('SELECT category FROM contract_property_facts ORDER BY ordinal').fetchall()[0][0],'land')
            self.assertEqual(db.execute('SELECT confirmed FROM acquisition_results').fetchone()[0],1)
    def test_invalid_and_failed_transactions(self):
        with self.assertRaises(ValueError):create(Request({**self.payload,'confirmed':False}),'acquisition_contract')
        with connect() as db:db.execute("CREATE TRIGGER reject_test BEFORE INSERT ON contract_intake_requests BEGIN SELECT RAISE(ABORT,'test'); END")
        with self.assertRaises(sqlite3.IntegrityError):create(Request(self.payload),'acquisition_contract')
        with connect() as db:
            for table in ('consultations','documents','document_files','contract_property_facts'):
                self.assertEqual(db.execute('SELECT count(*) FROM '+table).fetchone()[0],0)
if __name__=='__main__':unittest.main()
