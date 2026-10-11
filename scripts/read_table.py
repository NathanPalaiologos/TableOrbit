"""Bounded import for local spreadsheets, Arrow files and Stata files."""
import datetime
import json
import math
from pathlib import Path
import sys
from contextlib import ExitStack

MAX_ROWS=100_000
MAX_CELLS=2_000_000
MAX_BYTES=10_000_000

def text(value):
    if value is None or isinstance(value,float) and math.isnan(value):return ''
    if isinstance(value,(datetime.date,datetime.datetime,datetime.time)):return value.isoformat()
    if isinstance(value,bool):return 'true' if value else 'false'
    if isinstance(value,(dict,list)):return json.dumps(value,ensure_ascii=False,default=str)
    return str(value)

def read_table(path, sheet=None):
    path=str(path)
    suffix=Path(path).suffix.lower()
    sheets=[]
    cleanup=ExitStack()
    try:
        if suffix in ('.xlsx','.xlsm'):
            try:import openpyxl
            except ImportError:raise ValueError('Excel needs openpyxl in the configured Python environment.') from None
            resource=openpyxl.load_workbook(path,read_only=True,data_only=True,keep_links=False)
            cleanup.callback(resource.close)
            sheets=resource.sheetnames
            sheet=sheet or sheets[0]
            if sheet not in sheets:raise ValueError('Worksheet not found. Reopen the workbook.')
            rows=resource[sheet].iter_rows(values_only=True)
            headers=[text(v).strip() for v in next(rows,())]
            if not headers:return {'table':{'headers':[],'rows':[]},'sheets':sheets,'sheet':sheet}
        elif suffix in ('.feather','.arrow','.ipc'):
            try:import pyarrow as pa
            except ImportError:raise ValueError('Arrow files need pyarrow in the configured Python environment.') from None
            resource=cleanup.enter_context(pa.memory_map(path,'r'))
            try:
                reader=pa.ipc.open_file(resource)
                batches=(reader.get_batch(i) for i in range(reader.num_record_batches))
            except pa.ArrowInvalid:
                resource.seek(0);reader=pa.ipc.open_stream(resource);batches=iter(reader)
            headers=reader.schema.names
            def arrow_rows():
                for batch in batches:
                    if batch.num_rows>MAX_ROWS or batch.nbytes>MAX_BYTES:raise ValueError('Arrow batch exceeds the import limit. Export a selected subset to Parquet.')
                    for row in batch.to_pylist():yield [row[c] for c in headers]
            rows=arrow_rows()
        elif suffix=='.dta':
            try:import pandas as pd
            except ImportError:raise ValueError('Stata files need pandas in the configured Python environment.') from None
            resource=cleanup.enter_context(pd.read_stata(path,iterator=True,chunksize=1000,convert_categoricals=False,preserve_dtypes=True))
            first=resource.read(1)
            headers=list(first.columns)
            def stata_rows():
                yield from first.itertuples(index=False,name=None)
                for chunk in resource:yield from chunk.itertuples(index=False,name=None)
            rows=stata_rows()
        else:raise ValueError('Supported binary imports: XLSX, XLSM, Feather/Arrow IPC and DTA.')
        if not headers or any(not h for h in headers) or len(set(headers))!=len(headers):
            raise ValueError('The first row must contain nonempty, unique column names.')
        records=[];size=0
        for row in rows:
            if len(records)>=MAX_ROWS or (len(records)+1)*len(headers)>MAX_CELLS:raise ValueError('Import exceeds 100,000 rows or 2,000,000 cells. Export a subset to Parquet.')
            record=dict(zip(headers,map(text,row)))
            size+=len(json.dumps(record,ensure_ascii=False).encode('utf-8'))
            if size>MAX_BYTES:raise ValueError('Imported values exceed 10 MB. Export a selected subset to Parquet.')
            records.append(record)
        return {'table':{'headers':headers,'rows':records},'sheets':sheets,'sheet':sheet}
    finally:
        cleanup.close()

if __name__=='__main__':
    try:
        request=json.load(sys.stdin)
        print(json.dumps(read_table(request['path'],request.get('sheet')),ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error':str(error)},ensure_ascii=False))
