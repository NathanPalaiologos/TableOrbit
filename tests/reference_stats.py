"""Independent pandas oracle for the bundled real-data stress checks. No downloads."""
from pathlib import Path
import hashlib
import json
import pandas as pd

root = Path(__file__).resolve().parents[1]
result = {}
for name, keys in [('diamonds', []), ('nlswork', ['idcode', 'year']), ('co2', ['date'])]:
    path = root / 'web' / 'data' / f'{name}.csv'
    frame = pd.read_csv(path)
    measures = frame.select_dtypes('number').columns.difference(keys, sort=False)
    if name == 'nlswork':
        assert not frame.duplicated(keys).any()
        entities, times = frame.idcode.nunique(), frame.year.nunique()
    else:
        entities, times = (len(frame), 1) if name == 'diamonds' else (1, len(frame))
    stats = []
    for column in measures:
        values = frame[column].dropna()
        stats.append(dict(variable=column, n=len(values), missing=int(frame[column].isna().sum()),
                          absent=entities*times-len(frame), mean=float(values.mean()), sd=float(values.std(ddof=1)),
                          min=float(values.min()), q25=float(values.quantile(.25)), median=float(values.median()),
                          q75=float(values.quantile(.75)), max=float(values.max())))
    result[name] = dict(rows=len(frame), entities=int(entities), times=int(times), stats=stats,
                        sha256=hashlib.sha256(path.read_bytes()).hexdigest())
(root/'tests/fixtures/real-data-reference.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print({name:{k:v for k,v in entry.items() if k not in ('stats','sha256')} for name,entry in result.items()})
