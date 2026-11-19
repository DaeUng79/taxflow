import json
from tests.test_expense_transfer_storage import ExpenseTransferStorageTest, Request
from backend.app.main import Handler
from backend.app.db import connect


class FilingStorageTest(ExpenseTransferStorageTest):
    def test_filing_is_per_record_and_survives_older_client(self):
        draft = json.dumps({'version': 1, 'fields': {'buyerName': '가상 양수인'}, 'expenses': {}}, ensure_ascii=False)
        first = Request({'taxpayerName': '가상 A', 'consultedAt': '2026-11-15', 'filingDraftJson': draft})
        Handler.write_consultation(first)
        second = Request({'taxpayerName': '가상 B', 'consultedAt': '2026-11-15'})
        Handler.write_consultation(second)
        Handler.write_consultation(Request({'taxpayerName': '가상 A', 'consultedAt': '2026-11-15'}), first.result['id'])
        with connect() as db:
            a = json.loads(db.execute('SELECT data FROM consultations WHERE id=?', (first.result['id'],)).fetchone()['data'])
            b = json.loads(db.execute('SELECT data FROM consultations WHERE id=?', (second.result['id'],)).fetchone()['data'])
        self.assertEqual(a['filingDraftJson'], draft)
        self.assertNotIn('filingDraftJson', b)

    def test_buyer_fields_survive_older_client(self):
        data = {'taxpayerName': '가상 A', 'consultedAt': '2026-11-17', 'buyerName': '가상 매수인', 'buyerId': '식별번호', 'buyerRelationship': '타인'}
        first = Request(data)
        Handler.write_consultation(first)
        Handler.write_consultation(Request({'taxpayerName': '가상 A', 'consultedAt': '2026-11-17'}), first.result['id'])
        with connect() as db:
            saved = json.loads(db.execute('SELECT data FROM consultations WHERE id=?', (first.result['id'],)).fetchone()['data'])
        for key in ('buyerName', 'buyerId', 'buyerRelationship'):
            self.assertEqual(saved[key], data[key])

    def test_taxpayer_id_and_residency_persist_and_legacy_updates_keep_id(self):
        data = {'taxpayerName': '가상 A', 'consultedAt': '2026-01-01', 'resident': '예', 'taxpayerId': '900101-1234567'}
        first = Request(data)
        Handler.write_consultation(first)
        Handler.write_consultation(Request({'taxpayerName': '가상 A', 'consultedAt': '2026-01-02', 'resident': '아니요'}), first.result['id'])
        with connect() as db:
            saved = json.loads(db.execute('SELECT data FROM consultations WHERE id=?', (first.result['id'],)).fetchone()['data'])
        self.assertEqual(saved['taxpayerId'], data['taxpayerId'])
        self.assertEqual(saved['resident'], '아니요')
