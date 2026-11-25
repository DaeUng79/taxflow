import unittest
from app.chapters.ch02_tax_housing.regulated_areas import search


class RegulatedAreaSearchTest(unittest.TestCase):
    def test_full_history(self):
        self.assertEqual(len(search('')), 189)

    def test_release_boundary_and_redesignation(self):
        self.assertEqual(len(search('종로구', '2023-01-04')), 1)
        self.assertEqual(search('종로구', '2023-01-05'), [])
        self.assertEqual(search('종로구', '2025-10-16')[0]['start_date'], '2025-10-16')

    def test_history_and_review_details(self):
        rows = search('용인시 기흥구')
        self.assertTrue(any(row['review_required'] for row in rows))
        self.assertTrue(any(row['end_date'] == '2022-11-14' for row in rows))
        complex_row = next(row for row in search('화성시', '2022-08-01') if row['region'] == '화성시')
        self.assertTrue(complex_row['review_required'])
        self.assertIn('서신면', complex_row['notes'])
        self.assertEqual(complex_row['source_file'], 'regions.pdf')
        self.assertGreater(complex_row['source_page'], 0)

    def test_empty_and_invalid_date(self):
        self.assertEqual(search('존재하지않는지역'), [])
        with self.assertRaises(ValueError):
            search('강남구', '2023-02-30')


if __name__ == '__main__':
    unittest.main()
