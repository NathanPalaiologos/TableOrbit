"""Queries return bounded tables or plot coordinates, never a source-sized frame."""
import datetime
import json
import math
import re
from collections import OrderedDict

AUDITS = OrderedDict()
ENTITY_PAGES = OrderedDict()
NUMERIC = re.compile(r'(?:U?(?:TINY|SMALL|BIG|HUGE)?INT(?:EGER)?|FLOAT|DOUBLE|DECIMAL\(\d+,\d+\))')
METHODS = {'mean':'avg', 'median':'median', 'sum':'sum', 'min':'min', 'max':'max', 'sd':'stddev_samp', 'count':'count'}


def q(name):
    return '"' + name.replace('"', '""') + '"'


def integer(request, key, maximum=9_007_199_254_740_991):
    value = request.get(key, 0)
    if type(value) is not int or not 0 <= value <= maximum:
        raise ValueError('Invalid page offset.')
    return value


def analyze(db, request, snapshot, types, source, where, params):
    action = request['action']
    entity, time = request.get('entity'), request.get('time')
    columns = request['columns']
    measures = [c for c in columns if c not in (entity, time)]
    if not measures or any(not NUMERIC.fullmatch(types[c]) for c in measures):
        raise ValueError('Select numeric measure columns, excluding the entity and time keys.')
    relation = source + where
    # Only scalar results and bounded axis dictionaries are retained in this cache.
    audit = None
    if entity or action in ('axes', 'panel'):
        if entity not in types or time not in types or entity == time:
            raise ValueError('Choose different entity and time columns.')
        if types[entity] not in ('VARCHAR', 'UUID') and not NUMERIC.fullmatch(types[entity]):
            raise ValueError('Entity keys must be text, UUID or numeric values.')
        if not (NUMERIC.fullmatch(types[time]) or types[time] in ('VARCHAR','DATE') or types[time].startswith('TIMESTAMP')):
            raise ValueError('Unsupported time key type.')
        key = json.dumps([snapshot, entity, time, request.get('filters'), request.get('timeRange')], sort_keys=True)
        if key not in AUDITS:
            e, t = q(entity), q(time)
            counts = db.execute(f'SELECT count(*), count(DISTINCT {e}), count(DISTINCT {t}), count(*) FILTER (WHERE {e} IS NULL OR {t} IS NULL) FROM {relation}', params).fetchone()
            if not counts[0]:
                raise ValueError('The selection contains no rows.')
            if counts[3]:
                raise ValueError('Entity and time keys cannot be missing.')
            repeated = db.execute(f'SELECT 1 FROM {relation} GROUP BY {e}, {t} HAVING count(*)>1 LIMIT 1', params).fetchone()
            if repeated:
                raise ValueError('Duplicate entity/time keys. Choose the correct keys or narrow the filters. No rows were combined.')
            if counts[2] > 4096:
                raise ValueError('More than 4,096 periods. Narrow the time range.')
            times = [r[0] for r in db.execute(f'SELECT DISTINCT CAST({t} AS VARCHAR), {t} FROM {relation} ORDER BY {t}', params).fetchall()]
            AUDITS[key] = {'records':str(counts[0]), 'entities':str(counts[1]), 'times':times,
                          'absent':str(counts[1]*counts[2]-counts[0]), 'keysUnique':True}
            while len(AUDITS)>8:
                AUDITS.popitem(last=False)
        audit = AUDITS[key]
    if action == 'axes':
        return {**audit, 'measures':measures}
    if action == 'summary':
        expressions = []
        for c in measures:
            v = q(c)
            expressions.extend([f'count({v})', f'count(*)-count({v})', f'avg({v})', f'stddev_samp({v})',
                                f'min({v})', f'quantile_cont({v}, [.25, .5, .75])', f'max({v})'])
        values = db.execute('SELECT '+', '.join(expressions)+' FROM '+relation, params).fetchone()
        rows = []
        for i, c in enumerate(measures):
            n, missing, mean, sd, minimum, quartiles, maximum = values[i*7:i*7+7]
            if 'INT' in types[c] and any(v is not None and abs(v)>9_007_199_254_740_991 for v in (minimum,maximum)):
                raise ValueError('Integer measure exceeds safe statistical precision. Deselect the ID column or use it as an entity key.')
            quartiles = quartiles or [None, None, None]
            row = dict(zip(['n','missing','mean','sd','min','q25','median','q75','max'], [n,missing,mean,sd,minimum,*quartiles,maximum]))
            if any(isinstance(v,float) and not math.isfinite(v) for v in row.values()):
                raise ValueError('Summary contains nonfinite values. Filter these values before summarizing.')
            rows.append({'variable':c, **{k:None if v is None else str(v) for k,v in row.items()},
                         'absent':audit['absent'] if audit else None})
        return {'columns':['variable','n','missing','absent','mean','sd','min','q25','median','q75','max'],
                'rows':rows, 'scope':'all filtered source records', 'keyAudit':audit, 'hasMore':False}
    if action == 'panel':
        offset = integer(request, 'offset')
        time_offset = integer(request, 'timeOffset')
        e, t = q(entity), q(time)
        page_key = (key, offset)
        if page_key not in ENTITY_PAGES:
            ENTITY_PAGES[page_key] = db.execute(f'SELECT DISTINCT {e}, CAST({e} AS VARCHAR) FROM {relation} ORDER BY {e} LIMIT 101 OFFSET ?', params+[offset]).fetchall()
            while len(ENTITY_PAGES)>8:
                ENTITY_PAGES.popitem(last=False)
        entities = ENTITY_PAGES[page_key]
        names = [text for native, text in entities[:100]]
        if request.get('view') == 'series':
            variable = request.get('variable')
            if variable not in measures:
                raise ValueError('Choose a selected numeric variable.')
            periods = audit['times'][time_offset:time_offset+24]
            visible = periods
            values = [variable]
        else:
            period = request.get('period')
            if period not in audit['times']:
                raise ValueError('Choose a period from the filtered source.')
            periods, visible, values = [period], measures, measures
        rows = [[name]+[None]*len(visible) for name in names]
        present = [[False]*len(visible) for _ in names]
        if names and periods:
            conditions = ' AND ' if where else ' WHERE '
            entity_marks = ','.join('?' for _ in names)
            time_marks = ','.join(f'CAST(? AS {types[time]})' for _ in periods)
            projection = ', '.join(f'CAST({q(c)} AS VARCHAR)' for c in [entity,time]+values)
            result = db.execute(f'SELECT {projection} FROM {relation}{conditions}{e} IN ({entity_marks}) AND {t} IN ({time_marks})',
                                params+[native for native, text in entities[:100]]+periods).fetchall()
            indexes = {name:i for i,name in enumerate(names)}
            for record in result:
                row = indexes[record[0]]
                if request.get('view') == 'series':
                    col = periods.index(record[1]); rows[row][col+1]=record[2]; present[row][col]=True
                else:
                    rows[row][1:]=record[2:]; present[row]=[True]*len(values)
        return {'columns':[entity]+visible, 'rows':rows, 'present':present, 'hasMore':len(entities)>100,
                'offset':offset, 'keyAudit':audit, 'scope':'filtered source panel', 'timeHasMore':time_offset+24<len(audit['times'])}
    if action == 'figure-data':
        variable = request.get('variable')
        if variable not in measures:
            raise ValueError('Choose a selected numeric variable.')
        if time not in types:
            raise ValueError('Choose a time column for the figure.')
        method = request.get('aggregation', 'mean')
        if method not in METHODS and method != 'none':
            raise ValueError('Unknown aggregation.')
        plot = request.get('plot', 'line')
        if plot not in ('line','bar'):
            raise ValueError('Lazy figures currently support time-series lines and bars.')
        v, t = q(variable), q(time)
        if 'INT' in types[variable]:
            bounds = db.execute(f'SELECT min({v}), max({v}) FROM {relation}', params).fetchone()
            if any(value is not None and abs(value)>9_007_199_254_740_991 for value in bounds):
                raise ValueError('Integer measure exceeds safe plot precision. Choose another variable.')
        predicate = ''
        query_params = list(params)
        if method == 'none':
            if not audit or not isinstance(request.get('figureEntity'), str) or not request['figureEntity']:
                raise ValueError('Enter one entity ID for a raw time series.')
            predicate = (' AND ' if where else ' WHERE ')+f'{q(entity)}=CAST(? AS {types[entity]})'
            query_params.append(request['figureEntity'])
            expression, n = v, f'CASE WHEN {v} IS NULL THEN 0 ELSE 1 END'
            group = ''
        else:
            expression, n = f'{METHODS[method]}({v})', f'count({v})'
            group = f' GROUP BY {t}'
        limit = 40 if plot == 'bar' else 4096
        result = db.execute(f'SELECT CAST({t} AS VARCHAR), {expression}, {n} FROM {relation}{predicate}{group} ORDER BY {t} LIMIT ?', query_params+[limit+1]).fetchall()
        if len(result)>limit:
            raise ValueError(f'Figure exceeds {limit} periods. Narrow the time range.')
        if not result:
            raise ValueError('No observed values in this selection.')
        # Raw entity lines include absent periods as gaps within the filtered axis.
        if method == 'none':
            mapped = {r[0]:r for r in result}
            result = [mapped.get(period, (period,None,0)) for period in audit['times']]
            if len(result)>limit:
                raise ValueError(f'Figure exceeds {limit} periods. Narrow the time range.')
        calendar = not NUMERIC.fullmatch(types[time])
        points = []
        for period, value, count in result:
            if period is None:
                raise ValueError('Figure time values cannot be missing. Add an IS NOT NULL filter to the time column.')
            if plot == 'bar':
                x = period
            elif calendar:
                try:
                    date = datetime.datetime.fromisoformat(period.replace('Z','+00:00'))
                    if date.tzinfo is None:
                        date=date.replace(tzinfo=datetime.timezone.utc)
                    x=(date-datetime.datetime(1970,1,1,tzinfo=datetime.timezone.utc)).total_seconds()*1000
                except ValueError:
                    raise ValueError('Line figures require numeric time or ISO dates/timestamps. Use bars for other time labels.') from None
            else:
                x=float(period)
            y = None if value is None else float(value)
            if y is not None and not math.isfinite(y):
                raise ValueError('Figure contains nonfinite values.')
            points.append({'x':x,'y':y,'n':count,'time':period})
        if not any(p['y'] is not None for p in points):
            raise ValueError('No observed values in this selection.')
        return {'type':plot,'series':[{'name':request.get('figureEntity') if method=='none' else method,'points':points}],
                'xlabel':time, 'ylabel':variable if method=='none' else f'{method}({variable})',
                'timeFormat':'timestamp' if calendar else 'number',
                'metadata':{'variable':variable,'aggregation':method,'scope':'all filtered source records',
                    'entity':request.get('figureEntity') if method=='none' else None,
                    'filters':request.get('filters',[]),'timeRange':request.get('timeRange'),
                    'inputCount':sum(p['n'] for p in points),'plottedCount':sum(p['y'] is not None for p in points),
                    'missingPolicy':'Missing values excluded from aggregates. Raw lines retain absent-period gaps. SD uses n-1.'}}
    raise ValueError('Unknown analysis action.')
