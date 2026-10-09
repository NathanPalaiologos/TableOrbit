"""Small, bounded checks for query semantics and Parquet pushdown."""
import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

import duckdb

module_path = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'scan_file.py'
spec = importlib.util.spec_from_file_location('scan_file', module_path)
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


class ScanTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='tableorbit-scan-test-')
        cls.file = pathlib.Path(cls.temp.name).resolve() / 'sample.parquet'
        with duckdb.connect() as db:
            db.execute("""COPY (SELECT i AS id, 2020 + i // 1000 AS year,
                (9007199254740993 + i)::BIGINT AS large_id,
                123456789.123456789::DECIMAL(25,9) AS amount,
                CASE WHEN i % 2 = 0 THEN NULL ELSE '中文' END AS label,
                repeat('payload', 100) AS unused FROM range(4000) r(i))
                TO ? (FORMAT PARQUET, ROW_GROUP_SIZE 2048)""", [str(cls.file)])

    @classmethod
    def tearDownClass(cls):
        # Only this test's newly created, resolved temporary directory is removed.
        assert cls.file.parent == pathlib.Path(cls.temp.name).resolve()
        cls.temp.cleanup()

    def scan(self, action, **kwargs):
        return engine.scan({'action': action, 'path': str(self.file), **kwargs})

    def test_metadata_and_bounded_pages(self):
        metadata = self.scan('inspect')
        self.assertEqual(metadata['rows'], '4000')
        page = self.scan('page', columns=['id', 'large_id', 'amount', 'label'], offset=100)
        self.assertEqual(len(page['rows']), 100)
        self.assertTrue(page['hasMore'])
        self.assertEqual(page['rows'][0]['id'], '100')
        self.assertEqual(page['rows'][0]['large_id'], '9007199254741093')
        self.assertEqual(page['rows'][0]['amount'], '123456789.123456789')
        self.assertIsNone(page['rows'][0]['label'])
        self.assertEqual(page['rows'][1]['label'], '中文')

    def test_filters_and_complete_extraction(self):
        filters = [{'column': 'id', 'op': 'ge', 'value': '3990'}]
        page = self.scan('page', columns=['id'], filters=filters)
        self.assertEqual(len(page['rows']), 10)
        self.assertFalse(page['hasMore'])
        result = self.scan('extract', columns=['id'], filters=filters, offset=3999)
        self.assertEqual(len(result['rows']), 10)
        self.assertTrue(result['complete'])

    def test_page_boundaries_and_result_budget(self):
        last = self.scan('page', columns=['id'], offset=3999)
        self.assertEqual(last['rows'], [{'id': '3999'}])
        self.assertFalse(last['hasMore'])
        self.assertEqual(self.scan('page', columns=['id'], offset=4000)['rows'], [])
        # Exercise the byte guard with a small fixture instead of allocating 10 MB.
        with patch.object(engine, 'MAX_RESULT_BYTES', 1000):
            with self.assertRaisesRegex(ValueError, 'exceeds 10 MB'):
                self.scan('extract', columns=['unused'])
        with patch.object(engine, 'MAX_EXTRACT_ROWS', 10):
            with self.assertRaisesRegex(ValueError, 'too large'):
                self.scan('extract', columns=['id'])

    def test_null_and_decimal_filters(self):
        result = self.scan('page', columns=['id'], filters=[
            {'column': 'label', 'op': 'null'},
            {'column': 'amount', 'op': 'eq', 'value': '123456789.123456789'}])
        self.assertEqual(result['rows'][:2], [{'id': '0'}, {'id': '2'}])

    def test_projection_and_predicate_are_in_scan_plan(self):
        result = self.scan('explain', columns=['id'], filters=[{'column': 'year', 'op': 'eq', 'value': '2023'}])
        plan = str(result['plan'])
        self.assertIn('READ_PARQUET', plan)
        self.assertIn('Projections: id', plan)
        self.assertIn('year=2023', plan)
        self.assertNotIn('unused', plan)

    def test_untrusted_identifiers_and_values_are_not_sql(self):
        with self.assertRaises(ValueError):
            self.scan('page', columns=['id; DROP TABLE x'])
        result = self.scan('page', columns=['id'], filters=[{'column': 'label', 'op': 'eq', 'value': "' OR 1=1 --"}])
        self.assertEqual(result['rows'], [])
        with self.assertRaises(Exception):
            self.scan('page', columns=['id'], filters=[{'column': 'id', 'op': 'eq', 'value': 'not a number'}])


if __name__ == '__main__':
    unittest.main()
