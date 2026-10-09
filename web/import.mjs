import { parseCSV, buildPanel } from './data.mjs';
import { MAX_BYTES, MAX_ROWS, MAX_CELLS } from './limits.mjs';

export function parseFile(text, name) {
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('File limit: 10 MB.');
  const extension = name.split('.').at(-1).toLowerCase();
  if (extension === 'csv' || extension === 'tsv') return parseCSV(text, extension === 'tsv' ? '\t' : ',');
  if (!['json', 'jsonl', 'ndjson'].includes(extension)) throw new Error('Supported formats: CSV, TSV, JSON, JSONL, NDJSON.');
  text = text.replace(/^\uFEFF/, '');
  // Retain numeric tokens as text before key selection. Modern runtimes expose
  // the original token even when converting it to Number would lose precision.
  const decode = source => JSON.parse(source, (key,value,context) => {
    if (typeof value !== 'number') return value;
    if (!Number.isFinite(value)) throw new Error('Nonfinite JSON number.');
    if (context?.source) return context.source;
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new Error('Quote large JSON numbers as strings in this browser.');
    return value;
  });
  const values = extension === 'json' ? decode(text) : text.split(/\r?\n/).filter(line => line.trim()).map(decode);
  if (!Array.isArray(values) || !values.length || values.length > MAX_ROWS) throw new Error('Expected 1–100,000 JSON records.');
  const headers = [];
  for (const row of values) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Each JSON record must be an object.');
    for (const [key, value] of Object.entries(row)) {
      if (!key.trim()) throw new Error('Column names cannot be empty.');
      if (value !== null && !['string','number'].includes(typeof value)) throw new Error(`Nested objects, arrays and booleans are unsupported: ${key}`);
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Nonfinite JSON number: ${key}`);
      if (!headers.includes(key)) headers.push(key);
    }
  }
  return {headers, rows:values.map(row => Object.fromEntries(headers.map(key => [key, !Object.hasOwn(row,key) || row[key] == null ? '' : String(row[key])])))};
}

// Wide-series columns are entities measuring ONE common variable, explicitly chosen by the user.
export function importTable(parsed, {mode = 'panel', entity, time, variables, timeFormat = 'number', entityName, measure, rowId = false}) {
  if (mode === 'cross-section' && rowId) {
    let key = '__row';
    while (parsed.headers.includes(key)) key += '_';
    const result = buildPanel({headers:[key,...parsed.headers],rows:parsed.rows.map((r,i) => ({...r,[key]:String(i+1)}))},key,null,variables,{kind:mode});
    result.entityColumn = 'Row'; result.entityLabelKey = 'rowNumber';
    return result;
  }
  if (mode === 'panel' || mode === 'cross-section') {
    return buildPanel(parsed, entity, mode === 'cross-section' ? null : time, variables, {timeFormat, kind:mode});
  }
  if (!['series', 'wide'].includes(mode)) throw new Error('Unknown data structure.');
  if (!parsed.headers.includes(time) || !variables.length || variables.includes(time) || variables.some(v => !parsed.headers.includes(v))) throw new Error('Choose a time column and separate numeric columns.');
  if (mode === 'wide' && !measure?.trim()) throw new Error('Name the common measure and its unit.');
  if (mode === 'series' && !entityName?.trim()) throw new Error('Name this time series entity.');
  // Internal keys cannot collide with any user column or variable name.
  let entityKey = '__entity';
  while (parsed.headers.includes(entityKey) || entityKey === measure) entityKey += '_';
  let timeKey = '__time';
  while (parsed.headers.includes(timeKey) || timeKey === measure) timeKey += '_';
  const measures = mode === 'wide' ? [measure.trim()] : variables;
  if (parsed.rows.length * (mode === 'wide' ? variables.length : 1) > MAX_ROWS) throw new Error('Limit: 100,000 records.');
  const rows = parsed.rows.flatMap(row => mode === 'wide'
    ? variables.map(column => ({[entityKey]:column, [timeKey]:row[time], [measures[0]]:row[column]}))
    : [{...row, [entityKey]:entityName.trim(), [timeKey]:row[time]}]);
  const result = buildPanel({headers:[entityKey,timeKey,...measures], rows}, entityKey, timeKey, measures, {timeFormat});
  result.entityColumn = 'Entity';
  result.entityLabelKey = 'entity';
  result.timeColumn = time;
  result.importMode = mode;
  return result;
}

// Append entities, never join observations or resolve collisions implicitly.
export function combinePanels(current, incoming) {
  if (current.kind === 'cross-section' || incoming.kind === 'cross-section') throw new Error('Combining series requires a time axis in both datasets.');
  if (current.timeFormat !== incoming.timeFormat) throw new Error('Use the same time format for both datasets. No automatic resampling.');
  if (current.variables.length !== incoming.variables.length || current.variables.some(v => !incoming.variables.includes(v))) throw new Error('Series must have the same measure names and units.');
  if (incoming.entities.some(entity => current.entities.includes(entity))) throw new Error('An entity with that name already exists. Choose distinct entity names.');
  const entities = [...current.entities, ...incoming.entities];
  const times = [...new Set([...current.times,...incoming.times])].sort((a,b) => a-b);
  const records = new Map([...current.records,...incoming.records]);
  if (records.size > MAX_ROWS || entities.length * times.length * current.variables.length > MAX_CELLS) throw new Error('Combined panel exceeds 100,000 records or 2,000,000 cells.');
  const ranges = Object.fromEntries(current.variables.map(variable => {
    const values = [...records.values()].map(record => record.values[variable]).filter(value => value !== null);
    return [variable,{min:values.length ? Math.min(...values) : 0,max:values.length ? Math.max(...values) : 1}];
  }));
  return {...current, entities, times, records, ranges, timeLabels:new Map([...current.timeLabels,...incoming.timeLabels]),
    rowCount:records.size, missingValues:current.missingValues+incoming.missingValues, absentRecords:entities.length*times.length-records.size};
}
