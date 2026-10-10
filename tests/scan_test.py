"""Small, bounded checks for query semantics and Parquet pushdown."""
import importlib.util
import pathlib
import tempfile
import sys
import unittest
from unittest.mock import patch

import duckdb

module_path = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'scan_file.py'
sys.path.insert(0, str(module_path.parent))
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

    def test_partitioned_folder_and_time_pruning(self):
        root = pathlib.Path(self.temp.name) / 'partitioned'
        with duckdb.connect() as db:
            for year in [2020, 2021]:
                folder = root / 'region=001' / f'year={year}'
                folder.mkdir(parents=True, exist_ok=True)
                db.execute('COPY (SELECT i AS id FROM range(6) r(i)) TO ? (FORMAT PARQUET)', [str(folder / 'part.parquet')])
        meta = engine.scan({'path': str(root), 'action': 'inspect'})
        self.assertEqual((meta['rows'], meta['fileCount']), ('12', 2))
        base = {'snapshot': meta['snapshot'], 'columns': ['id', 'year', 'region']}
        page = engine.scan({**base, 'action': 'page', 'offset': 5})
        self.assertEqual(len(page['rows']), 7)
        self.assertEqual(page['rows'][0]['region'], '001')
        self.assertEqual(page['rows'][1]['year'], '2021')
        last = engine.scan({**base, 'action': 'page', 'offset': 6})
        self.assertEqual(last['filesConsidered'], 1)
        time_range = {'column': 'year', 'start': '2021', 'end': '2021'}
        filtered = engine.scan({**base, 'action': 'page', 'timeRange': time_range})
        self.assertEqual(len(filtered['rows']), 6)
        plan = str(engine.scan({**base, 'action': 'explain', 'timeRange': time_range})['plan'])
        self.assertIn('File Filters:', plan)
        self.assertIn('Scanning Files: 1/2', plan)

    def test_folder_schema_mismatch_and_changed_snapshot_are_rejected(self):
        root = pathlib.Path(self.temp.name) / 'mismatched'
        root.mkdir()
        with duckdb.connect() as db:
            db.execute('COPY (SELECT 1 AS id) TO ? (FORMAT PARQUET)', [str(root / 'a.parquet')])
            db.execute("COPY (SELECT '1' AS id) TO ? (FORMAT PARQUET)", [str(root / 'b.parquet')])
        with self.assertRaisesRegex(ValueError, 'schemas differ'):
            engine.scan({'action': 'inspect', 'path': str(root)})
        meta = self.scan('inspect')
        meta['snapshot']['files'][0]['size'] += 1
        with self.assertRaisesRegex(ValueError, 'Dataset changed'):
            engine.scan({'action': 'page', 'snapshot': meta['snapshot'], 'columns': ['id']})

    def test_native_date_range_and_delta_root_rejection(self):
        root = pathlib.Path(self.temp.name) / 'dates'
        root.mkdir()
        file = root / 'dates.parquet'
        with duckdb.connect() as db:
            db.execute("COPY (SELECT DATE '2020-01-01' + i::INTEGER AS day FROM range(3) r(i)) TO ? (FORMAT PARQUET)", [str(file)])
        result = engine.scan({'action': 'page', 'path': str(file), 'columns': ['day'],
                              'timeRange': {'column': 'day', 'start': '2020-01-02', 'end': '2020-01-02'}})
        self.assertEqual(result['rows'], [{'day': '2020-01-02'}])
        (root / '_delta_log').mkdir()
        with self.assertRaisesRegex(ValueError, 'Delta'):
            engine.scan({'action': 'inspect', 'path': str(root)})

    def test_hidden_subfolder_is_not_silently_excluded(self):
        root = pathlib.Path(self.temp.name) / 'hidden-parts'
        hidden = root / '.part'
        hidden.mkdir(parents=True)
        with duckdb.connect() as db:
            db.execute('COPY (SELECT 1 AS id) TO ? (FORMAT PARQUET)', [str(hidden / 'part.parquet')])
        result = engine.scan({'action': 'inspect', 'path': str(root)})
        self.assertEqual((result['rows'], result['fileCount']), ('1', 1))

    def test_projection_and_predicate_are_in_scan_plan(self):
        result = self.scan('explain', columns=['id'], filters=[{'column': 'year', 'op': 'eq', 'value': '2023'}])
        plan = str(result['plan'])
        self.assertIn('READ_PARQUET', plan)
        self.assertIn('Projections: id', plan)
        self.assertIn('year=2023', plan)
        self.assertNotIn('unused', plan)

    def test_lazy_panel_summary_and_figure_scope(self):
        file = pathlib.Path(self.temp.name) / 'panel.parquet'
        with duckdb.connect() as db:
            db.execute("COPY (SELECT * FROM (VALUES ('a',2020,0.0),('a',2021,NULL),('b',2020,4.0)) t(firm,year,value)) TO ? (FORMAT PARQUET)", [str(file)])
        base = {'path':str(file),'columns':['value'],'entity':'firm','time':'year'}
        axes = engine.scan({**base,'action':'axes'})
        self.assertEqual((axes['records'],axes['entities'],axes['times'],axes['absent']), ('3','2',['2020','2021'],'1'))
        cross = engine.scan({**base,'action':'panel','period':'2021'})
        self.assertEqual(cross['rows'], [['a',None],['b',None]])
        self.assertEqual(cross['present'], [[True],[False]])
        series = engine.scan({**base,'action':'panel','view':'series','variable':'value'})
        self.assertEqual(series['rows'], [['a','0.0',None],['b','4.0',None]])
        stats = engine.scan({**base,'action':'summary','offset':1000})['rows'][0]
        self.assertEqual((stats['n'],stats['missing'],stats['absent']), ('2','1','1'))
        self.assertAlmostEqual(float(stats['mean']), 2)
        self.assertAlmostEqual(float(stats['sd']), 8**.5)
        self.assertEqual(float(stats['q25']), 1)
        self.assertEqual(float(stats['q75']), 3)
        figure = engine.scan({**base,'action':'figure-data','variable':'value','aggregation':'mean'})
        self.assertEqual([p['y'] for p in figure['series'][0]['points']], [2,None])
        self.assertEqual(figure['metadata']['inputCount'],2)
        raw = engine.scan({**base,'action':'figure-data','variable':'value','aggregation':'none','figureEntity':'b'})
        self.assertEqual([p['y'] for p in raw['series'][0]['points']], [4,None])
        narrowed = engine.scan({**base,'action':'summary','timeRange':{'column':'year','start':'2021','end':'2021'}})['rows'][0]
        self.assertEqual((narrowed['n'],narrowed['missing'],narrowed['absent']), ('0','1','0'))

    def test_float_entity_keys_use_source_text(self):
        file = pathlib.Path(self.temp.name) / 'float-keys.parquet'
        with duckdb.connect() as db:
            db.execute("COPY (SELECT 0.1::FLOAT AS id, 2020 AS year, 7 AS value) TO ? (FORMAT PARQUET)", [str(file)])
        base = {'path':str(file), 'columns':['value'], 'entity':'id', 'time':'year'}
        result = engine.scan({**base, 'action':'panel', 'period':'2020'})
        self.assertEqual(result['rows'], [['0.1','7']])
        self.assertEqual(result['present'], [[True]])

    def test_large_integer_measure_guard(self):
        with self.assertRaisesRegex(ValueError, 'safe statistical precision'):
            self.scan('summary',columns=['large_id'])
        with self.assertRaisesRegex(ValueError, 'safe plot precision'):
            self.scan('figure-data',columns=['large_id'],time='year',variable='large_id')

    def test_duplicate_keys_rejected_but_record_summary_available(self):
        base={'columns':['amount'],'entity':'label','time':'year'}
        with self.assertRaisesRegex(ValueError, 'cannot be missing'):
            self.scan('axes', **base)
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            self.scan('axes', **base, filters=[{'column':'label','op':'notnull'}])
        summary=self.scan('summary',columns=['amount'])
        self.assertEqual(summary['rows'][0]['n'],'4000')
        self.assertIsNone(summary['rows'][0]['absent'])

    def test_lazy_calendar_figures_and_unknown_columns(self):
        file=pathlib.Path(self.temp.name)/'calendar.parquet'
        with duckdb.connect() as db:
            db.execute("COPY (SELECT '001' AS id, DATE '2020-01-01' AS day, 2 AS value) TO ? (FORMAT PARQUET)",[str(file)])
        base={'path':str(file),'columns':['value'],'entity':'id','time':'day','variable':'value'}
        figure=engine.scan({**base,'action':'figure-data'})
        self.assertEqual(figure['series'][0]['points'][0]['x'],1577836800000)
        with self.assertRaises(ValueError):engine.scan({**base,'action':'panel','period':"' OR true --"})
        with self.assertRaises(ValueError):engine.scan({**base,'action':'panel','period':'2020-01-01','offset':-1})

    def test_untrusted_identifiers_and_values_are_not_sql(self):
        with self.assertRaises(ValueError):
            self.scan('page', columns=['id; DROP TABLE x'])
        result = self.scan('page', columns=['id'], filters=[{'column': 'label', 'op': 'eq', 'value': "' OR 1=1 --"}])
        self.assertEqual(result['rows'], [])
        with self.assertRaises(Exception):
            self.scan('page', columns=['id'], filters=[{'column': 'id', 'op': 'eq', 'value': 'not a number'}])


if __name__ == '__main__':
    unittest.main()
