"""Opt-in, read-only benchmark. Prints metrics, never source paths or row values."""
import argparse
import concurrent.futures
import json
import os
import pathlib
import subprocess
import sys
import time

import psutil
import pyarrow.parquet as pq


def query(spec):
    worker = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'scan_file.py'
    started = time.perf_counter()
    child = subprocess.Popen([sys.executable, str(worker)], stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
    process = psutil.Process(child.pid)
    peak = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        finished = pool.submit(child.communicate, json.dumps(spec).encode())
        while not finished.done():
            try:
                memory = process.memory_info()
                peak = max(peak, getattr(memory, 'peak_wset', memory.rss))
            except psutil.NoSuchProcess:
                pass
            if time.perf_counter() - started > 30:
                child.kill()
                raise TimeoutError('Benchmark query exceeded the host 30-second budget.')
            time.sleep(.02)
        output, _ = finished.result()
    result = json.loads(output)
    if child.returncode:
        raise RuntimeError('Benchmark query failed; inspect locally without publishing source contents.')
    return result, {'seconds': round(time.perf_counter() - started, 3),
                    'peak_worker_mib': round(peak / 1024**2, 1), 'response_bytes': len(output)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('path')
    parser.add_argument('--columns', nargs='+', required=True)
    parser.add_argument('--time-column', required=True)
    parser.add_argument('--year', required=True)
    args = parser.parse_args()
    metadata, opening = query({'action': 'inspect', 'path': args.path})
    snapshot = metadata['snapshot']
    base = {'snapshot': snapshot, 'columns': args.columns}
    first, first_metrics = query({**base, 'action': 'page'})
    assert len(first['rows']) == min(100, int(metadata['rows']))
    # Independent footer oracle and a bounded Arrow first batch, not a full table.
    files = snapshot['files']
    assert sum(pq.ParquetFile(f['path']).metadata.num_rows for f in files) == int(metadata['rows'])
    batch = next(pq.ParquetFile(files[0]['path']).iter_batches(batch_size=100, columns=args.columns))
    oracle = batch.to_pylist()
    for actual, expected in zip(first['rows'], oracle):
        for column in args.columns:
            value = expected[column]
            if isinstance(value, float):
                assert float(actual[column]) == value
            else:
                assert actual[column] == (None if value is None else str(value))
    offset = max(0, int(metadata['rows']) - 100)
    last, last_metrics = query({**base, 'action': 'page', 'offset': offset})
    assert len(last['rows']) == min(100, int(metadata['rows'])) and not last['hasMore']
    # Verify the final rows against the last Arrow row group (selected columns only).
    tail_file = pq.ParquetFile(files[-1]['path'])
    tail = tail_file.read_row_group(tail_file.num_row_groups - 1, columns=args.columns).to_pylist()[-100:]
    assert len(tail) == len(last['rows'])
    for actual, expected in zip(last['rows'], tail):
        for column in args.columns:
            value = expected[column]
            if isinstance(value, float):
                assert float(actual[column]) == value
            else:
                assert actual[column] == (None if value is None else str(value))
    spec = {**base, 'timeRange': {'column': args.time_column, 'start': args.year, 'end': args.year}}
    filtered, filtered_metrics = query({**spec, 'action': 'page'})
    assert filtered['rows'] and all(row[args.time_column] == args.year for row in filtered['rows'])
    plan, _ = query({**spec, 'action': 'explain'})
    plan_text = str(plan['plan'])
    assert 'READ_PARQUET' in plan_text and 'Projections:' in plan_text and args.time_column in plan_text
    assert 'Filters:' in plan_text
    print(json.dumps({'bytes': metadata['bytes'], 'rows': metadata['rows'], 'files': metadata['fileCount'],
                      'engine': metadata['engine'], 'open': opening, 'first_page': first_metrics,
                      'last_page': {**last_metrics, 'files_considered': last['filesConsidered']},
                      'time_filter': filtered_metrics, 'arrow_comparison': 'passed',
                      'native_projection_and_time_predicate': 'passed'}, indent=2))


if __name__ == '__main__':
    main()
