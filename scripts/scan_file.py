"""Bounded, on-demand Parquet queries. Never materialize the full source table."""
import json
import os
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


def discover(path):
    root = pathlib.Path(path).resolve(strict=True)
    if root.is_dir() and (root / '_delta_log').exists():
        raise ValueError('Delta tables require a transaction-log reader. Choose a plain Parquet dataset.')
    paths = []
    if root.is_dir():
        import os
        visited = set()
        for base, directories, names in os.walk(root, followlinks=False):
            resolved = pathlib.Path(base).resolve()
            if resolved in visited:
                raise ValueError('Dataset contains repeated or cyclic directories.')
            visited.add(resolved)
            if '_delta_log' in directories:
                raise ValueError('Dataset contains a Delta table. Choose a plain Parquet dataset.')
            for name in directories:
                folder = pathlib.Path(base, name)
                if folder.is_symlink() or not folder.resolve().is_relative_to(root):
                    raise ValueError('Dataset must not contain linked folders.')
            directories.sort()
            for name in sorted(names):
                candidate = pathlib.Path(base, name)
                if candidate.suffix.lower() == '.parquet':
                    if candidate.is_symlink():
                        raise ValueError('Dataset must not contain linked Parquet files.')
                    paths.append(candidate.resolve(strict=True))
                    if len(paths) > 1024:
                        raise ValueError('Choose a dataset containing at most 1,024 Parquet files.')
    else:
        paths = [root]
    if not paths:
        raise ValueError('No Parquet files in this folder.')
    files = []
    for path in sorted(paths):
        if not path.is_file() or path.suffix.lower() != '.parquet' or any(c in str(path) for c in '*?[]'):
            raise ValueError('Choose a local Parquet file or dataset folder without glob characters.')
        stat = path.stat()
        files.append({'path': str(path), 'size': stat.st_size, 'mtime': str(stat.st_mtime_ns)})
    return {'name': root.name, 'files': files}


def unchanged(snapshot):
    for item in snapshot['files']:
        stat = pathlib.Path(item['path']).stat()
        if stat.st_size != item['size'] or str(stat.st_mtime_ns) != item['mtime']:
            raise ValueError('Dataset changed. Reopen it before continuing.')


def page_files(files, offset, limit):
    """Skip whole files using footer counts, without scanning their data pages."""
    selected, remaining = [], limit
    for item in files:
        count = int(item['rows'])
        if not selected and offset >= count:
            offset -= count
            continue
        selected.append(item['path'])
        remaining -= count - (offset if len(selected) == 1 else 0)
        if remaining <= 0:
            break
    return selected, offset


def connect(temp):
    return duckdb.connect(config={'memory_limit': '512MB', 'threads': '1',
        'temp_directory': temp, 'max_temp_directory_size': '1GB',
        'autoinstall_known_extensions': 'false', 'autoload_known_extensions': 'false'})


def scan(request, db=None):
    if db is None:
        with tempfile.TemporaryDirectory(prefix='tableorbit-scan-') as temp:
            with connect(temp) as connection:
                return scan(request, connection)
    action = request.get('action', 'inspect')
    snapshot = request.get('snapshot') or discover(request['path'])
    unchanged(snapshot)
    paths = [item['path'] for item in snapshot['files']]
    source = 'read_parquet(?, hive_types_autocast=false)'
    if 'columns' not in snapshot:
        physical = None
        for item in snapshot['files']:
            schema = db.execute('DESCRIBE SELECT * FROM read_parquet(?, hive_partitioning=false)', [item['path']]).fetchall()
            signature = [(r[0], r[1]) for r in schema]
            if physical is not None and signature != physical:
                raise ValueError('Parquet schemas differ. Select one coherent dataset; automatic schema coercion is disabled.')
            physical = signature
            item['rows'] = str(db.execute('SELECT num_rows FROM parquet_file_metadata(?)', [item['path']]).fetchone()[0])
        schema = db.execute('DESCRIBE SELECT * FROM ' + source, [paths]).fetchall()
        snapshot['columns'] = [{'name': r[0], 'type': r[1]} for r in schema]
    types = {c['name']: c['type'] for c in snapshot['columns']}
    if action == 'inspect':
        result = {'name': snapshot['name'], 'bytes': sum(f['size'] for f in snapshot['files']),
                  'rows': str(sum(int(f['rows']) for f in snapshot['files'])),
                  'fileCount': len(paths), 'engine': 'DuckDB ' + duckdb.__version__,
                  'columns': snapshot['columns'], 'snapshot': snapshot}
    else:
        columns = request.get('columns', [])
        if not columns or len(columns) > MAX_COLUMNS or len(set(columns)) != len(columns) or any(c not in types for c in columns):
            raise ValueError('Choose between 1 and 24 distinct columns from the schema.')
        parameters = [paths]
        predicates = []
        filters = request.get('filters', [])
        if not isinstance(filters, list) or len(filters) > 8:
            raise ValueError('Use at most eight filters.')
        filters = list(filters)
        time_range = request.get('timeRange')
        if time_range:
            for key, op in [('start', 'ge'), ('end', 'le')]:
                value = time_range.get(key, '')
                if value:
                    filters.append({'column': time_range.get('column'), 'op': op, 'value': value})
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
        base = f'SELECT {projection} FROM {source}' + where
        if action == 'explain':
            result = {'plan': db.execute('EXPLAIN ' + base + ' LIMIT 101', parameters).fetchall()}
        elif action in ('page', 'extract'):
            offset = request.get('offset', 0)
            if not isinstance(offset, int) or offset < 0 or offset > 9_007_199_254_740_991:
                raise ValueError('Invalid row offset.')
            limit = PAGE_ROWS if action == 'page' else min(MAX_EXTRACT_ROWS, 2_000_000 // len(columns))
            if action == 'extract':
                offset = 0  # Extract the complete filtered result, never the displayed page.
            query_offset = offset
            if action == 'page' and not filters:
                selected, query_offset = page_files(snapshot['files'], offset, limit + 1)
                if not selected:
                    return {'columns': columns, 'rows': [], 'offset': offset, 'hasMore': False, 'scope': 'whole dataset', 'complete': False, 'filesConsidered': 0}
                parameters[0] = selected
            cursor = db.execute(base + ' LIMIT ? OFFSET ?', parameters + [limit + 1, query_offset])
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
                      'complete': action == 'extract', 'filesConsidered': len(parameters[0])}
        elif action in ('axes', 'panel', 'summary', 'figure-data'):
            from lazy_queries import analyze
            result = analyze(db, request, snapshot, types, source, where, parameters)
        else:
            raise ValueError('Unknown scan action.')
    unchanged(snapshot)
    return result


def respond(request, db):
    import os
    import time
    started = time.perf_counter()
    result = scan(request, db)
    result['metrics'] = {'workerPid': os.getpid(), 'queryMs': round((time.perf_counter()-started)*1000, 3)}
    return result


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    with tempfile.TemporaryDirectory(prefix='query-', dir=os.environ.get('TABLEORBIT_WORKER_TEMP')) as temp:
        with connect(temp) as db:
            if '--worker' in sys.argv:
                for line in sys.stdin:
                    try:
                        result = respond(json.loads(line), db)
                        print(json.dumps(result, ensure_ascii=False, allow_nan=False), flush=True)
                    except Exception as error:
                        print(json.dumps({'error': str(error)}), flush=True)
            else:
                try:
                    print(json.dumps(respond(json.load(sys.stdin), db), ensure_ascii=False, allow_nan=False))
                except Exception as error:
                    print(json.dumps({'error': str(error)}))
                    sys.exit(1)
