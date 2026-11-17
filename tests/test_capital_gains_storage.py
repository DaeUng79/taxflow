import json
import unittest
from tests.test_expense_transfer_storage import ExpenseTransferStorageTest, Request
from backend.app.main import Handler
from backend.app.db import connect


class CapitalGainsStorageTest(ExpenseTransferStorageTest):
    def test_review_is_scoped_to_consultation_and_preserved_for_older_clients(self):
        review = json.dumps({'treatment': 'oneHome', 'rate': 'general', 'notes': '검토 근거'}, ensure_ascii=False)
        first = Request({'taxpayerName': '검증 A', 'consultedAt': '2026-11-14', 'capitalGainsReviewJson': review})
        Handler.write_consultation(first)
        second = Request({'taxpayerName': '검증 B', 'consultedAt': '2026-11-14'})
        Handler.write_consultation(second)
        legacy = Request({'taxpayerName': '검증 A', 'consultedAt': '2026-11-14'})
        Handler.write_consultation(legacy, first.result['id'])
        with connect() as db:
            a = json.loads(db.execute('SELECT data FROM consultations WHERE id=?', (first.result['id'],)).fetchone()['data'])
            b = json.loads(db.execute('SELECT data FROM consultations WHERE id=?', (second.result['id'],)).fetchone()['data'])
        self.assertEqual(a['capitalGainsReviewJson'], review)
        self.assertNotIn('capitalGainsReviewJson', b)


if __name__ == '__main__':
    unittest.main()
