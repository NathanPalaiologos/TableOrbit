"""Bounded, on-demand Parquet queries. Never materialize the full source table."""
import json
import pathlib
import re
import sys
import tempfile

import duckdb

PAGE_ROWS = 100
MAX_COLUMNS = 24
MAX_RESULT_BYTES = 10_000_000
MAX_EXTRACT_ROWS = 100_000


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def scan(request):
    path = pathlib.Path(request['path']).resolve(strict=True)
    if not path.is_file() or path.suffix.lower() != '.parquet' or any(c in str(path) for c in '*?[]'):
        raise ValueError('Choose a single local .parquet file, without glob characters.')
    before = path.stat()
    action = request.get('action', 'inspect')
    with tempfile.TemporaryDirectory(prefix='tableorbit-scan-') as temp:
        with duckdb.connect(config={'memory_limit': '512MB', 'threads': '1',
                                    'temp_directory': temp, 'max_temp_directory_size': '1GB',
                                    'autoinstall_known_extensions': 'false',
                                    'autoload_known_extensions': 'false'}) as db:
            schema = db.execute('DESCRIBE SELECT * FROM read_parquet(?)', [str(path)]).fetchall()
            types = {row[0]: row[1] for row in schema}
            if action == 'inspect':
                count = db.execute('SELECT num_rows FROM parquet_file_metadata(?)', [str(path)]).fetchone()[0]
                result = {'name': path.name, 'bytes': before.st_size, 'rows': str(count),
                          'engine': 'DuckDB ' + duckdb.__version__,
                          'columns': [{'name': name, 'type': kind} for name, kind in types.items()]}
            else:
                columns = request.get('columns', [])
                if not columns or len(columns) > MAX_COLUMNS or len(set(columns)) != len(columns) or any(c not in types for c in columns):
                    raise ValueError('Choose between 1 and 24 distinct columns from the schema.')
                parameters = [str(path)]
                predicates = []
                filters = request.get('filters', [])
                if not isinstance(filters, list) or len(filters) > 8:
                    raise ValueError('Use at most eight filters.')
                operators = {'eq': '=', 'ne': '<>', 'lt': '<', 'le': '<=', 'gt': '>', 'ge': '>='}
                for item in filters:
                    name, op = item.get('column'), item.get('op')
                    if name not in types:
                        raise ValueError('Unknown filter column.')
                    if op in ('null', 'notnull'):
                        predicates.append(quote(name) + (' IS NULL' if op == 'null' else ' IS NOT NULL'))
                    elif op in operators and isinstance(item.get('value'), str):
                        kind = types[name]
                        if not re.fullmatch(r'(?:U?(?:TINY|SMALL|BIG|HUGE)?INT(?:EGER)?|FLOAT|DOUBLE|DECIMAL\(\d+,\d+\)|VARCHAR|BOOLEAN|DATE|TIMESTAMP(?:_[A-Z]+)?|TIMESTAMP WITH TIME ZONE)', kind):
                            raise ValueError('This column type does not support value filters yet.')
                        predicates.append(f'{quote(name)} {operators[op]} CAST(? AS {kind})')
                        parameters.append(item['value'])
                    else:
                        raise ValueError('Unknown filter operator or invalid filter value.')
                where = ' WHERE ' + ' AND '.join(predicates) if predicates else ''
                # Casting only the output preserves native typed filter pushdown.
                projection = ', '.join(f'CAST({quote(c)} AS VARCHAR) AS {quote(c)}' for c in columns)
                base = f'SELECT {projection} FROM read_parquet(?)' + where
                if action == 'explain':
                    result = {'plan': db.execute('EXPLAIN ' + base + ' LIMIT 101', parameters).fetchall()}
                elif action in ('page', 'extract'):
                    offset = request.get('offset', 0)
                    if not isinstance(offset, int) or offset < 0 or offset > 9_007_199_254_740_991:
                        raise ValueError('Invalid row offset.')
                    limit = PAGE_ROWS if action == 'page' else min(MAX_EXTRACT_ROWS, 2_000_000 // len(columns))
                    if action == 'extract':
                        offset = 0  # Extract the complete filtered result, never the displayed page.
                    cursor = db.execute(base + ' LIMIT ? OFFSET ?', parameters + [limit + 1, offset])
                    rows, byte_count, has_more = [], 2, False
                    while True:
                        batch = cursor.fetchmany(PAGE_ROWS)
                        if not batch:
                            break
                        for row in batch:
                            if len(rows) == limit:
                                has_more = True
                                break
                            record = dict(zip(columns, row))
                            byte_count += len(json.dumps(record, ensure_ascii=False).encode('utf-8')) + 1
                            if byte_count > MAX_RESULT_BYTES:
                                raise ValueError('Result exceeds 10 MB. Select fewer columns or narrow the filters.')
                            rows.append(record)
                        if has_more:
                            break
                    if action == 'extract' and has_more:
                        raise ValueError('Filtered result is too large for the in-memory panel reader. Narrow the filters. Lazy paging remains available.')
                    result = {'columns': columns, 'rows': rows, 'offset': offset, 'hasMore': has_more,
                              'scope': 'filtered result' if filters else 'whole file',
                              'complete': action == 'extract'}
                else:
                    raise ValueError('Unknown scan action.')
    after = path.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise ValueError('File changed during the query. Reopen it before continuing.')
    return result


if __name__ == '__main__':
    try:
        print(json.dumps(scan(json.load(sys.stdin)), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False))
        sys.exit(1)
