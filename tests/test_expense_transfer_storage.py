import io
import json
import os
import tempfile
import unittest
from email.message import Message
from types import SimpleNamespace
from unittest.mock import patch
from app.db import initialize, connect
from app.main import Handler

class Request:
    def __init__(self, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.rfile = io.BytesIO(body)
        self.headers = Message()
        self.headers['Content-Type'] = 'application/json'
        self.headers['Content-Length'] = str(len(body))
        self.headers['Host'] = '127.0.0.1:8765'
        self.server = SimpleNamespace(server_port=8765)
    def send_json(self, data): self.result = data
    def send_error(self, status, *args): self.error = status

class ExpenseTransferStorageTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'TAXFLOW_DB_PATH': self.temp.name + '/test.sqlite3'})
        self.env.start(); initialize()
    def tearDown(self):
        self.env.stop(); self.temp.cleanup()
    def test_roundtrip_and_older_client_preserves_details(self):
        values = {'taxpayerName':'가상', 'consultedAt':'2026-01-01', 'expenses':'5000', 'expenseDetails':'기존 메모',
                  'expensePresence':'있음', 'expenseItemsJson':json.dumps([{'kind':'취득 관련','amount':'5000'}]),
                  'otherTransfers':'있음', 'otherTransferItemsJson':json.dumps([{'kind':'주택','address':'가상 주소'}]),
                  'transferReviewChecksJson':json.dumps({'dates':True})}
        req = Request(values); Handler.write_consultation(req); record_id=req.result['id']
        legacy = Request({'taxpayerName':'가상', 'consultedAt':'2026-01-02', 'expenses':'5000', 'expenseDetails':'기존 메모', 'otherTransfers':'있음'})
        Handler.write_consultation(legacy, record_id)
        with connect() as db: saved=json.loads(db.execute('SELECT data FROM consultations WHERE id=?',(record_id,)).fetchone()['data'])
        self.assertEqual(saved['expenseDetails'],'기존 메모')
        self.assertEqual(json.loads(saved['expenseItemsJson'])[0]['amount'],'5000')
        self.assertEqual(json.loads(saved['otherTransferItemsJson'])[0]['address'],'가상 주소')
        self.assertTrue(json.loads(saved['transferReviewChecksJson'])['dates'])
        self.assertEqual(saved['expensePresence'],'있음')

if __name__ == '__main__': unittest.main()
